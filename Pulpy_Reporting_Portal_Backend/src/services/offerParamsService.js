/**
 * =====================================================
 * Offer Parameters Service
 * =====================================================
 * Manages dynamic parameters for offer tracking URLs
 * Supports placeholders like {click_id}, {source}, etc.
 * =====================================================
 */

import logger from '../utils/logger.js';


export class OfferParamsService {
    constructor(offerParamsRepository) {
        this.offerParamsRepository = offerParamsRepository;
    }
    /**
     * Create or update parameters for an offer
     * @param {number} offerId - Offer ID
     * @param {number} tenantId - Tenant ID
     * @param {Array} params - Array of parameter objects
     * @returns {Promise<void>}
     */
    async setOfferParams(offerId, tenantId, params = []) {
        try {
            await this.offerParamsRepository.setOfferParams(offerId, tenantId, params);
            logger.info(`Set ${params.length} parameters for offer ${offerId}`);
        } catch (error) {
            logger.error('Error setting offer params:', error);
            throw error;
        }
    }

    /**
     * Get parameters for an offer
     * @param {number} offerId - Offer ID
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Array>} - Array of parameter objects
     */
    async getOfferParams(offerId, tenantId) {
        try {
            return await this.offerParamsRepository.getOfferParams(offerId, tenantId);
        } catch (error) {
            logger.error('Error fetching offer params:', error);
            throw error;
        }
    }

    /**
     * Apply placeholders to a URL template
     * @param {string} urlTemplate - URL with placeholders like {click_id}
     * @param {Object} params - Key-value pairs for replacement
     * @returns {string} - URL with placeholders replaced
     */
    applyPlaceholders(urlTemplate, params = {}) {
        if (!urlTemplate) return '';

        return urlTemplate.replace(/{(\w+)}/g, (match, key) => {
            return params[key] || '';
        });
    }

    /**
     * Validate required parameters
     * @param {Array} offerParams - Offer parameter definitions
     * @param {Object} providedParams - Parameters provided in request
     * @returns {Object} - { valid: boolean, missing: Array }
     */
    validateRequiredParams(offerParams, providedParams = {}) {
        const missing = [];

        offerParams.forEach(param => {
            if (param.is_required && !providedParams[param.param_key]) {
                missing.push(param.param_key);
            }
        });

        return {
            valid: missing.length === 0,
            missing
        };
    }

    /**
     * Extract dynamic parameters from query string
     * Filters out standard tracking parameters
     * @param {Object} query - Query string object
     * @returns {Object} - Extra parameters
     */
    extractExtraParams(query) {
        const standardParams = [
            'offer_id',
            'pub_id',
            'publisher_id',
            'click_id',
            'rcid',
            'tid'
        ];

        const extraParams = {};

        Object.keys(query).forEach(key => {
            if (!standardParams.includes(key)) {
                extraParams[key] = query[key];
            }
        });

        return extraParams;
    }

    /**
     * Merge offer params with defaults
     * @param {Array} offerParams - Offer parameter definitions
     * @param {Object} providedParams - Parameters provided in request
     * @returns {Object} - Merged parameters with defaults applied
     */
    mergeWithDefaults(offerParams, providedParams = {}) {
        const merged = { ...providedParams };

        offerParams.forEach(param => {
            if (!merged[param.param_key] && param.default_value) {
                merged[param.param_key] = param.default_value;
            }
        });

        return merged;
    }
}

// (no singleton export)
