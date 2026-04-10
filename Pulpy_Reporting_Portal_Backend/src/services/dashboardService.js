import logger from '../utils/logger.js';
import { normalizeMysqlUtcDatetime, istYmdSpanToMysqlUtcRange } from '../utils/mysqlUtcRange.js';





export class DashboardService {
  constructor(offerService, publisherService, reportService, dashboardRepository) {
    this.offerService = offerService;
    this.publisherService = publisherService;
    this.reportService = reportService;
    this.dashboardRepository = dashboardRepository;
  }
  /**
   * Get date boundaries for today, yesterday, and MTD
   * UTC ENFORCEMENT: Manual IST conversion ONLY for business logic display.
   * Database storage remains UTC, queries use CONVERT_TZ(created_at, '+00:00', '+00:00')
   */
  getDateBoundaries() {
    const now = new Date();
    // UTC ENFORCEMENT: IST conversion for business logic only
    const istTime = new Date(now.getTime());

    // IST Day start (YYYY-MM-DD)
    const todayStr = istTime.toISOString().split('T')[0];

    // Yesterday in IST
    const yesterdayTime = new Date(istTime);
    yesterdayTime.setDate(yesterdayTime.getDate() - 1);
    const yesterdayStr = yesterdayTime.toISOString().split('T')[0];

    // Month start in IST
    const monthStartStr = todayStr.substring(0, 7) + '-01';

    return {
      todayStart: todayStr,
      yesterdayStart: yesterdayStr,
      monthStart: monthStartStr,
    };
  }

  getDateRanges(filters) {
    const boundaries = this.getDateBoundaries();
    const dateFrom = filters.date_from || boundaries.todayStart;
    const dateTo = filters.date_to || boundaries.todayStart;

    const d1 = new Date(dateFrom);
    const d2 = new Date(dateTo);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Previous period
    const prevToDate = new Date(d1);
    prevToDate.setDate(prevToDate.getDate() - 1);
    const prevTo = prevToDate.toISOString().split('T')[0];

    const prevFromDate = new Date(prevToDate);
    prevFromDate.setDate(prevFromDate.getDate() - diffDays + 1);
    const prevFrom = prevFromDate.toISOString().split('T')[0];

    const computed = {
      currentFrom: dateFrom,
      currentTo: dateTo,
      previousFrom: prevFrom,
      previousTo: prevTo
    };

    return computed;
  }

  /**
   * When `range_start_utc` / `range_end_utc` are set (UTC MySQL `YYYY-MM-DD HH:mm:ss`),
   * use them for `created_at BETWEEN` instead of deriving only from IST `date_from` / `date_to`.
   */
  resolveMysqlUtcRange(filters, getIstYmdSpan) {
    const rs = normalizeMysqlUtcDatetime(filters.range_start_utc);
    const re = normalizeMysqlUtcDatetime(filters.range_end_utc);
    if (rs && re) return { start: rs, end: re };
    const { from, to } = getIstYmdSpan();
    return istYmdSpanToMysqlUtcRange(from, to);
  }

  resolveMysqlUtcPreviousRange(filters, getIstYmdSpanPrevious) {
    const rs = normalizeMysqlUtcDatetime(filters.previous_range_start_utc);
    const re = normalizeMysqlUtcDatetime(filters.previous_range_end_utc);
    if (rs && re) return { start: rs, end: re };
    const { from, to } = getIstYmdSpanPrevious();
    return istYmdSpanToMysqlUtcRange(from, to);
  }

