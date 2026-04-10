import logger from '../utils/logger.js';
import { normalizeMysqlUtcDatetime } from '../utils/mysqlUtcRange.js';
import { getTenantIdFromRequest, addTenantScope } from '../utils/tenantScope.js';

const jsonFields = [
  'macros_json',
  'device_targeting_json',
  'os_targeting_json',
  'browser_targeting_json',
  'isp_targeting_json',
  'carrier_targeting_json',
  'city_targeting_json',
  'advertiser_postback_macros_json',
  'system_postback_macros_json',
];

const toJsonOrNull = (val) =>
  val === undefined || val === null ? null : JSON.stringify(val);

export class OfferService {
  constructor(offerPublicIdService, offerParamsService, cacheService, offerRepository, assignmentRepository) {
    this.offerPublicIdService = offerPublicIdService;
    this.offerParamsService = offerParamsService;
    this.cacheService = cacheService;
    this.offerRepository = offerRepository;
    this.assignmentRepository = assignmentRepository;
  }
  /**
   * Check if offer is valid for operations (clicks, conversions, etc.)
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  checkOfferValidity(offer) {
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

    return {
      valid: true,
      message: 'Offer is valid and active',
      error_type: null
    };
  }

  /**
   * Validate offer dates and status for create/update operations
   * @param {Object} offerData - Offer data to validate
   * @param {Object} existingOffer - Existing offer (for updates)
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferDatesAndStatus(offerData, existingOffer = null) {
    const now = new Date();

    // Check if offer has expired (end_date passed)
    const endDate = offerData.end_date || (existingOffer ? existingOffer.end_date : null);
    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999); // End of day

      if (now > endDateObj) {
        return {
          valid: false,
          message: `Offer has expired. End date (${endDate}) has already passed. Cannot create or update expired offers.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if status is being set to 'live' but offer has expired
    const status = offerData.status || (existingOffer ? existingOffer.status : null);
    if (status === 'live' && endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      if (now > endDateObj) {
        return {
          valid: false,
          message: `Cannot set offer status to 'live': Offer has expired. End date (${endDate}) has already passed.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if trying to set status to 'live' but offer is not live
    if (status && status !== 'live' && existingOffer && existingOffer.status !== 'live') {
      // This is just informational, not blocking
    }

    return {
      valid: true,
      message: 'Offer validation passed',
      error_type: null
    };
  }

  async createOffer(data) {
    const tenantId = data.tenant_id;
    try {
      // ✅ CRITICAL: Validate advertiser exists and belongs to tenant
      if (data.advertiser_id) {
        const advertiser = await this.offerRepository.findAdvertiserIdTenant({
          advertiserId: data.advertiser_id,
          tenantId,
        });
        if (!advertiser) {
          const err = new Error('Advertiser not found or does not belong to this tenant');
          err.statusCode = 400;
          throw err;
        }
        if (tenantId && advertiser.tenant_id !== tenantId) {
          const err = new Error('Advertiser does not belong to this tenant');
          err.statusCode = 403;
          throw err;
        }
      }

      // Validate offer dates and status
      const validation = this.validateOfferDatesAndStatus(data);
      if (!validation.valid) {
        const err = new Error(validation.message);
        err.statusCode = 400;
        throw err;
      }

      // 🔥 NEW: Generate stable public_offer_id
      const publicOfferId = await this.offerPublicIdService.generatePublicOfferId(tenantId);
      logger.info(`Generated public_offer_id ${publicOfferId} for new offer in tenant ${tenantId}`);

      const result = await this.offerRepository.createOffer({ data, tenantId, publicOfferId });
      const insertId = result.insertId ?? result?.[0]?.insertId;

      // 🔥 NEW: Save offer parameters if provided
      if (data.offer_params && Array.isArray(data.offer_params) && data.offer_params.length > 0) {
        await this.offerParamsService.setOfferParams(insertId, tenantId, data.offer_params);
        logger.info(`Saved ${data.offer_params.length} parameters for offer ${insertId}`);
      }

      // ✅ CRITICAL: Fetch with tenant_id filtering
      return this.getOfferById(insertId, tenantId);
    } catch (error) {
      logger.error('OfferService.createOffer error:', error);
      throw error;
    }
  }

  async updateOffer(id, data, tenantId = null) {
    try {
      if (data.advertiser_id !== undefined && data.advertiser_id !== null) {
        // ✅ CRITICAL: Validate advertiser exists and belongs to tenant
        const advertiser = await this.offerRepository.findAdvertiserIdTenant({
          advertiserId: data.advertiser_id,
          tenantId,
        });
        if (!advertiser) {
          const err = new Error('Advertiser not found or does not belong to this tenant');
          err.statusCode = 400;
          throw err;
        }
        if (tenantId && advertiser.tenant_id !== tenantId) {
          const err = new Error('Advertiser does not belong to this tenant');
          err.statusCode = 403;
          throw err;
        }
      }

      // Get existing offer for validation (with tenant isolation)
      const existingOffer = await this.getOfferById(id, tenantId);
      if (!existingOffer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
      }
      const internalId = existingOffer.id;

      // ✅ CRITICAL: Verify offer belongs to tenant
      if (tenantId && existingOffer.tenant_id !== tenantId) {
        const err = new Error('Offer does not belong to this tenant');
        err.statusCode = 403;
        throw err;
      }

      // Validate offer dates and status
      const validation = this.validateOfferDatesAndStatus(data, existingOffer);
      if (!validation.valid) {
        const err = new Error(validation.message);
        err.statusCode = 400;
        throw err;
      }

      // Pre-process capping_amount mapping for update
      if (data.capping_amount !== undefined) {
        if (data.capping_type === 'budget' || (data.capping_type === undefined && existingOffer.capping_type === 'budget')) {
          data.budget_cap = data.capping_amount;
        } else if (data.capping_type === 'conversion' || (data.capping_type === undefined && existingOffer.capping_type === 'conversion')) {
          data.conversion_cap = data.capping_amount;
        }
      }

      const result = await this.offerRepository.updateOffer({ id: internalId, tenantId, data });
      if (!result.affectedRows) {
        return null;
      }

      await this.cacheService.invalidateOffer(internalId, tenantId);

      return this.getOfferById(internalId, tenantId);
    } catch (error) {
      logger.error('OfferService.updateOffer error:', error);
      throw error;
    }
  }

  /**
   * Resolve public_offer_id to internal offer id ONLY.
   * No fallback to internal ID lookup for frontend-originated requests.
   */
  async getInternalOfferIdByPublicId(publicOfferId, tenantId) {
    if (publicOfferId == null || !tenantId) return null;

    // Use resolver that ONLY checks public_offer_id or the sequential display_id
    // This satisfies "no internal id fallback" requirement
    return await this.offerRepository.resolveInternalOfferIdByPublicOrDisplay({
      tenantId,
      publicOrDisplayId: publicOfferId,
    });
  }

