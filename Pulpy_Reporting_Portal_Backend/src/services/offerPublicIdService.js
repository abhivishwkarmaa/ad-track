/**
 * =====================================================
 * Offer Public ID Service
 * =====================================================
 * Handles stable public_offer_id generation per tenant
 * Ensures tracking URLs never break
 * =====================================================
 */

import pool from '../db/connection.js';
import redis from '../config/redis.js';
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
                    SELECT 
                        o.id, o.advertiser_id, o.tenant_id, o.public_offer_id, o.name, o.description, o.category, o.status, o.offer_visibility, o.offer_currency, o.country, o.advertiser_model, o.advertiser_amount, o.affiliate_model, o.affiliate_amount, o.offer_url, o.preview_url, o.token_type, o.macros_json, o.start_date, o.end_date, o.start_time, o.end_time, o.ip_action, o.ip_list, o.country_action, o.country_list, o.device_targeting_json, o.device_action, o.os_targeting_json, o.os_action, o.browser_targeting_json, o.browser_action, o.isp_targeting_json, o.carrier_targeting_json, o.city_targeting_json, o.capping_type, o.capping_duration, o.capping_action, o.fallback_type, o.daily_cap, o.monthly_cap, o.total_cap, o.conversion_cap, o.capping_conversions_duration, o.budget_cap, o.advertiser_capping_budget_duration, o.advertiser_capping_budget_amount, o.advertiser_over_capping, o.affiliate_over_capping, o.cap_action, o.fallback_enabled, o.fallback_url, o.fallback_offer_id, o.advertiser_postback_url, o.advertiser_postback_method, o.advertiser_postback_macros_json, o.system_postback_url, o.system_postback_method, o.system_postback_macros_json, o.created_at, o.updated_at,
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

                let fallbackQuery = `SELECT id, advertiser_id, tenant_id, public_offer_id, name, description, category, status, offer_visibility, offer_currency, country, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, offer_url, preview_url, token_type, macros_json, start_date, end_date, start_time, end_time, ip_action, ip_list, country_action, country_list, device_targeting_json, device_action, os_targeting_json, os_action, browser_targeting_json, browser_action, isp_targeting_json, carrier_targeting_json, city_targeting_json, capping_type, capping_duration, capping_action, fallback_type, daily_cap, monthly_cap, total_cap, conversion_cap, capping_conversions_duration, budget_cap, advertiser_capping_budget_duration, advertiser_capping_budget_amount, advertiser_over_capping, affiliate_over_capping, cap_action, fallback_enabled, fallback_url, fallback_offer_id, advertiser_postback_url, advertiser_postback_method, advertiser_postback_macros_json, system_postback_url, system_postback_method, system_postback_macros_json, created_at, updated_at FROM offers WHERE tenant_id = ? AND id = ?`;
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
                'SELECT id, public_advertiser_id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at FROM advertisers WHERE tenant_id = ? AND public_advertiser_id = ? LIMIT 1',
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
            const cacheKey = `map:publisher:${tenantId}:${publicPublisherId}`;
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && parsed.id && String(parsed.tenant_id) === String(tenantId)) {
                        return parsed;
                    }
                }
            } catch (e) {
                // non-fatal; fall through to DB
            }

            // 1. Try by Public ID first
            const [rows] = await pool.query(
                'SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE tenant_id = ? AND public_publisher_id = ? LIMIT 1',
                [tenantId, publicPublisherId]
            );
            if (rows[0]) {
                try {
                    const payload = {
                        id: rows[0].id,
                        public_publisher_id: rows[0].public_publisher_id,
                        email: rows[0].email,
                        first_name: rows[0].first_name,
                        company_name: rows[0].company_name,
                        country: rows[0].country,
                        global_postback_url: rows[0].global_postback_url,
                        status: rows[0].status,
                        tenant_id: rows[0].tenant_id,
                        created_at: rows[0].created_at,
                        updated_at: rows[0].updated_at,
                    };
                    await redis.setex(cacheKey, 60 * 60 * 12, JSON.stringify(payload));
                } catch (e) { /* ignore */ }
                return rows[0];
            }

            // 2. Fallback to Internal ID lookup (if integer provided)
            const [internalRows] = await pool.query(
                'SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE tenant_id = ? AND id = ? LIMIT 1',
                [tenantId, publicPublisherId] // Using publicPublisherId as likely internal ID here
            );
            const resolved = internalRows[0] || null;
            if (resolved?.id) {
                try {
                    const payload = {
                        id: resolved.id,
                        public_publisher_id: resolved.public_publisher_id,
                        email: resolved.email,
                        first_name: resolved.first_name,
                        company_name: resolved.company_name,
                        country: resolved.country,
                        global_postback_url: resolved.global_postback_url,
                        status: resolved.status,
                        tenant_id: resolved.tenant_id,
                        created_at: resolved.created_at,
                        updated_at: resolved.updated_at,
                    };
                    await redis.setex(cacheKey, 60 * 60 * 12, JSON.stringify(payload));
                } catch (e) { /* ignore */ }
            }
            return resolved;

        } catch (error) {
            // BACKWARD COMPAT: If column missing (unlikely now), try ID
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                const [internalRows] = await pool.query(
                    'SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE tenant_id = ? AND id = ? LIMIT 1',
                    [tenantId, publicPublisherId]
                );
                const resolved = internalRows[0] || null;
                if (resolved?.id) {
                    try {
                        const payload = {
                            id: resolved.id,
                            public_publisher_id: resolved.public_publisher_id,
                            email: resolved.email,
                            first_name: resolved.first_name,
                            company_name: resolved.company_name,
                            country: resolved.country,
                            global_postback_url: resolved.global_postback_url,
                            status: resolved.status,
                            tenant_id: resolved.tenant_id,
                            created_at: resolved.created_at,
                            updated_at: resolved.updated_at,
                        };
                        await redis.setex(`map:publisher:${tenantId}:${publicPublisherId}`, 60 * 60 * 12, JSON.stringify(payload));
                    } catch (e) { /* ignore */ }
                }
                return resolved;
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
