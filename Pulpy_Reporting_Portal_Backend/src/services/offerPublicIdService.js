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
     * Get offer by public_offer_id and tenant
     * @param {number} publicOfferId - Public offer ID
     * @param {number} tenantId - Tenant ID
     * @param {string} status - Optional status filter (default: 'live')
     * @returns {Promise<Object|null>} - Offer object or null
     */
    async getOfferByPublicId(publicOfferId, tenantId, status = 'live') {
        try {
            let query = `
        SELECT * FROM offers 
        WHERE tenant_id = ? 
        AND public_offer_id = ?
      `;
            const params = [tenantId, publicOfferId];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            query += ' LIMIT 1';

            const [rows] = await pool.query(query, params);
            return rows[0] || null;
        } catch (error) {
            logger.error('Error fetching offer by public_offer_id:', error);
            throw error;
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
