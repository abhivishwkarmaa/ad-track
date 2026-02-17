/**
 * =====================================================
 * Offer Public ID Service
 * =====================================================
 * Handles stable public_offer_id generation per tenant
 * Ensures tracking URLs never break
 * =====================================================
 */

import pool from '../db/connection.js';
import logger from '../utils/logger.js';

class OfferPublicIdService {
    /**
     * Get public_offer_id by internal ID
     */
    async getPublicOfferId(internalOfferId, tenantId) {
        try {
            const [rows] = await pool.query(
                'SELECT public_offer_id FROM offers WHERE id = ? AND tenant_id = ? LIMIT 1',
                [internalOfferId, tenantId]
            );
            return rows[0]?.public_offer_id || internalOfferId;
        } catch (error) {
            return internalOfferId;
        }
    }

    /**
     * Get public_publisher_id by internal ID
     */
    async getPublicPublisherId(internalPublisherId, tenantId) {
        try {
            const [rows] = await pool.query(
                'SELECT public_publisher_id FROM publishers WHERE id = ? AND tenant_id = ? LIMIT 1',
                [internalPublisherId, tenantId]
            );
            return rows[0]?.public_publisher_id || internalPublisherId;
        } catch (error) {
            return internalPublisherId;
        }
    }

    /**
     * Generate next public_offer_id for a tenant
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<number>} - Next available public_offer_id
     */
    async generatePublicOfferId(tenantId) {
        try {
            // Get the maximum public_offer_id for this tenant
            const [rows] = await pool.query(
                `SELECT COALESCE(MAX(public_offer_id), 0) + 1 AS next_id 
         FROM offers 
         WHERE tenant_id = ?`,
                [tenantId]
            );

            const nextId = rows[0]?.next_id || 1;

            logger.info(`Generated public_offer_id ${nextId} for tenant ${tenantId}`);

            return nextId;
        } catch (error) {
            logger.error('Error generating public_offer_id:', error);
            throw error;
        }
    }

    /**
     * Generate next public_advertiser_id for a tenant
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<number>} - Next available public_advertiser_id
     */
    async generatePublicAdvertiserId(tenantId) {
        try {
            const [rows] = await pool.query(
                `SELECT COALESCE(MAX(public_advertiser_id), 0) + 1 AS next_id 
         FROM advertisers 
         WHERE tenant_id = ?`,
                [tenantId]
            );

            const nextId = rows[0]?.next_id || 1;
            logger.info(`Generated public_advertiser_id ${nextId} for tenant ${tenantId}`);
            return nextId;
        } catch (error) {
            logger.error('Error generating public_advertiser_id:', error);
            throw error;
        }
    }

    /**
     * Generate next public_publisher_id for a tenant
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<number>} - Next available public_publisher_id
     */
    async generatePublicPublisherId(tenantId) {
        try {
            const [rows] = await pool.query(
                `SELECT COALESCE(MAX(public_publisher_id), 0) + 1 AS next_id 
         FROM publishers 
         WHERE tenant_id = ?`,
                [tenantId]
            );

            const nextId = rows[0]?.next_id || 1;
            logger.info(`Generated public_publisher_id ${nextId} for tenant ${tenantId}`);
            return nextId;
        } catch (error) {
            logger.error('Error generating public_publisher_id:', error);
            throw error;
        }
    }

    /**
     * Generate next public_assignment_id for a tenant
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<number>} - Next available public_assignment_id
     */
    async generatePublicAssignmentId(tenantId) {
        try {
            const [rows] = await pool.query(
                `SELECT COALESCE(MAX(public_assignment_id), 0) + 1 AS next_id 
         FROM publisher_offers 
         WHERE tenant_id = ?`,
                [tenantId]
            );

            const nextId = rows[0]?.next_id || 1;
            logger.info(`Generated public_assignment_id ${nextId} for tenant ${tenantId}`);
            return nextId;
        } catch (error) {
            logger.error('Error generating public_assignment_id:', error);
            throw error;
        }
    }