  async getOfferById(id, tenantId = null) {
    if (id === undefined || id === null || !tenantId) return null;

    // Resolve ONLY by public_offer_id or sequential display_id
    const offer = await this.offerRepository.findOfferByPublicOrDisplay({
      tenantId,
      publicOrDisplayId: id,
    });

    return offer || null;
  }

  async getOfferByIdWithDetails(id, timezone = '+00:00', tenantId = null) {
    try {
      // Get offer details (with tenant isolation)
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) {
        return null;
      }

      // Parse JSON fields
      const parseJsonFields = (offer) => {
        jsonFields.forEach((field) => {
          if (offer[field]) {
            try {
              offer[field] = typeof offer[field] === 'string' ? JSON.parse(offer[field]) : offer[field];
            } catch (e) {
              offer[field] = null;
            }
          } else {
            offer[field] = null;
          }
        });
        return offer;
      };
      const parsedOffer = parseJsonFields({ ...offer });

      // Get advertiser details if advertiser_id exists (with tenant isolation)
      let advertiser = null;
      if (parsedOffer.advertiser_id) {
        advertiser = await this.offerRepository.findAdvertiserDetailsOptionalTenant({
          advertiserId: parsedOffer.advertiser_id,
          tenantId,
        });
        if (tenantId && advertiser && advertiser.tenant_id !== tenantId) advertiser = null;
      }

      return {
        ...parsedOffer,
        advertiser,
      };
    } catch (error) {
      logger.error('OfferService.getOfferByIdWithDetails error:', error);
      throw error;
    }
  }

  async getOfferAssignments(id, tenantId = null) {
    try {
      // 1. Resolve by public_offer_id only (same as detail page URL) so we don't mix in other offers
      const internalId = await this.getInternalOfferIdByPublicId(
        id != null ? Number(id) : null,
        tenantId
      );
      if (!internalId) return [];

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation

      const assignments = await this.offerRepository.findOfferAssignmentsByInternalOfferId({
        offerId: internalId,
        tenantId,
      });

      // Return public_assignment_id as id so getTrackingUrl(id) finds the correct assignment by public id (avoids wrong offer_id in tracking URL)
      return assignments.map(assignment => ({
        id: assignment.public_assignment_id ?? assignment.id,
        publisher_id: assignment.public_publisher_id ?? assignment.publisher_id,
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
    } catch (error) {
      logger.error('OfferService.getOfferAssignments error:', error);
      throw error;
    }
  }

  async getOfferStats(id, tenantId = null, filters = {}) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) {
        return {
          total_clicks: 0,
          unique_clicks: 0,
          unique_publishers: 0,
          total_impressions: 0,
          total_conversions: 0,
          approved_conversions: 0,
          pending_conversions: 0,
          rejected_conversions: 0,
          total_revenue: 0,
          total_payout: 0,
          total_profit: 0,
          conversion_rate: 0,
          cap_usage: {
            daily_cap: 0,
            daily_used: 0,
            monthly_cap: 0,
            monthly_used: 0,
            total_cap: 0,
            total_used: 0,
          },
        };
      }
      const internalId = offer.id;

      const dateFrom = filters?.date_from || null;
      const dateTo = filters?.date_to || null;
      const toUtcStart = (ymd) => `${ymd} 00:00:00`;
      const toUtcEnd = (ymd) => `${ymd} 23:59:59`;
      const rs = normalizeMysqlUtcDatetime(filters?.range_start_utc);
      const re = normalizeMysqlUtcDatetime(filters?.range_end_utc);
      let rangeStart;
      let rangeEndExclusive;
      if (rs && re) {
        rangeStart = rs;
        rangeEndExclusive = re;
      } else {
        rangeStart = dateFrom ? toUtcStart(dateFrom) : null;
        rangeEndExclusive = dateTo ? toUtcEnd(dateTo) : null;
      }

      const buildTimeFilteredWhere = (tableAlias = '') => {
        const prefix = tableAlias ? `${tableAlias}.` : '';
        let clause = `${prefix}offer_id = ?`;
        const params = [internalId];

        if (tenantId) {
          clause += ` AND ${prefix}tenant_id = ?`;
          params.push(tenantId);
        }
        if (rangeStart) {
          clause += ` AND ${prefix}created_at >= ?`;
          params.push(rangeStart);
        }
        if (rangeEndExclusive) {
          clause += ` AND ${prefix}created_at <= ?`;
          params.push(rangeEndExclusive);
        }

        return { clause, params };
      };

      const clicksWhere = buildTimeFilteredWhere();
      const clickStats = await this.offerRepository.getOfferClickAggregates({
        offerId: internalId,
        tenantId,
        rangeStart,
        rangeEnd: rangeEndExclusive,
      });
      const impressionsStats = await this.offerRepository.getOfferImpressionAggregate({
        offerId: internalId,
        tenantId,
        rangeStart,
        rangeEnd: rangeEndExclusive,
      });

      const convWhere = buildTimeFilteredWhere();
      const conversionStats = await this.offerRepository.getOfferConversionAggregates({
        offerId: internalId,
        tenantId,
        rangeStart,
        rangeEnd: rangeEndExclusive,
      });

      const conversionRate = (clickStats.total_clicks || 0) > 0
        ? ((conversionStats.total_conversions || 0) / clickStats.total_clicks) * 100
        : 0;

      const totalRevenue = parseFloat(conversionStats.total_revenue || 0);
      const approvedPayout = parseFloat(conversionStats.approved_payout || 0);
      const totalProfit = totalRevenue - approvedPayout;

      const utcToday = new Date().toISOString().split('T')[0];
      const refDate = dateTo || dateFrom || utcToday;
      const [year, month] = refDate.split('-').map(Number);
      const monthStartDate = new Date(year, month - 1, 1);
      const monthEndDate = new Date(year, month, 0);
      const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const monthStart = `${toYmd(monthStartDate)} 00:00:00`;
      const monthEnd = `${toYmd(monthEndDate)} 23:59:59`;
      const dayStart = `${refDate} 00:00:00`;
      const dayEnd = `${refDate} 23:59:59`;

      const dailyUsed = await this.offerRepository.countClicksForCapUsage({
        offerId: internalId,
        tenantId,
        rangeStart: dayStart,
        rangeEnd: dayEnd,
      });
      const monthlyUsed = await this.offerRepository.countClicksForCapUsage({
        offerId: internalId,
        tenantId,
        rangeStart: monthStart,
        rangeEnd: monthEnd,
      });
      const totalUsed = await this.offerRepository.countClicksForCapUsage({
        offerId: internalId,
        tenantId,
      });

      return {
        total_clicks: parseInt(clickStats.total_clicks || 0),
        unique_clicks: parseInt(clickStats.unique_clicks || 0),
        unique_publishers: parseInt(clickStats.unique_publishers || 0),
        total_impressions: parseInt(impressionsStats.total_impressions || 0),
        total_conversions: parseInt(conversionStats.total_conversions || 0),
        approved_conversions: parseInt(conversionStats.approved_conversions || 0),
        pending_conversions: parseInt(conversionStats.pending_conversions || 0),
        rejected_conversions: parseInt(conversionStats.rejected_conversions || 0),
        click_expired_conversions: parseInt(conversionStats.click_expired_conversions || 0),
        click_expired: parseInt(conversionStats.click_expired_conversions || 0),
        total_revenue: totalRevenue,
        approved_revenue: parseFloat(conversionStats.approved_revenue || 0),
        pending_revenue: parseFloat(conversionStats.pending_revenue || 0),
        total_payout: parseFloat(conversionStats.total_payout || 0),
        approved_payout: approvedPayout,
        pending_payout: parseFloat(conversionStats.pending_payout || 0),
        total_profit: totalProfit,
        conversion_rate: parseFloat(conversionRate.toFixed(2)),
        cap_usage: {
          daily_cap: parseInt(offer.daily_cap || 0),
          daily_used: parseInt(dailyUsed || 0),
          monthly_cap: parseInt(offer.monthly_cap || 0),
          monthly_used: parseInt(monthlyUsed || 0),
          total_cap: parseInt(offer.total_cap || 0),
          total_used: parseInt(totalUsed || 0),
        },
      };
    } catch (error) {
      logger.error('OfferService.getOfferStats error:', error);
      throw error;
    }
  }

  async getOfferRecentClicks(id, tenantId = null) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      return await this.offerRepository.getRecentClicksForOffer({ offerId: internalId, tenantId, limit: 50 });
    } catch (error) {
      logger.error('OfferService.getOfferRecentClicks error:', error);
      throw error;
    }
  }

  async getOfferRecentConversions(id, tenantId = null) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      return await this.offerRepository.getRecentConversionsForOffer({ offerId: internalId, tenantId, limit: 50 });
    } catch (error) {
      logger.error('OfferService.getOfferRecentConversions error:', error);
      throw error;
    }
  }

  async getOfferPublisherStats(id, tenantId = null, filters = {}) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      const dateFrom = filters?.date_from || null;
      const dateTo = filters?.date_to || null;
      const toUtcStart = (ymd) => `${ymd} 00:00:00`;
      const toUtcEnd = (ymd) => `${ymd} 23:59:59`;
      const rs = normalizeMysqlUtcDatetime(filters?.range_start_utc);
      const re = normalizeMysqlUtcDatetime(filters?.range_end_utc);
      let rangeStart;
      let rangeEnd;
      if (rs && re) {
        rangeStart = rs;
        rangeEnd = re;
      } else {
        rangeStart = dateFrom ? toUtcStart(dateFrom) : null;
        rangeEnd = dateTo ? toUtcEnd(dateTo) : null;
      }

      // ✅ ARCHITECTURE: SQL moved to this.offerRepository.getOfferPerformance
      const rows = await this.offerRepository.getOfferPerformance({
        internalId, tenantId, rangeStart, rangeEnd
      });
    }
  }

  async getOfferDailyStats(id, timezone = '+00:00', tenantId = null) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';

      // Robust timezone handling - use DATE_ADD/SUB for offsets to avoid CONVERT_TZ dependency on system tables
      let dateExpression;
      const isOffset = /^[+-]\d{2}:\d{2}$/.test(timezone);

      if (isOffset) {
        const sign = timezone.startsWith('+') ? '+' : '-';
        const time = timezone.substring(1);
        // Safe to inject as it's validated by regex
        dateExpression = `DATE_${sign === '+' ? 'ADD' : 'SUB'}(created_at, INTERVAL '${time}' HOUR_MINUTE)`;
      } else {
        // Fallback for named timezones (requires populated timezone tables)
        // Validate strictly to prevent injection
        if (!/^[a-zA-Z0-9_\/\+\-]+$/.test(timezone)) {
          timezone = '+00:00';
        }
        dateExpression = `CONVERT_TZ(created_at, '+00:00', '${timezone}')`;
      }

      // Params only for WHERE clause now
      const params = [internalId];
      if (tenantId) params.push(tenantId);

      const dailyClicksRows = await this.offerRepository.getOfferDailyCounts({
        table: 'clicks',
        offerId: internalId,
        tenantId,
        timezone,
      });

      const dailyConversionsRows = await this.offerRepository.getOfferDailyCounts({
        table: 'conversions',
        offerId: internalId,
        tenantId,
        timezone,
      });

      // Merge daily stats
      const dailyStatsMap = new Map();

      (Array.isArray(dailyClicksRows) ? dailyClicksRows : []).forEach(row => {
        const dateStr = row.date;
        if (!dailyStatsMap.has(dateStr)) {
          dailyStatsMap.set(dateStr, { date: dateStr, clicks: 0, conversions: 0 });
        }
        dailyStatsMap.get(dateStr).clicks = row.count;
      });

      (Array.isArray(dailyConversionsRows) ? dailyConversionsRows : []).forEach(row => {
        const dateStr = row.date;
        if (!dailyStatsMap.has(dateStr)) {
          dailyStatsMap.set(dateStr, { date: dateStr, clicks: 0, conversions: 0 });
        }
        dailyStatsMap.get(dateStr).conversions = row.count;
      });
      return Array.from(dailyStatsMap.values())
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      logger.error('OfferService.getOfferDailyStats error:', error);
      throw error;
    }
  }



  async listOffers(filters = {}, tenantId = null) {
    const conditions = [];
    const params = [];

    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    if (tenantId) {
      conditions.push('o.tenant_id = ?');
      params.push(tenantId);
    }

    if (filters.type) {
      conditions.push('o.status = ?');
      params.push(filters.type);
    }

    if (filters.advertiser_id) {
      conditions.push('o.advertiser_id = ?');
      params.push(filters.advertiser_id);
    }

    if (filters.category) {
      conditions.push('o.category = ?');
      params.push(filters.category);
    }

    if (filters.offer_visibility) {
      conditions.push('o.offer_visibility = ?');
      params.push(filters.offer_visibility);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push('(o.name LIKE ? OR o.description LIKE ?)');
      params.push(term, term);
    }

    const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const listSql = `
      SELECT o.*,
      a.name as advertiser_name,
      a.public_advertiser_id,
      (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
      FROM offers o
      LEFT JOIN advertisers a ON o.advertiser_id = a.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await this.offerRepository.listOffersPaginated({ whereClause, params, limit, offset });

    const countSql = `
      SELECT COUNT(*) AS total
      FROM offers o
      ${whereClause}
    `;
    const total = await this.offerRepository.countOffers({ whereClause, params });

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async searchOffers(filters = {}, tenantId = null) {
    const term = (filters.q || '').trim();
    if (!term) {
      return [];
    }

    const limit = Number(filters.limit) > 0 ? Math.min(Number(filters.limit), 50) : 10;
    const wildcardTerm = `%${term}%`;

    const conditions = [];
    const params = [];

    if (tenantId) {
      conditions.push('o.tenant_id = ?');
      params.push(tenantId);
    }

    conditions.push('(o.name LIKE ? OR o.description LIKE ? OR CAST(o.public_offer_id AS CHAR) LIKE ?)');
    params.push(wildcardTerm, wildcardTerm, wildcardTerm);

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const startsWithTerm = `${term}%`;
    const rows = await this.offerRepository.searchOffersQuick({ 
      whereClause, 
      params, 
      startsWithTerm, 
      limit 
    });
    return Array.isArray(rows) ? rows : [];
  }

  async deleteOffer(id, tenantId = null) {
    try {
      // 🔥 CHANGED: Archive instead of delete to preserve tracking URLs
      // Offers are NEVER deleted, only archived
      logger.warn(`Archiving offer ${id} instead of deleting (preserves tracking URL integrity)`);

      // First verify offer exists and belongs to tenant
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) {
        return null;
      }
      const internalId = offer.id;

      // Archive the offer
      const result = await this.offerRepository.updateOfferStatusTenantScoped({ 
        id: internalId, 
        tenantId, 
        status: 'archived' 
      });
      if (!result.affectedRows) {
        return null;
      }
    const rows = await this.offerRepository.listOffersPaginated({ whereClause, params, limit, offset });
    const total = await this.offerRepository.countOffers({ whereClause, params });
        err.statusCode = 403;
        throw err;
      }

      // Validate if trying to set status to 'live' but offer has expired
      if (status === 'live') {
        const validation = this.validateOfferDatesAndStatus({ status: 'live' }, existingOffer);
        if (!validation.valid) {
          const err = new Error(validation.message);
          err.statusCode = 400;
          throw err;
        }
      }

      // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
      let query = 'UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?';
      const params = [status, internalId];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const result = await this.offerRepository.updateOfferStatusTenantScoped({ id: internalId, tenantId, status });
      if (!result.affectedRows) {
        return null;
      }
      return this.getOfferById(internalId, tenantId);
    } catch (error) {
      logger.error('OfferService.changeStatus error:', error);
      throw error;
    }
  }

  async updateAssignment(assignmentId, data) {
    try {
      // First check if assignment exists
      const exists = await this.assignmentRepository.assignmentExistsById({ id: assignmentId });
      if (!exists) {
        return null;
      }

      const fields = [];
      const params = [];

      const updatable = [
        'payout_override',
        'cap_override',
        'conversion_approval_percentage',
        'capping_budget_duration',
        'capping_budget_amount',
        'capping_conversions_duration',
        'capping_conversions_amount',
        'callback_url',
        'offer_url',
        'status',
        'notes',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(data[key] ?? null);
        }
      });

      if (!fields.length) {
        return this.getAssignmentById(assignmentId);
      }

      params.push(assignmentId);

      const sql = `UPDATE publisher_offers SET ${fields.join(', ')} WHERE id = ?`;
      const result = await this.assignmentRepository.updateAssignmentFieldsById({
        id: assignmentId,
        fields,
        params,
      });
      if (!result.affectedRows) {
        return null;
      }

      return this.getAssignmentById(assignmentId);
    } catch (error) {
      logger.error('OfferService.updateAssignment error:', error);
      throw error;
    }
  }

  async getAssignmentById(assignmentId) {
    const assignment = await this.assignmentRepository.findAssignmentByIdForOfferService({ id: assignmentId });
    if (!assignment) {
      return null;
    }
    return {
      id: assignment.id,
      publisher_id: assignment.publisher_id,
      publisher_email: assignment.publisher_email,
      publisher_first_name: assignment.publisher_first_name,
      publisher_company: assignment.publisher_company,
      publisher_country: assignment.publisher_country,
      publisher_status: assignment.publisher_status,
      offer_id: assignment.offer_id,
      offer_name: assignment.offer_name,
      offer_status: assignment.offer_status,
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
      offer_url: assignment.offer_url,
      status: assignment.status,
      notes: assignment.notes,
    const result = await this.offerRepository.updateOfferStatusTenantScoped({ id, tenantId, status });


// (no singleton export)
