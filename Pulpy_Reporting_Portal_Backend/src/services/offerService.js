import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class OfferService {
  constructor(offerRepository) {
    this.offerRepository = offerRepository;
  }

  async create(data, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenant_id for offer creation
      if (!tenantId) {
        const err = new Error('Tenant context required to create offer');
        err.statusCode = 400;
        throw err;
      }

      // Generate unique URL key
      const urlKey = this.generateUrlKey(data.name);
      // Ensure nullable dates have safe defaults for MySQL
      const startAt = data.start_at || new Date();
      const endAt = data.end_at || null;

      // ✅ CRITICAL: Include tenant_id in INSERT
      const result = await this.offerRepository.insertOfferLegacy({
        name: data.name,
        category: data.category,
        advertiserRevenue: data.advertiser_revenue,
        affiliateModelCost: data.affiliate_model_cost,
        startAt,
        endAt,
        offerUrl: data.offer_url,
        previewUrl: data.preview_url || null,
        cappingPerDay: data.capping_per_day || 0,
        fallbackUrl: data.fallback_url || null,
        status: data.status || 'pending',
        urlKey,
        tenantId,
      });

      const insertId = result.insertId || result[0]?.insertId;
      // ✅ CRITICAL: Fetch with tenant_id filtering
      return await this.offerRepository.findOfferByIdLegacy({ id: insertId, tenantId });
    } catch (error) {
      logger.error('OfferService.create error:', error);
      throw error;
    }
  }

  generateUrlKey(name) {
    // Generate a short unique key from name
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    const unique = uuidv4().substring(0, 8);
    return `${base}-${unique}`;
  }

  async findById(id, tenantId = null) {
    const offer = await this.offerRepository.findOfferByIdLegacy({ id, tenantId });
    if (tenantId && offer && offer.tenant_id !== tenantId) return null;
    return offer;
  }

  /**
   * Check if offer is valid for operations (clicks, conversions, etc.)
   * @param {Object} offer - Offer object from database
   * @param {boolean} checkTimeRestrictions - Whether to check time restrictions (default: false for clicks, true for conversions)
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  checkOfferValidity(offer, checkTimeRestrictions = false) {
    if (!offer) {
      return {
        valid: false,
        message: 'Offer not found',
        error_type: 'offer_not_found'
      };
    }

    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not live. Current status: ${offer.status}. Only live offers can accept traffic.`,
        error_type: 'offer_not_live'
      };
    }

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date);
      endDate.setHours(23, 59, 59, 999); // End of day

      if (now > endDate) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}. The offer is no longer accepting traffic.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      const startDate = new Date(offer.start_date);
      startDate.setHours(0, 0, 0, 0); // Start of day

      if (now < startDate) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}. The offer will become active on this date.`,
          error_type: 'offer_not_started'
        };
      }
    }

    // Check time restrictions (for conversions)
    if (checkTimeRestrictions) {
      if (offer.start_time && offer.end_time) {
        if (currentTime < offer.start_time || currentTime > offer.end_time) {
          return {
            valid: false,
            message: `Conversion outside allowed time window. Allowed: ${offer.start_time} - ${offer.end_time}, Current: ${currentTime}`,
            error_type: 'offer_time_restricted'
          };
        }
      } else if (offer.start_time) {
        if (currentTime < offer.start_time) {
          return {
            valid: false,
            message: `Conversion before allowed start time. Start time: ${offer.start_time}, Current: ${currentTime}`,
            error_type: 'offer_time_restricted'
          };
        }
      } else if (offer.end_time) {
        if (currentTime > offer.end_time) {
          return {
            valid: false,
            message: `Conversion after allowed end time. End time: ${offer.end_time}, Current: ${currentTime}`,
            error_type: 'offer_time_restricted'
          };
        }
      }
    }

    return {
      valid: true,
      message: 'Offer is valid and active',
      error_type: null
    };
  }

  async findByIdWithDetails(id, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenantId for tenant isolation
      if (!tenantId) {
        const err = new Error('Tenant context required');
        err.statusCode = 400;
        throw err;
      }

      // Get offer details with tenant_id filtering
      const offer = await this.findById(id, tenantId);
      if (!offer) {
        return null;
      }

      // Get advertiser details if advertiser_id exists (with tenant_id filtering)
      let advertiser = null;
      if (offer.advertiser_id) {
        advertiser = await this.offerRepository.findAdvertiserById({ advertiserId: offer.advertiser_id, tenantId });
      }

      // ✅ CRITICAL: Get assigned publishers (assignments) with tenant_id filtering
      const assignments = await this.offerRepository.findAssignmentsForOffer({ offerId: id, tenantId });

      // Format assignments
      const formattedAssignments = assignments.map(assignment => ({
        id: assignment.id,
        publisher_id: assignment.publisher_id,
        publisher_email: assignment.publisher_email,
        publisher_first_name: assignment.publisher_first_name,
        publisher_company: assignment.publisher_company,
        publisher_country: assignment.publisher_country,
        publisher_status: assignment.publisher_status,
        payout_override: assignment.payout_override,
        cap_override: assignment.cap_override,
        conversion_approval_percentage: assignment.conversion_approval_percentage,
        capping_budget: assignment.capping_budget_duration ? {
          duration: assignment.capping_budget_duration,
          amount: assignment.capping_budget_amount,
        } : null,
        capping_conversions: assignment.capping_conversions_duration ? {
          duration: assignment.capping_conversions_duration,
          amount: assignment.capping_conversions_amount,
        } : null,
        callback_url: assignment.callback_url,
        destination_url: assignment.destination_url,
        notes: assignment.notes,
        status: assignment.status,
        assigned_at: assignment.assigned_at,
      }));

      // ✅ CRITICAL: Get statistics with tenant_id filtering in all subqueries
      const stats = await this.offerRepository.getOfferStatsForDetail({ offerId: id, tenantId });

      // Calculate conversion rate
      const conversionRate = stats.total_clicks > 0
        ? ((stats.total_conversions || 0) / stats.total_clicks) * 100
        : 0;

      // Get recent clicks (last 50)
      const recentClicks = await this.offerRepository.getRecentClicksForOffer({ offerId: id, tenantId, limit: 50 });

      // Get recent conversions (last 50)
      const recentConversions = await this.offerRepository.getRecentConversionsForOffer({ offerId: id, tenantId, limit: 50 });

      // Get clicks by publisher
      const clicksByPublisher = await this.offerRepository.getClicksByPublisherForOffer({ offerId: id, tenantId });

      return {
        ...offer,
        advertiser,
        assignments: formattedAssignments,
        statistics: {
          total_clicks: parseInt(stats.total_clicks || 0),
          unique_publishers: parseInt(stats.unique_publishers || 0),
          total_impressions: parseInt(stats.total_impressions || 0),
          total_conversions: parseInt(stats.total_conversions || 0),
          approved_conversions: parseInt(stats.approved_conversions || 0),
          pending_conversions: parseInt(stats.pending_conversions || 0),
          rejected_conversions: parseInt(stats.rejected_conversions || 0),
          total_revenue: parseFloat(stats.total_revenue || 0),
          total_payout: parseFloat(stats.total_payout || 0),
          total_profit: parseFloat(stats.total_profit || 0),
          conversion_rate: parseFloat(conversionRate.toFixed(2)),
        },
        recent_clicks: recentClicks,
        recent_conversions: recentConversions,
        clicks_by_publisher: clicksByPublisher,
      };
    } catch (error) {
      logger.error('OfferService.findByIdWithDetails error:', error);
      throw error;
    }
  }

  async findByUrlKey(urlKey) {
    // ✅ CRITICAL: URL key lookup should also consider tenant_id if provided
    // Note: url_key uniqueness should be per-tenant, but for now we'll allow cross-tenant url_keys
    // If tenant_id is provided, filter by it
    const params = [urlKey];

    // If tenant_id is provided, filter by it (for tenant isolation)
    // If not provided, return first match (backward compatibility)
    // TODO: Consider making url_key unique per tenant in database
    return await this.offerRepository.findOfferByUrlKey({ urlKey });
  }

  async findAll(filters = {}, tenantId = null) {
    // ✅ CRITICAL: Require tenant_id for listing offers
    if (!tenantId) {
      const err = new Error('Tenant context required to list offers');
      err.statusCode = 400;
      throw err;
    }

    return await this.offerRepository.listOffersLegacy({
      tenantId,
      status: filters.status || null,
      category: filters.category || null,
      live: Boolean(filters.live),
    });
  }

  async getLive(tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required');
      err.statusCode = 400;
      throw err;
    }
    return this.findAll({ live: true }, tenantId);
  }

  async getApproved(tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required');
      err.statusCode = 400;
      throw err;
    }
    return this.findAll({ status: 'active' }, tenantId);
  }

  async getAll(tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required');
      err.statusCode = 400;
      throw err;
    }
    return this.findAll({}, tenantId);
  }

  async getCategories() {
    return await this.offerRepository.listOfferCategories();
  }

  async updateStatus(id, status) {
    await this.offerRepository.updateOfferStatus({ id, status });
    return this.findById(id);
  }

  async update(id, data) {
    const fields = [];
    const params = [];

    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = UTC_TIMESTAMP()`);
    params.push(id);

    await this.offerRepository.updateOfferById({ id, fields, params });
    return this.findById(id);
  }

  async checkCapping(offerId, publisherId, publisherOfferId = null) {
    const utcToday = new Date().toISOString().split('T')[0];

    // Get cap limit
    let capLimit = null;
    if (publisherOfferId) {
      const override = await this.offerRepository.getAssignmentCapOverride({ publisherOfferId });
      if (override) capLimit = override;
    }

    if (!capLimit) {
      capLimit = await this.offerRepository.getOfferCappingPerDay({ offerId });
    }

    if (capLimit === 0) {
      return { capped: false, count: 0, limit: 0 };
    }

    const count = await this.offerRepository.countClicksForOfferPublisherOnUtcDay({
      offerId,
      publisherId,
      utcDate: utcToday,
    });

    return {
      capped: count >= capLimit,
      count,
      limit: capLimit,
    };
  }

  async getStats() {
    return await this.offerRepository.getOffersStatsSummary();
  }

  async softDelete(id) {
    await this.offerRepository.softDeleteOffer({ id });
    return this.findById(id);
  }
}

// (no singleton export)

