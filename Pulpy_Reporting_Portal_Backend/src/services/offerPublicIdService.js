/**
 * =====================================================
 * Offer Public ID Service
 * =====================================================
 * Handles stable public_offer_id generation per tenant
 * Ensures tracking URLs never break
 * =====================================================
 */

import logger from '../utils/logger.js';

export class OfferPublicIdService {
    constructor(publicIdRepository) {
        this.publicIdRepository = publicIdRepository;
    }

    async getPublicOfferId(internalOfferId, tenantId) {
        try {
            const publicOfferId = await this.publicIdRepository.getPublicId('offers', 'public_offer_id', 'id', internalOfferId, tenantId);
            return publicOfferId || internalOfferId;
        } catch (error) {
            return internalOfferId;
        }
    }

    async getPublicPublisherId(internalPublisherId, tenantId) {
        try {
            const publicPublisherId = await this.publicIdRepository.getPublicId('publishers', 'public_publisher_id', 'id', internalPublisherId, tenantId);
            return publicPublisherId || internalPublisherId;
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
            const nextId = await this.publicIdRepository.generateNextPublicId('offers', 'public_offer_id', tenantId);
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
            const nextId = await this.publicIdRepository.generateNextPublicId('advertisers', 'public_advertiser_id', tenantId);
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
            const nextId = await this.publicIdRepository.generateNextPublicId('publishers', 'public_publisher_id', tenantId);
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
            const nextId = await this.publicIdRepository.generateNextPublicId('publisher_offers', 'public_assignment_id', tenantId);
            logger.info(`Generated public_assignment_id ${nextId} for tenant ${tenantId}`);
            return nextId;
        } catch (error) {
            logger.error('Error generating public_assignment_id:', error);
            throw error;
        }
    }

    async getOfferByPublicId(publicOfferId, tenantId, status = 'live') {
        try {
            // Strictly use public_offer_id or display_id resolver
            // No internal ID fallback as per architectural requirement
            return await this.publicIdRepository.getOfferByPublicIdOrDisplayId(tenantId, publicOfferId, status);
        } catch (error) {
            logger.error('Error fetching offer by public_offer_id:', error);
            throw error;
        }
    }

    async getAdvertiserByPublicId(publicAdvertiserId, tenantId) {
        try {
            return await this.publicIdRepository.getEntityByPublicId('advertisers', 'public_advertiser_id', publicAdvertiserId, tenantId);
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') return null;
            throw error;
        }
    }

    async getPublisherByPublicId(publicPublisherId, tenantId) {
        try {
            // Strictly use public_publisher_id
            return await this.publicIdRepository.getEntityByPublicId('publishers', 'public_publisher_id', publicPublisherId, tenantId);
        } catch (error) {
            logger.error('Error fetching publisher by public_id:', error);
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
            const affectedRows = await this.publicIdRepository.archiveOffer(offerId, tenantId);

            if (affectedRows > 0) {
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


// (no singleton export)