  async getDashboardStats(filters = {}, tenantId) {
    // Handle overload: getDashboardStats(tenantId)
    if (typeof filters === 'string' || typeof filters === 'number') {
      tenantId = filters;
      filters = {}; // Use defaults
    }

    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dates = this.getDateRanges(filters);

      // Get conversions (current and previous)
      // FINANCIAL SEPARATION RULES:
      // 1. Revenue = SUM(amount) (Advertiser Revenue) - ALWAYS counted, regardless of status (even rejected).
      // 2. Payout = SUM(payout) (Publisher Earnings) - ONLY counted when status = 'approved'.
      // 3. Profit = Revenue - Payout.
      const currentRange = this.resolveMysqlUtcRange(filters, () => ({
        from: dates.currentFrom,
        to: dates.currentTo,
      }));

      const previousRange = this.resolveMysqlUtcPreviousRange(filters, () => ({
        from: dates.previousFrom,
        to: dates.previousTo,
      }));

      const conversionsCurrent = await this.dashboardRepository.getConversionsStats({
        start: currentRange.start,
        end: currentRange.end,
        tenantId
      });

      const conversionsPreviousTotal = await this.dashboardRepository.getConversionsCount({
        start: previousRange.start,
        end: previousRange.end,
        tenantId
      });

      // Get clicks (current and previous)
      const clicksCurrent = await this.dashboardRepository.getClicksStats({
        start: currentRange.start,
        end: currentRange.end,
        tenantId
      });

      const clicksPreviousTotal = await this.dashboardRepository.getClicksCount({
        start: previousRange.start,
        end: previousRange.end,
        tenantId
      });

      // Get impressions (current)
      const impressionsCurrentCount = await this.dashboardRepository.getImpressionsCount({
        start: currentRange.start,
        end: currentRange.end,
        tenantId
      });

      // Get revenue (current and previous)
      const revenueCurrent = await this.dashboardRepository.getRevenueStats({
        start: currentRange.start,
        end: currentRange.end,
        tenantId
      });

      const revenuePreviousTotal = (await this.dashboardRepository.getRevenueStats({
        start: previousRange.start,
        end: previousRange.end,
        tenantId
      })).revenue;

      // Calculate conversion rate
      const totalClicks = parseInt(clicksCurrent.total || 0);
      const totalConversions = parseInt(conversionsCurrent.total || 0);
      const conversionRate = totalClicks > 0
        ? (totalConversions / totalClicks) * 100
        : 0;

      // Get offer stats (Global, not date filtered heavily usually, but depends on use case)
      // Keeping it global as per typical dashboard behavior for "Active Offers" count
      const offerStats = await this.dashboardRepository.getOfferStats(tenantId);

      // Get publisher stats (Global)
      const publisherStats = await this.publisherService.getStats(tenantId);

      // Get advertiser stats (Global)
      const advertiserStats = await this.dashboardRepository.getAdvertiserStats(tenantId);

      return {
        conversions: {
          total: parseInt(conversionsCurrent.total || 0),
          yesterday: parseInt(conversionsPreviousTotal || 0), // Mapping previous period to 'yesterday' for frontend comp
          conversion_rate: parseFloat(conversionRate.toFixed(3)),
          approved: parseInt(conversionsCurrent.approved || 0),
          pending: parseInt(conversionsCurrent.pending || 0),
          rejected: parseInt(conversionsCurrent.rejected || 0),
          click_expired: parseInt(conversionsCurrent.click_expired || 0),
        },
        clicks: {
          total: parseInt(clicksCurrent.total || 0),
          yesterday: parseInt(clicksPreviousTotal || 0), // Mapping previous period
          unique: parseInt(clicksCurrent.unique_clicks || 0),
          mtd: 0, // Not calculating MTD separately, simplified
        },
        impressions: {
          total: parseInt(impressionsCurrentCount || 0),
          yesterday: 0,
          mtd: 0,
        },
        revenue: {
          total: parseFloat(revenueCurrent.revenue || 0),
          yesterday: parseFloat(revenuePreviousTotal || 0),
          mtd: 0,
          profit: parseFloat((revenueCurrent.revenue || 0) - (revenueCurrent.payout || 0)),
          payout: parseFloat(revenueCurrent.payout || 0),
        },
        offers: {
          total: parseInt(offerStats.total || 0),
          active: parseInt(offerStats.active || 0),
          paused: parseInt(offerStats.paused || 0),
          pending: parseInt(offerStats.pending || 0),
        },
        publishers: {
          total: parseInt(publisherStats.total || 0),
          active: parseInt(publisherStats.active || 0),
          pending: parseInt(publisherStats.pending || 0),
          suspended: parseInt(publisherStats.suspended || 0),
        },
        advertisers: {
          total: parseInt(advertiserStats.total || 0),
          active: parseInt(advertiserStats.active || 0),
        },
      };
    } catch (error) {
      logger.error('DashboardService.getDashboardStats error:', error);
      throw error;
    }
  }

  async getTopOffers(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const limit = parseInt(filters.limit || 5);
      const dateFrom = filters.date_from;
      const dateTo = filters.date_to;

      // Build query conditionally based on whether dates are provided
      let dateCondition = '';
      const params = [];

      if (dateFrom && dateTo) {
        const span = this.resolveMysqlUtcRange(filters, () => ({ from: dateFrom, to: dateTo }));
        dateCondition = 'AND conv.created_at BETWEEN ? AND ?';
        params.push(span.start, span.end);
      }

      const rows = await this.dashboardRepository.getTopOffers({
        tenantId,
        limit,
        dateCondition,
        params
      });

      return rows.map(row => ({
        offer_id: row.offer_id.toString(),
        display_id: row.display_id,
        offer_name: row.offer_name,
        conversions: parseInt(row.conversions || 0),
      }));
    } catch (error) {
      logger.error('DashboardService.getTopOffers error:', error);
      throw error;
    }
  }

  async getPerformanceChart(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dates = this.getDateRanges(filters);
      const dateFrom = filters.date_from || dates.currentFrom;
      const dateTo = filters.date_to || dates.currentTo;
      const groupBy = filters.group_by || 'day';

      let dateGroup, dateSelect;
      const tzOffset = 330; // 5.5 hours in minutes

      // ✅ FIX: Use DATE_ADD instead of CONVERT_TZ for robustness
      // ✅ FIX: Use DATE_FORMAT for 'day' as well to ensure String output (not Date object) for Map keys
      if (groupBy === 'week') {
        dateGroup = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%u')`;
        dateSelect = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%u')`;
      } else if (groupBy === 'month') {
        dateGroup = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m')`;
        dateSelect = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m')`;
      } else if (groupBy === 'hour') {
        // Group by YYYY-MM-DD HH:00
        dateGroup = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m-%d %H:00')`;
        dateSelect = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m-%d %H:00')`;
      } else {
        // Force YYYY-MM-DD string format to prevent JS Map key issues
        dateGroup = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m-%d')`;
        dateSelect = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m-%d')`;
      }

      logger.info(`[PerformanceChart] Fetching for Tenant: ${tenantId}, Range: ${dateFrom} to ${dateTo}, GroupBy: ${groupBy}`);

      const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({
        from: dateFrom,
        to: dateTo,
      }));

      // Get clicks by date
      const clicksRows = await this.dashboardRepository.getPerformanceClicks({
        dateSelect,
        dateGroup,
        start: utcStart,
        end: utcEnd,
        tenantId
      });

      // Get conversions by date
      const conversionsRows = await this.dashboardRepository.getPerformanceConversions({
        dateSelect,
        dateGroup,
        start: utcStart,
        end: utcEnd,
        tenantId
      });

      logger.info(`[PerformanceChart] Found ${clicksRows.length} click rows and ${conversionsRows.length} conversion rows.`);

      // Combine data
      const clicksMap = new Map(clicksRows.map(r => [r.date_group, parseInt(r.clicks || 0)]));
      const conversionsMap = new Map(conversionsRows.map(r => [r.date_group, parseInt(r.conversions || 0)]));

      // Get all unique dates
      const allDates = new Set([...clicksMap.keys(), ...conversionsMap.keys()]);
      const sortedDates = Array.from(allDates).sort();

      return sortedDates.map(dateGroup => ({
        date: dateGroup,
        clicks: clicksMap.get(dateGroup) || 0,
        conversions: conversionsMap.get(dateGroup) || 0,
      }));
    } catch (error) {
      logger.error('DashboardService.getPerformanceChart error:', error);
      throw error;
    }
  }

  async getTopAffiliates(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const limit = parseInt(filters.limit || 5);
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;

      const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({
        from: dateFrom,
        to: dateTo,
      }));

      // Get top affiliates
      const rows = await this.dashboardRepository.getTopAffiliates({
        start: utcStart,
        end: utcEnd,
        tenantId,
        limit
      });

      // Get total conversions for all affiliates
      const totalConversions = await this.dashboardRepository.getTotalConversionsCount({
        start: utcStart,
        end: utcEnd,
        tenantId
      });

      return {
        data: rows.map(row => ({
          publisher_id: parseInt(row.publisher_id),
          publisher_name: row.publisher_name || 'Unknown',
          conversions: parseInt(row.conversions || 0),
        })),
        total_conversions: parseInt(totalConversions || 0),
      };
    } catch (error) {
      logger.error('DashboardService.getTopAffiliates error:', error);
      throw error;
    }
  }

  async getInfoCards(tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      // Get active offers count
      const activeOffersCount = await this.dashboardRepository.getActiveOffersCount(tenantId);

      // Get pending affiliates count
      const publisherStats = await this.publisherService.getStats(tenantId);

      // Get offer requests (placeholder - may need a separate table)
      const offerRequests = 0;

      // Account manager info (placeholder - should come from config or admin table)
      const accountManager = {
        name: 'Sukhwinder Pal Singh',
        telegram: '@username',
        skype: 'username',
        email: 'manager@example.com',
        phone: '+1234567890',
      };

      // Signup link (placeholder - should come from config)
      const signupLink = 'https://signup.example.com/affiliates-advertisers';

      return {
        active_offers: parseInt(activeOffersCount || 0),
        offer_requests: offerRequests,
        pending_affiliates: parseInt(publisherStats.pending || 0),
        account_manager: accountManager,
        signup_link: signupLink,
      };
    } catch (error) {
      logger.error('DashboardService.getInfoCards error:', error);
      throw error;
    }
  }

  async getTopCountries(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const limit = parseInt(filters.limit || 10);
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;
      const metric = filters.metric || 'conversions';

      const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({
        from: dateFrom,
        to: dateTo,
      }));

      // Get country stats from clicks and conversions
      const rows = await this.dashboardRepository.getTopCountries({
        start: utcStart,
        end: utcEnd,
        tenantId,
        limit,
        metric
      });

      // Map country codes to names (simplified - should use a proper country lookup)
      const countryNameMap = {
        'US': 'United States',
        'GB': 'United Kingdom',
        'CA': 'Canada',
        'AU': 'Australia',
        'DE': 'Germany',
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'NL': 'Netherlands',
        'BR': 'Brazil',
        'MX': 'Mexico',
        'IN': 'India',
        'CN': 'China',
        'JP': 'Japan',
        'KR': 'South Korea',
      };

      return rows.map(row => ({
        country_code: row.country_code || 'UN',
        country_name: countryNameMap[row.country_code] || row.country_name || row.country_code,
        clicks: parseInt(row.clicks || 0),
        conversions: parseInt(row.conversions || 0),
        revenue: parseFloat(row.revenue || 0),
      }));
    } catch (error) {
      logger.error('DashboardService.getTopCountries error:', error);
      throw error;
    }
  }

  /**
   * Get dashboard cards data matching the UI requirements
   * Returns: Total Clicks, Conversions, Total Revenue, Approved Payout
   */
  async getDashboardCards(filters = {}, tenantId) {
    // Handle overload
    if (typeof filters === 'string' || typeof filters === 'number') {
      tenantId = filters;
      filters = {};
    }

    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dates = this.getDateRanges(filters);
      const currentRange = this.resolveMysqlUtcRange(filters, () => ({
        from: dates.currentFrom,
        to: dates.currentTo,
      }));

      const previousRange = this.resolveMysqlUtcPreviousRange(filters, () => ({
        from: dates.previousFrom,
        to: dates.previousTo,
      }));

      const currentStats = await this.dashboardRepository.getDashboardCardsCurrent(tenantId, currentRange.start, currentRange.end);
      const previousStats = await this.dashboardRepository.getDashboardCardsPrevious(tenantId, previousRange.start, previousRange.end);

      // Compute Values
      const clicksTotal = parseInt(currentStats.clicks_total || 0);
      const uniqueClicks = parseInt(currentStats.unique_clicks || 0);
      const clicksPrev = parseInt(previousStats.clicks_total || 0);

      const convTotal = parseInt(currentStats.conv_total || 0);
      const convApproved = parseInt(currentStats.conv_approved || 0);
      const convPending = parseInt(currentStats.conv_pending || 0);
      const convRejected = parseInt(currentStats.conv_rejected || 0);
      const convClickExpired = parseInt(currentStats.conv_click_expired || 0);
      const convPrev = parseInt(previousStats.conv_total || 0);

      const revTotal = parseFloat(currentStats.revenue_total || 0);
      const payoutTotal = parseFloat(currentStats.payout_total || 0);
      const revPrev = parseFloat(previousStats.revenue_total || 0);
      const payoutPrev = parseFloat(previousStats.payout_total || 0);

      const impTotal = parseInt(currentStats.impressions_total || 0);
      const impPrev = parseInt(previousStats.impressions_total || 0);

      const profit = revTotal - payoutTotal;
      const revenueChange = revTotal - revPrev;

      const conversionRate = clicksTotal > 0 ? ((convTotal / clicksTotal) * 100) : 0;
      const approvalRateValue = convTotal > 0 ? ((convApproved / convTotal) * 100).toFixed(2) : '0.00';

      return {
        clicks: {
          total: clicksTotal,
          unique: uniqueClicks,
          today: clicksTotal,
          yesterday: clicksPrev,
          mtd: 0,
          label: 'TOTAL CLICKS',
          status_label: 'Unique'
        },
        impressions: {
          total: impTotal,
          today: impTotal,
          yesterday: impPrev,
          mtd: 0,
          label: 'IMPRESSIONS',
          status_label: 'Total'
        },
        conversions: {
          total: convTotal,
          today: convTotal,
          yesterday: convPrev,
          approved: convApproved,
          pending: convPending,
          rejected: convRejected,
          click_expired: convClickExpired,
          click_expired_conversions: convClickExpired,
          conversion_rate: conversionRate,
          approval_rate: `${approvalRateValue}%`,
          label: 'CONVERSIONS',
          status_label: `Approved +${approvalRateValue}%`
        },
        revenue: {
          total: revTotal,
          payout: payoutTotal,
          approved_payout: payoutTotal,
          pending_payout: 0,
          profit: profit,
          today: revTotal,
          yesterday: revPrev,
          mtd: 0,
          payout_today: payoutTotal,
          payout_yesterday: payoutPrev,
          payout_mtd: 0,
          change: revenueChange,
          label: 'TOTAL REVENUE',
          status_label: `Up $${revenueChange.toFixed(2)}`
        }
      };
    } catch (error) {
      logger.error('DashboardService.getDashboardCards error:', error);
      throw error;
    }
  }

  async getPerformanceSummary(filters = {}, tenantId) {
    // Handle overload
    if (typeof filters === 'string' || typeof filters === 'number') {
      tenantId = filters;
      filters = {};
    }

    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dates = this.getDateRanges(filters);
      const currentRange = this.resolveMysqlUtcRange(filters, () => ({
        from: dates.currentFrom,
        to: dates.currentTo,
      }));

      const [clicksResult, conversionsResult] = await Promise.all([
        this.dashboardRepository.getClicksStats({
          start: currentRange.start,
          end: currentRange.end,
          tenantId
        }),
        this.dashboardRepository.getPerformanceSummaryConversions(tenantId, currentRange.start, currentRange.end)
      ]);

      const uniqueClicks = clicksResult.unique_clicks || 0;
      const totalConversions = conversionsResult.total || 0;
      const approvedConversions = conversionsResult.approved || 0;
      const revenue = parseFloat(conversionsResult.revenue || 0);
      const payout = parseFloat(conversionsResult.payout || 0);
      const profit = revenue - payout;

      return {
        unique_clicks: uniqueClicks,
        conversions: totalConversions,
        approved_conversions: approvedConversions,
        revenue: revenue,
        payout: payout,
        profit: profit
      };
    } catch (error) {
      logger.error('DashboardService.getPerformanceSummary error:', error);
      throw error;
    }
  }
  async getLiveOffers(limit = 5, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      return await this.dashboardRepository.getLiveOffers(tenantId, limit);
    } catch (error) {
      logger.error('DashboardService.getLiveOffers error:', error);
      throw error;
    }
  }

  async getRecentActivity(limit = 5, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      // Get recent unique clicks with their conversion status
      const rows = await this.dashboardRepository.getRecentActivity(tenantId, limit);

      return rows.map(row => ({
        id: row.click_id,
        time: row.created_at,
        offer: {
          name: row.offer_name,
          thumbnail: row.offer_thumbnail,
          id: row.public_offer_id
        },
        publisher: row.publisher_name || row.first_name || 'Unknown',
        clicks: 1, // Individual log entry represents 1 click
        converted: !!row.conversion_status,
        conversion_status: row.conversion_status || 'No',
        revenue: parseFloat(row.revenue).toFixed(2)
      }));
    } catch (error) {
      logger.error('DashboardService.getRecentActivity error:', error);
      throw error;
    }
  }

  /**
   * Get offer statistics with clicks, conversions, CR, payouts, and profit
   */
  async getOfferStatistics(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;

      const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({
        from: dateFrom,
        to: dateTo,
      }));

      const sortBy = filters.sort_by || 'clicks';
      const orderBy = filters.order_by || 'DESC';

      // Validate sort fields to prevent SQL injection
      const allowedSortFields = ['clicks', 'conversions', 'approved_conversions', 'pending_conversions', 'affiliate_payout', 'advertiser_payout', 'profit', 'offer_name', 'conversion_ratio'];
      const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'clicks';
      const finalOrderBy = orderBy.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 10);
      const offset = (page - 1) * limit;

      const rows = await this.dashboardRepository.getOfferStatistics({
        tenantId,
        utcStart,
        utcEnd,
        finalSortBy,
        finalOrderBy,
        limit,
        offset
      });

      const totalCount = await this.dashboardRepository.getOfferStatisticsCount(tenantId);

      return {
        data: rows.map(row => {
          const clicks = parseInt(row.clicks || 0);
          const conversions = parseInt(row.conversions || 0);
          const conversionRatio = clicks > 0 ? ((conversions / clicks) * 100).toFixed(2) : '0.00';

          return {
            offer_id: row.offer_id,
            display_id: row.display_id,
            offer_name: row.offer_name,
            clicks: clicks,
            conversions: conversions,
            approved_conversions: parseInt(row.approved_conversions || 0),
            pending_conversions: parseInt(row.pending_conversions || 0),
            conversion_ratio: parseFloat(conversionRatio),
            affiliate_payout: parseFloat(row.affiliate_payout || 0),
            advertiser_payout: parseFloat(row.advertiser_payout || 0),
            profit: parseFloat(row.profit || 0)
          };
        }),
        total: totalCount,
        page,
        limit
      };
    } catch (error) {
      logger.error('DashboardService.getOfferStatistics error:', error);
      throw error;
    }
  }

  async getPerformanceComparison(currentFilters, previousFilters, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const groupBy = currentFilters.group_by || 'day';

      const [currentData, previousData] = await Promise.all([
        this.getPerformanceChart(currentFilters, tenantId),
        this.getPerformanceChart(previousFilters, tenantId)
      ]);

      const mergedMap = new Map();

      // Helper to generate a normalized key
      const getNormalizedKey = (dateStr, fromDateStr, type) => {
        if (type === 'hour') {
          // Expected format: "YYYY-MM-DD HH:00" -> "HH:00"
          if (dateStr.length >= 16) return dateStr.substring(11, 16);
          return dateStr; // Fallback
        } else {
          // Day/Week/Month: Use offset from start date
          // Treat strings as UTC for simple difference calculation to avoid DST issues
          const date = new Date(dateStr + 'T00:00:00Z');
          const start = new Date(fromDateStr + 'T00:00:00Z');
          const diffTime = date - start;
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
          return `Day ${diffDays + 1}`;
        }
      };

      // Populate with Current Data
      currentData.forEach(row => {
        const key = getNormalizedKey(row.date, currentFilters.date_from, groupBy);
        mergedMap.set(key, {
          label: key,
          original_date_current: row.date,
          clicks_current: row.clicks,
          conversions_current: row.conversions,
          clicks_previous: 0,
          conversions_previous: 0
        });
      });

      // Overlay Previous Data
      previousData.forEach(row => {
        const key = getNormalizedKey(row.date, previousFilters.date_from, groupBy);
        if (mergedMap.has(key)) {
          const entry = mergedMap.get(key);
          entry.clicks_previous = row.clicks;
          entry.conversions_previous = row.conversions;
          entry.original_date_previous = row.date;
        } else {
          // In case previous period has data points that current doesn't (though usually we iterate over a fixed time axis)
          // For strict alignment, we might want to ignore extra previous points or add them. 
          // Adding them for completeness.
          mergedMap.set(key, {
            label: key,
            original_date_previous: row.date,
            clicks_current: 0,
            conversions_current: 0,
            clicks_previous: row.clicks,
            conversions_previous: row.conversions
          });
        }
      });

      // Convert map to sorted array
      // Sorting based on label might be tricky ("Day 1", "Day 10", "Day 2"). 
      // Ideally we sort by the implicit index.
      const sortedData = Array.from(mergedMap.values()).sort((a, b) => {
        if (groupBy === 'hour') {
          return a.label.localeCompare(b.label);
        } else {
          // Extract number from "Day X"
          const numA = parseInt(a.label.replace('Day ', '')) || 0;
          const numB = parseInt(b.label.replace('Day ', '')) || 0;
          return numA - numB;
        }
      });

      return sortedData;

    } catch (error) {
      logger.error('DashboardService.getPerformanceComparison error:', error);
      return [];
    }
  }

  async getPublisherStatistics(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;

      const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({
        from: dateFrom,
        to: dateTo,
      }));

      const sortBy = filters.sort_by || 'conversions';
      const orderBy = filters.order_by || 'DESC';

      // Validate sort fields
      const allowedSortFields = ['clicks', 'conversions', 'approved_conversions', 'pending_conversions', 'affiliate_payout', 'total_revenue', 'profit', 'publisher_name'];
      const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'conversions';
      const finalOrderBy = orderBy.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 10);
      const offset = (page - 1) * limit;

      const rows = await this.dashboardRepository.getPublisherStatistics({
        tenantId,
        utcStart,
        utcEnd,
        finalSortBy,
        finalOrderBy,
        limit,
        offset
      });

      const totalCount = await this.dashboardRepository.getPublisherStatisticsCount(tenantId);

      return {
        data: rows.map(row => ({
          publisher_id: row.publisher_id,
          public_id: row.public_id,
          publisher_name: row.publisher_name,
          clicks: parseInt(row.clicks || 0),
          conversions: parseInt(row.conversions || 0),
          approved_conversions: parseInt(row.approved_conversions || 0),
          pending_conversions: parseInt(row.pending_conversions || 0),
          publisher_revenue: parseFloat(row.affiliate_payout || 0),
          total_revenue: parseFloat(row.total_revenue || 0),
          profit: parseFloat(row.profit || 0)
        })),
        total: totalRows[0]?.total || 0,
        page,
        limit
      };
    } catch (error) {
      logger.error('DashboardService.getPublisherStatistics error:', error);
      throw error;
    }
  }

  async getAggregatedDashboard(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');

    try {
      const {
        date_from,
        date_to,
        previous_from,
        previous_to,
        limit = 10,
        group_by = 'hour',
        offer_sort_by,
        offer_order_by,
        pub_sort_by,
        pub_order_by,
        range_start_utc,
        range_end_utc,
        previous_range_start_utc,
        previous_range_end_utc,
      } = filters;

      const summaryPromise = this.reportService.getSummary({ date_from, date_to, range_start_utc, range_end_utc }, tenantId).catch(err => { logger.error('Error fetching summary:', err); return {}; });
      const summaryPreviousPromise = (previous_from && previous_to)
        ? this.reportService.getSummary({
          date_from: previous_from,
          date_to: previous_to,
          range_start_utc: previous_range_start_utc,
          range_end_utc: previous_range_end_utc,
        }, tenantId).catch(err => { logger.error('Error fetching summary_previous:', err); return null; })
        : Promise.resolve(null);

      const performanceComparisonPromise = (previous_from && previous_to)
        ? this.getPerformanceComparison(
          { date_from, date_to, group_by, range_start_utc, range_end_utc },
          { date_from: previous_from, date_to: previous_to, group_by, range_start_utc: previous_range_start_utc, range_end_utc: previous_range_end_utc },
          tenantId
        )
        : Promise.resolve([]);

      // Execute only the sub-queries used by the Dashboard UI (no topOffers, topAffiliates)
      const [
        cards,
        performanceChart,
        summary,
        summaryPrevious,
        liveOffers,
        publisherStatistics,
        offerStatistics,
        performanceComparison
      ] = await Promise.all([
        this.getDashboardCards({ date_from, date_to, range_start_utc, range_end_utc, previous_range_start_utc, previous_range_end_utc }, tenantId).catch(err => { logger.error('Error fetching cards:', err); return {}; }),
        this.getPerformanceChart({ date_from, date_to, group_by, range_start_utc, range_end_utc }, tenantId).catch(err => { logger.error('Error fetching performance:', err); return []; }),
        summaryPromise,
        summaryPreviousPromise,
        this.getLiveOffers(5, tenantId).catch(err => { logger.error('Error fetching live offers:', err); return []; }),
        this.getPublisherStatistics({ date_from, date_to, limit, sort_by: pub_sort_by, order_by: pub_order_by, range_start_utc, range_end_utc }, tenantId).catch(err => { logger.error('Error fetching publisher stats:', err); return []; }),
        this.getOfferStatistics({ date_from, date_to, limit, sort_by: offer_sort_by, order_by: offer_order_by, range_start_utc, range_end_utc }, tenantId).catch(err => { logger.error('Error fetching offer stats:', err); return []; }),
        performanceComparisonPromise
      ]);

      const result = {
        cards,
        performanceChart,
        summary,
        liveOffers,
        publisherStatistics,
        offerStatistics,
        performanceComparison
      };
      if (summaryPrevious != null) {
        result.summary_previous = summaryPrevious;
      }
      return result;

    } catch (error) {
      logger.error('DashboardService.getAggregatedDashboard error:', error);
      throw error;
    }
  }
}

// (no singleton export)