    /**
     * Get offer by public_offer_id and tenant
     * @param {number} publicOfferId - Public offer ID
     * @param {number} tenantId - Tenant ID
     * @param {string} status - Optional status filter (default: 'live')
     * @returns {Promise<Object|null>} - Offer object or null
     */
    async getOfferByPublicId(publicOfferId, tenantId, status = 'live') {
        try {
            // Use subquery to calculate display_id (sequential ID per tenant)
            const query = `
                SELECT * FROM (
                    SELECT o.*, 
                    (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
                    FROM offers o 
                    WHERE o.tenant_id = ?
                ) t 
                WHERE (t.public_offer_id = ? OR t.display_id = ?)
                ${status ? ' AND t.status = ?' : ''}
                LIMIT 1
            `;
            const params = [tenantId, publicOfferId, publicOfferId];
            if (status) params.push(status);

            const [rows] = await pool.query(query, params);
            return rows[0] || null;
        } catch (error) {
            // ✅ BACKWARD COMPATIBILITY: If public_offer_id column is missing, fallback to internal ID
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                logger.warn('⚠️ public_offer_id column request failed - falling back to internal ID lookup');

                let fallbackQuery = `SELECT * FROM offers WHERE tenant_id = ? AND id = ?`;
                const fallbackParams = [tenantId, publicOfferId]; // Assume publicOfferId matches internal ID for now

                if (status) {
                    fallbackQuery += ' AND status = ?';
                    fallbackParams.push(status);
                }

                fallbackQuery += ' LIMIT 1';

                const [rows] = await pool.query(fallbackQuery, fallbackParams);
                return rows[0] || null;
            }

            logger.error('Error fetching offer by public_offer_id:', error);
            throw error;
        }
    }

    /**
     * Get advertiser by public_advertiser_id and tenant
     */
    async getAdvertiserByPublicId(publicAdvertiserId, tenantId) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM advertisers WHERE tenant_id = ? AND public_advertiser_id = ? LIMIT 1',
                [tenantId, publicAdvertiserId]
            );
            return rows[0] || null;
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') return null;
            throw error;
        }
    }

    /**
     * Get publisher by public_publisher_id and tenant
     */
    async getPublisherByPublicId(publicPublisherId, tenantId) {
        try {
            // 1. Try by Public ID first
            const [rows] = await pool.query(
                'SELECT * FROM publishers WHERE tenant_id = ? AND public_publisher_id = ? LIMIT 1',
                [tenantId, publicPublisherId]
            );
            if (rows[0]) return rows[0];

            // 2. Fallback to Internal ID lookup (if integer provided)
            const [internalRows] = await pool.query(
                'SELECT * FROM publishers WHERE tenant_id = ? AND id = ? LIMIT 1',
                [tenantId, publicPublisherId] // Using publicPublisherId as likely internal ID here
            );
            return internalRows[0] || null;

        } catch (error) {
            // BACKWARD COMPAT: If column missing (unlikely now), try ID
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                const [internalRows] = await pool.query(
                    'SELECT * FROM publishers WHERE tenant_id = ? AND id = ? LIMIT 1',
                    [tenantId, publicPublisherId]
                );
                return internalRows[0] || null;
            }
            return null;
        }
    }

    /**
     * Archive an offer (soft delete)
     * @param {number} offerId - Internal offer ID
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<boolean>} - Success status
     */
    async archiveOffer(offerId, tenantId) {
        try {
            const [result] = await pool.query(
                `UPDATE offers 
         SET status = 'archived', updated_at = UTC_TIMESTAMP() 
         WHERE id = ? AND tenant_id = ?`,
                [offerId, tenantId]
            );

            if (result.affectedRows > 0) {
                logger.info(`Archived offer ${offerId} for tenant ${tenantId}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error archiving offer:', error);
            throw error;
        }
    }

    /**
     * Validate offer status for tracking
     * @param {Object} offer - Offer object
     * @returns {Object} - { valid: boolean, message: string }
     */
    validateOfferForTracking(offer) {
        if (!offer) {
            return {
                valid: false,
                message: 'Offer not found',
                error_type: 'offer_not_found'
            };
        }

        // Only active offers can accept clicks
        if (offer.status !== 'live') {
            return {
                valid: false,
                message: `Offer is ${offer.status}. Only live offers can accept traffic.`,
                error_type: 'offer_not_live'
            };
        }

        // Check date validity
        const now = new Date();

        if (offer.start_date) {
            const startDate = new Date(offer.start_date);
            startDate.setHours(0, 0, 0, 0);

            if (now < startDate) {
                return {
                    valid: false,
                    message: `Offer has not started yet. Start date: ${offer.start_date}`,
                    error_type: 'offer_not_started'
                };
            }
        }

        if (offer.end_date) {
            const endDate = new Date(offer.end_date);
            endDate.setHours(23, 59, 59, 999);

            if (now > endDate) {
                return {
                    valid: false,
                    message: `Offer has expired. End date: ${offer.end_date}`,
                    error_type: 'offer_expired'
                };
            }
        }

        return {
            valid: true,
            message: 'Offer is valid for tracking',
            error_type: null
        };
    }
}

export default new OfferPublicIdService();
