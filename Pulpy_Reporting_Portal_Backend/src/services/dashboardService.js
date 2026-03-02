import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import reportService from './reportService.js';

export class DashboardService {
  /**
   * Get date boundaries for today, yesterday, and MTD
   * UTC ENFORCEMENT: Manual IST conversion ONLY for business logic display.
   * Database storage remains UTC, queries use CONVERT_TZ(created_at, '+00:00', '+05:30')
   */
  getDateBoundaries() {
    const now = new Date();
    // UTC ENFORCEMENT: IST conversion for business logic only
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));

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

    return {
      currentFrom: dateFrom,
      currentTo: dateTo,
      previousFrom: prevFrom,
      previousTo: prevTo
    };
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
      const currentRange = {
        start: new Date(`${dates.currentFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' '),
        end: new Date(`${dates.currentTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ')
      };

      const previousRange = {
        start: new Date(`${dates.previousFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' '),
        end: new Date(`${dates.previousTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ')
      };

      const [conversionsCurrent] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          COALESCE(SUM(amount), 0) as revenue,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
        FROM conversions
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [currentRange.start, currentRange.end, tenantId]
      );

      const [conversionsPrevious] = await pool.query(
        `SELECT COUNT(*) as total
        FROM conversions
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [previousRange.start, previousRange.end, tenantId]
      );

      // Get clicks (current and previous)
      const [clicksCurrent] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT click_uuid) as unique_clicks
        FROM clicks
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [currentRange.start, currentRange.end, tenantId]
      );

      const [clicksPrevious] = await pool.query(
        `SELECT COUNT(*) as total
        FROM clicks
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [previousRange.start, previousRange.end, tenantId]
      );

      // Get impressions (current)
      const [impressionsCurrent] = await pool.query(
        `SELECT COUNT(*) as total
        FROM impressions
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [currentRange.start, currentRange.end, tenantId]
      );

      // Get revenue (current and previous)
      const [revenueCurrent] = await pool.query(
        `SELECT 
          COALESCE(SUM(amount), 0) as revenue,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
        FROM conversions
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [currentRange.start, currentRange.end, tenantId]
      );

      const [revenuePrevious] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as revenue
        FROM conversions
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        `,
        [previousRange.start, previousRange.end, tenantId]
      );

      // Calculate conversion rate
      const totalClicks = parseInt(clicksCurrent[0]?.total || 0);
      const totalConversions = parseInt(conversionsCurrent[0]?.total || 0);
      const conversionRate = totalClicks > 0
        ? (totalConversions / totalClicks) * 100
        : 0;

      // Get offer stats (Global, not date filtered heavily usually, but depends on use case)
      // Keeping it global as per typical dashboard behavior for "Active Offers" count
      const [offerStats] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as pending
        FROM offers
        WHERE status != 'remove' AND tenant_id = ?
        `, [tenantId]
      );

      // Get publisher stats (Global)
      const publisherStats = await publisherService.getStats(tenantId);

      // Get advertiser stats (Global)
      const [advertiserStats] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
        FROM advertisers
        WHERE tenant_id = ?
        `, [tenantId]
      );

      return {
        conversions: {
          total: parseInt(conversionsCurrent[0]?.total || 0),
          yesterday: parseInt(conversionsPrevious[0]?.total || 0), // Mapping previous period to 'yesterday' for frontend comp
          conversion_rate: parseFloat(conversionRate.toFixed(3)),
          approved: parseInt(conversionsCurrent[0]?.approved || 0),
          pending: parseInt(conversionsCurrent[0]?.pending || 0),
          rejected: parseInt(conversionsCurrent[0]?.rejected || 0),
        },
        clicks: {
          total: parseInt(clicksCurrent[0]?.total || 0),
          yesterday: parseInt(clicksPrevious[0]?.total || 0), // Mapping previous period
          unique: parseInt(clicksCurrent[0]?.unique_clicks || 0),
          mtd: 0, // Not calculating MTD separately, simplified
        },
        impressions: {
          total: parseInt(impressionsCurrent[0]?.total || 0),
          yesterday: 0,
          mtd: 0,
        },
        revenue: {
          total: parseFloat(revenueCurrent[0]?.revenue || 0),
          yesterday: parseFloat(revenuePrevious[0]?.revenue || 0),
          mtd: 0,
          profit: parseFloat((revenueCurrent[0]?.revenue || 0) - (revenueCurrent[0]?.payout || 0)),
          payout: parseFloat(revenueCurrent[0]?.payout || 0),
        },
        offers: {
          total: parseInt(offerStats[0]?.total || 0),
          active: parseInt(offerStats[0]?.active || 0),
          paused: parseInt(offerStats[0]?.paused || 0),
          pending: parseInt(offerStats[0]?.pending || 0),
        },
        publishers: {
          total: parseInt(publisherStats.total || 0),
          active: parseInt(publisherStats.active || 0),
          pending: parseInt(publisherStats.pending || 0),
          suspended: parseInt(publisherStats.suspended || 0),
        },
        advertisers: {
          total: parseInt(advertiserStats[0]?.total || 0),
          active: parseInt(advertiserStats[0]?.active || 0),
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
        const utcStart = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        const utcEnd = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        dateCondition = 'AND conv.created_at BETWEEN ? AND ?';
        params.push(utcStart, utcEnd);
      }

      const [rows] = await pool.query(
        `SELECT 
          o.public_offer_id as offer_id,
          (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id,
          o.name as offer_name,
          COUNT(DISTINCT conv.id) as conversions
        FROM offers o
        LEFT JOIN conversions conv ON conv.offer_id = o.id
          ${dateCondition}
        WHERE o.status != 'remove' AND o.tenant_id = ?
        GROUP BY o.id, o.name
        HAVING conversions > 0
        ORDER BY conversions DESC
        LIMIT ?
        `,
        [...params, tenantId, limit]
      );

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

      const utcStart = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // Get clicks by date
      const [clicksRows] = await pool.query(
        `SELECT 
          ${dateSelect} as date_group,
          COUNT(*) as clicks
        FROM clicks
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        GROUP BY ${dateGroup}
        ORDER BY date_group ASC
        `,
        [utcStart, utcEnd, tenantId]
      );

      // Get conversions by date
      const [conversionsRows] = await pool.query(
        `SELECT 
          ${dateSelect} as date_group,
          COUNT(*) as conversions
        FROM conversions
        WHERE created_at BETWEEN ? AND ?
          AND tenant_id = ?
        GROUP BY ${dateGroup}
        ORDER BY date_group ASC
        `,
        [utcStart, utcEnd, tenantId]
      );

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
      const dateFrom = filters.date_from || this.getDateBoundaries().monthStart;
      const dateTo = filters.date_to || this.getDateBoundaries().todayStart;

      const utcStart = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // Get top affiliates
      const [rows] = await pool.query(
        `SELECT 
          p.id as publisher_id,
          COALESCE(p.company_name, COALESCE(p.first_name, p.email, 'Unknown')) as publisher_name,
          COUNT(DISTINCT conv.id) as conversions
        FROM publishers p
        LEFT JOIN conversions conv ON conv.publisher_id = p.id
          AND conv.created_at BETWEEN ? AND ?
          AND conv.status != 'rejected' AND conv.status != 'rejected_cap' AND conv.status != 'click_expired'
        WHERE p.status != 'suspended' AND p.tenant_id = ?
        GROUP BY p.id, p.company_name, p.first_name, p.email
        HAVING conversions > 0
        ORDER BY conversions DESC
        LIMIT ?
        `,
        [utcStart, utcEnd, tenantId, limit]
      );

      // Get total conversions for all affiliates
      const [totalRows] = await pool.query(
        `SELECT COUNT(DISTINCT conv.id) as total_conversions
        FROM conversions conv
        WHERE conv.created_at BETWEEN ? AND ?
          AND conv.tenant_id = ?
        `,
        [utcStart, utcEnd, tenantId]
      );

      return {
        data: rows.map(row => ({
          publisher_id: parseInt(row.publisher_id),
          publisher_name: row.publisher_name || 'Unknown',
          conversions: parseInt(row.conversions || 0),
        })),
        total_conversions: parseInt(totalRows[0]?.total_conversions || 0),
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
      const [offerRows] = await pool.query(
        `SELECT COUNT(*) as count
        FROM offers
        WHERE status = 'live' AND tenant_id = ?
        `, [tenantId]
      );

      // Get pending affiliates count
      const publisherStats = await publisherService.getStats(tenantId);

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
        active_offers: parseInt(offerRows[0]?.count || 0),
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

      const utcStart = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // Get country stats from clicks and conversions
      const [rows] = await pool.query(
        `SELECT 
          c.country as country_code,
          c.country as country_name,
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue
        FROM clicks c
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
          AND conv.created_at BETWEEN ? AND ?
        WHERE c.created_at BETWEEN ? AND ?
          AND c.country IS NOT NULL
          AND c.country != ''
          AND c.tenant_id = ?
        GROUP BY c.country
        ORDER BY ${metric} DESC
        LIMIT ?
        `,
        [utcStart, utcEnd, utcStart, utcEnd, tenantId, limit]
      );

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
      const currentRange = {
        start: new Date(`${dates.currentFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' '),
        end: new Date(`${dates.currentTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ')
      };

      const previousRange = {
        start: new Date(`${dates.previousFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' '),
        end: new Date(`${dates.previousTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ')
      };

      const currentAggregatedSql = `
        SELECT
          SUM(CASE WHEN metric = 'clicks' THEN total ELSE 0 END) as clicks_total,
          SUM(CASE WHEN metric = 'clicks' THEN unique_total ELSE 0 END) as unique_clicks,
          SUM(CASE WHEN metric = 'conversions' THEN total ELSE 0 END) as conv_total,
          SUM(CASE WHEN metric = 'conversions' THEN approved ELSE 0 END) as conv_approved,
          SUM(CASE WHEN metric = 'conversions' THEN pending ELSE 0 END) as conv_pending,
          SUM(CASE WHEN metric = 'conversions' THEN rejected ELSE 0 END) as conv_rejected,
          SUM(CASE WHEN metric = 'conversions' THEN revenue ELSE 0 END) as revenue_total,
          SUM(CASE WHEN metric = 'conversions' THEN payout ELSE 0 END) as payout_total,
          SUM(CASE WHEN metric = 'impressions' THEN total ELSE 0 END) as impressions_total
        FROM (
          SELECT
            'clicks' as metric,
            COUNT(*) as total,
            COUNT(DISTINCT click_uuid) as unique_total,
            0 as approved,
            0 as pending,
            0 as rejected,
            0 as revenue,
            0 as payout
          FROM clicks
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?

          UNION ALL

          SELECT
            'conversions' as metric,
            COUNT(*) as total,
            0 as unique_total,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected,
            COALESCE(SUM(amount), 0) as revenue,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
          FROM conversions
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?

          UNION ALL

          SELECT
            'impressions' as metric,
            COUNT(*) as total,
            0 as unique_total,
            0 as approved,
            0 as pending,
            0 as rejected,
            0 as revenue,
            0 as payout
          FROM impressions
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
        ) agg
      `;

      const previousAggregatedSql = `
        SELECT
          SUM(CASE WHEN metric = 'clicks' THEN total ELSE 0 END) as clicks_total,
          SUM(CASE WHEN metric = 'conversions' THEN total ELSE 0 END) as conv_total,
          SUM(CASE WHEN metric = 'conversions' THEN revenue ELSE 0 END) as revenue_total,
          SUM(CASE WHEN metric = 'conversions' THEN payout ELSE 0 END) as payout_total,
          SUM(CASE WHEN metric = 'impressions' THEN total ELSE 0 END) as impressions_total
        FROM (
          SELECT 'clicks' as metric, COUNT(*) as total, 0 as revenue, 0 as payout
          FROM clicks
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?

          UNION ALL

          SELECT 'conversions' as metric, COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue,
                 COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
          FROM conversions
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?

          UNION ALL

          SELECT 'impressions' as metric, COUNT(*) as total, 0 as revenue, 0 as payout
          FROM impressions
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
        ) agg
      `;

      const [currentResult, previousResult] = await Promise.all([
        pool.query(currentAggregatedSql, [
          tenantId, currentRange.start, currentRange.end,
          tenantId, currentRange.start, currentRange.end,
          tenantId, currentRange.start, currentRange.end
        ]),
        pool.query(previousAggregatedSql, [
          tenantId, previousRange.start, previousRange.end,
          tenantId, previousRange.start, previousRange.end,
          tenantId, previousRange.start, previousRange.end
        ])
      ]);

      const currentStats = currentResult[0]?.[0] || {};
      const previousStats = previousResult[0]?.[0] || {};

      // Compute Values
      const clicksTotal = parseInt(currentStats.clicks_total || 0);
      const uniqueClicks = parseInt(currentStats.unique_clicks || 0);
      const clicksPrev = parseInt(previousStats.clicks_total || 0);

      const convTotal = parseInt(currentStats.conv_total || 0);
      const convApproved = parseInt(currentStats.conv_approved || 0);
      const convPending = parseInt(currentStats.conv_pending || 0);
      const convRejected = parseInt(currentStats.conv_rejected || 0);
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
      const currentRange = {
        start: new Date(`${dates.currentFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' '),
        end: new Date(`${dates.currentTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ')
      };

      const [clicksResult, conversionsResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(DISTINCT click_uuid) as unique_clicks
           FROM clicks
           WHERE created_at BETWEEN ? AND ? AND tenant_id = ?`,
          [currentRange.start, currentRange.end, tenantId]
        ),
        pool.query(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
             COALESCE(SUM(amount), 0) as revenue,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
           FROM conversions
           WHERE created_at BETWEEN ? AND ? AND tenant_id = ?`,
          [currentRange.start, currentRange.end, tenantId]
        )
      ]);

      const clicks = clicksResult[0];
      const conversions = conversionsResult[0];

      const uniqueClicks = clicks[0]?.unique_clicks || 0;
      const totalConversions = conversions[0]?.total || 0;
      const approvedConversions = conversions[0]?.approved || 0;
      const revenue = parseFloat(conversions[0]?.revenue || 0);
      const payout = parseFloat(conversions[0]?.payout || 0);
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
      const [rows] = await pool.query(
        `SELECT 
          COALESCE(o.public_offer_id, (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id)) as id,
          o.name,
          o.category,
          NULL as thumbnail_url,
          o.affiliate_amount as payout,
          o.created_at
        FROM offers o
        WHERE status = 'live' AND tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
        [tenantId, parseInt(limit)]
      );

      return rows;
    } catch (error) {
      logger.error('DashboardService.getLiveOffers error:', error);
      throw error;
    }
  }

  async getRecentActivity(limit = 5, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      // Get recent unique clicks with their conversion status
      const [rows] = await pool.query(
        `SELECT 
          c.id as click_id,
          c.created_at,
          o.name as offer_name,
          COALESCE(o.public_offer_id, (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id)) as public_offer_id,
          NULL as offer_thumbnail,
          p.company_name as publisher_name,
          p.first_name,
          conv.status as conversion_status,
          COALESCE(conv.amount, 0) as revenue
        FROM clicks c
        LEFT JOIN offers o ON c.offer_id = o.id
        LEFT JOIN publishers p ON c.publisher_id = p.id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE c.tenant_id = ?
        ORDER BY c.created_at DESC
        LIMIT ?`,
        [tenantId, parseInt(limit)]
      );

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
      const limit = parseInt(filters.limit || 50);
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;

      logger.info('getOfferStatistics filters:', { dateFrom, dateTo, limit, tenantId });

      const utcStart = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // Fixed query using subqueries to avoid Cartesian Product issue
      const [rows] = await pool.query(
        `SELECT 
          o.public_offer_id as offer_id,
          (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id,
          o.name as offer_name,
          COALESCE(c.total_clicks, 0) as clicks,
          COALESCE(conv.total_conversions, 0) as conversions,
          COALESCE(conv.approved_conversions, 0) as approved_conversions,
          COALESCE(conv.pending_conversions, 0) as pending_conversions,
          COALESCE(conv.affiliate_payout, 0) as affiliate_payout,
          COALESCE(conv.advertiser_payout, 0) as advertiser_payout,
          COALESCE(conv.profit, 0) as profit
        FROM offers o
        -- Aggregate clicks separately first
        LEFT JOIN (
          SELECT 
            offer_id, 
            COUNT(*) as total_clicks 
          FROM clicks 
          WHERE tenant_id = ?
            AND created_at BETWEEN ? AND ?
          GROUP BY offer_id
        ) c ON o.id = c.offer_id
        -- Aggregate conversions and payouts separately
        LEFT JOIN (
          SELECT 
            offer_id, 
            COUNT(*) as total_conversions,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
            -- FINANCIAL SEPARATION: Payout = approved only, Revenue = ALL conversions
            SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END) as affiliate_payout,
            SUM(amount) as advertiser_payout,
            (SUM(amount) - SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END)) as profit
          FROM conversions 
          WHERE tenant_id = ?
            AND created_at BETWEEN ? AND ?
          GROUP BY offer_id
        ) conv ON o.id = conv.offer_id
        WHERE o.status != 'remove' AND o.tenant_id = ?
        ORDER BY clicks DESC, conversions DESC, o.name ASC
        LIMIT ?
        `,
        [tenantId, utcStart, utcEnd, tenantId, utcStart, utcEnd, tenantId, limit]
      );

      return rows.map(row => {
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
      });
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
      const limit = parseInt(filters.limit || 50);
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;

      logger.info('getPublisherStatistics filters:', { dateFrom, dateTo, limit, tenantId });

      const utcStart = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      const [rows] = await pool.query(
        `SELECT 
          p.id as publisher_id,p.public_publisher_id as public_id,
          COALESCE(p.company_name, p.first_name, p.email, 'Unknown') as publisher_name,
          COALESCE(c.total_clicks, 0) as clicks,
          COALESCE(conv.total_conversions, 0) as conversions,
          COALESCE(conv.approved_conversions, 0) as approved_conversions,
          COALESCE(conv.pending_conversions, 0) as pending_conversions,
          COALESCE(conv.affiliate_payout, 0) as affiliate_payout,
          COALESCE(conv.advertiser_payout, 0) as total_revenue,
          COALESCE(conv.profit, 0) as profit
        FROM publishers p
        LEFT JOIN (
          SELECT 
            publisher_id, 
            COUNT(*) as total_clicks 
          FROM clicks 
          WHERE tenant_id = ?
            AND created_at BETWEEN ? AND ?
          GROUP BY publisher_id
        ) c ON p.id = c.publisher_id
        LEFT JOIN (
          SELECT 
            publisher_id, 
            COUNT(*) as total_conversions,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
            -- FINANCIAL SEPARATION: Payout = approved only, Revenue = ALL conversions
            SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END) as affiliate_payout,
            SUM(amount) as advertiser_payout,
            (SUM(amount) - SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END)) as profit
          FROM conversions 
          WHERE tenant_id = ?
            AND created_at BETWEEN ? AND ?
          GROUP BY publisher_id
        ) conv ON p.id = conv.publisher_id
        WHERE p.status != 'suspended' AND p.tenant_id = ?
        ORDER BY conversions DESC, clicks DESC, publisher_name ASC
        LIMIT ?
        `,
        [tenantId, utcStart, utcEnd, tenantId, utcStart, utcEnd, tenantId, limit]
      );

      return rows.map(row => ({
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
      }));
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
        group_by = 'hour'
      } = filters;

      const summaryPromise = reportService.getSummary({ date_from, date_to }, tenantId).catch(err => { logger.error('Error fetching summary:', err); return {}; });
      const summaryPreviousPromise = (previous_from && previous_to)
        ? reportService.getSummary({ date_from: previous_from, date_to: previous_to }, tenantId).catch(err => { logger.error('Error fetching summary_previous:', err); return null; })
        : Promise.resolve(null);

      const performanceComparisonPromise = (previous_from && previous_to)
        ? this.getPerformanceComparison({ date_from, date_to, group_by }, { date_from: previous_from, date_to: previous_to, group_by }, tenantId)
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
        this.getDashboardCards({ date_from, date_to }, tenantId).catch(err => { logger.error('Error fetching cards:', err); return {}; }),
        this.getPerformanceChart({ date_from, date_to, group_by }, tenantId).catch(err => { logger.error('Error fetching performance:', err); return []; }),
        summaryPromise,
        summaryPreviousPromise,
        this.getLiveOffers(5, tenantId).catch(err => { logger.error('Error fetching live offers:', err); return []; }),
        this.getPublisherStatistics({ date_from, date_to, limit }, tenantId).catch(err => { logger.error('Error fetching publisher stats:', err); return []; }),
        this.getOfferStatistics({ date_from, date_to, limit }, tenantId).catch(err => { logger.error('Error fetching offer stats:', err); return []; }),
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

export default new DashboardService();

