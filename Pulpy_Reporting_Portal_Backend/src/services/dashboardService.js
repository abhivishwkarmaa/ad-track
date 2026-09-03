import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { normalizeMysqlUtcDatetime, istYmdSpanToMysqlUtcRange } from '../utils/mysqlUtcRange.js';
import { getReportingRollupTableName } from '../config/reportingRollupTable.js';
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
      const dateFrom = dates.currentFrom;
      const dateTo = dates.currentTo;
      const prevFrom = dates.previousFrom;
      const prevTo = dates.previousTo;
      const rt = getReportingRollupTableName();

      // Summary from daily_reporting_rollup table (strictly IST indexed query)
      const [currentRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(total_clicks), 0) as total_clicks,
           COALESCE(SUM(unique_ips), 0) as unique_clicks,
           COALESCE(SUM(total_conversions), 0) as total_conversions,
           COALESCE(SUM(approved_conversions), 0) as approved_conversions,
           COALESCE(SUM(pending_conversions), 0) as pending_conversions,
           COALESCE(SUM(rejected_conversions), 0) as rejected_conversions,
           COALESCE(SUM(revenue), 0) as total_revenue,
           COALESCE(SUM(payout), 0) as total_payout,
           COALESCE(SUM(profit), 0) as net_profit
         FROM ${rt}
         WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?`,
        [tenantId, dateFrom, dateTo]
      );

      const [prevRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(total_clicks), 0) as total_clicks,
           COALESCE(SUM(total_conversions), 0) as total_conversions,
           COALESCE(SUM(revenue), 0) as total_revenue,
           COALESCE(SUM(payout), 0) as total_payout
         FROM ${rt}
         WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?`,
        [tenantId, prevFrom, prevTo]
      );

      const currentStats = currentRows[0] || {};
      const previousStats = prevRows[0] || {};

      const revTotal = parseFloat(currentStats.total_revenue || 0);
      const payoutTotal = parseFloat(currentStats.total_payout || 0);
      const revPrev = parseFloat(previousStats.total_revenue || 0);

      const totalClicks = parseInt(currentStats.total_clicks || 0);
      const totalConversions = parseInt(currentStats.total_conversions || 0);
      const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

      // Get offer stats (Global)
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
          total: totalConversions,
          yesterday: parseInt(previousStats.total_conversions || 0),
          conversion_rate: parseFloat(conversionRate.toFixed(3)),
          approved: parseInt(currentStats.approved_conversions || 0),
          pending: parseInt(currentStats.pending_conversions || 0),
          rejected: parseInt(currentStats.rejected_conversions || 0),
          click_expired: 0,
        },
        clicks: {
          total: totalClicks,
          yesterday: parseInt(previousStats.total_clicks || 0),
          unique: parseInt(currentStats.unique_clicks || 0),
          mtd: 0,
        },
        impressions: {
          total: 0,
          yesterday: 0,
          mtd: 0,
        },
        revenue: {
          total: revTotal,
          yesterday: revPrev,
          mtd: 0,
          profit: parseFloat(currentStats.net_profit || (revTotal - payoutTotal)),
          payout: payoutTotal,
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
      const rt = getReportingRollupTableName();

      let dateCondition = '';
      const params = [];

      if (dateFrom && dateTo) {
        dateCondition = 'AND dos.stat_date BETWEEN ? AND ?';
        params.push(dateFrom, dateTo);
      }

      const [rows] = await pool.query(
        `SELECT 
          o.public_offer_id as offer_id,
          (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id,
          o.name as offer_name,
          COALESCE(SUM(dos.total_conversions), 0) as conversions
        FROM offers o
        LEFT JOIN ${rt} dos ON o.id = dos.offer_id AND dos.tenant_id = o.tenant_id ${dateCondition}
        WHERE o.status != 'remove' AND o.tenant_id = ?
        GROUP BY o.id, o.public_offer_id, o.name
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

      if (groupBy === 'hour') {
        const tzOffset = 330;
        const dateGroup = `DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffset} MINUTE), '%Y-%m-%d %H:00')`;
        const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({ from: dateFrom, to: dateTo }));
        const [clicksRows] = await pool.query(
          `SELECT ${dateGroup} as date_group, COUNT(*) as clicks FROM clicks WHERE created_at BETWEEN ? AND ? AND tenant_id = ? GROUP BY ${dateGroup} ORDER BY date_group ASC`,
          [utcStart, utcEnd, tenantId]
        );
        const [conversionsRows] = await pool.query(
          `SELECT ${dateGroup} as date_group, COUNT(*) as conversions FROM conversions WHERE created_at BETWEEN ? AND ? AND tenant_id = ? GROUP BY ${dateGroup} ORDER BY date_group ASC`,
          [utcStart, utcEnd, tenantId]
        );
        const clicksMap = new Map(clicksRows.map(r => [r.date_group, parseInt(r.clicks || 0)]));
        const conversionsMap = new Map(conversionsRows.map(r => [r.date_group, parseInt(r.conversions || 0)]));
        const allDates = Array.from(new Set([...clicksMap.keys(), ...conversionsMap.keys()])).sort();
        return allDates.map(dg => ({ date: dg, clicks: clicksMap.get(dg) || 0, conversions: conversionsMap.get(dg) || 0 }));
      }

      const rt = getReportingRollupTableName();

      // Daily / Multi-day chart using daily_reporting_rollup (strictly IST)
      const [rows] = await pool.query(
        `SELECT 
           DATE_FORMAT(stat_date, '%Y-%m-%d') as date,
           COALESCE(SUM(total_clicks), 0) as clicks,
           COALESCE(SUM(total_conversions), 0) as conversions
         FROM ${rt}
         WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?
         GROUP BY date
         ORDER BY date ASC`,
        [tenantId, dateFrom, dateTo]
      );

      return rows.map(r => ({
        date: r.date,
        clicks: parseInt(r.clicks || 0),
        conversions: parseInt(r.conversions || 0),
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

      // Aggregate conversions first (index-friendly), then join to publishers.
      const [rows] = await pool.query(
        `SELECT 
          p.id as publisher_id,
          COALESCE(p.company_name, COALESCE(p.first_name, p.email, 'Unknown')) as publisher_name,
          conv_agg.conversions
        FROM (
          SELECT conv.publisher_id, COUNT(*) as conversions
          FROM conversions conv
          WHERE conv.created_at BETWEEN ? AND ?
            AND conv.tenant_id = ?
            AND conv.status != 'rejected' AND conv.status != 'rejected_cap' AND conv.status != 'click_expired'
          GROUP BY conv.publisher_id
        ) conv_agg
        INNER JOIN publishers p ON p.id = conv_agg.publisher_id
        WHERE p.status != 'suspended' AND p.tenant_id = ?
        ORDER BY conv_agg.conversions DESC
        LIMIT ?
        `,
        [utcStart, utcEnd, tenantId, tenantId, limit]
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

      const { start: utcStart, end: utcEnd } = this.resolveMysqlUtcRange(filters, () => ({
        from: dateFrom,
        to: dateTo,
      }));

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
      const dateFrom = dates.currentFrom;
      const dateTo = dates.currentTo;
      const prevFrom = dates.previousFrom;
      const prevTo = dates.previousTo;
      const rt = getReportingRollupTableName();

      // Current & Previous stats from daily_reporting_rollup (exact IST)
      const [currentRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(total_clicks), 0) as total_clicks,
           COALESCE(SUM(unique_ips), 0) as unique_clicks,
           COALESCE(SUM(total_conversions), 0) as total_conversions,
           COALESCE(SUM(approved_conversions), 0) as approved_conversions,
           COALESCE(SUM(pending_conversions), 0) as pending_conversions,
           COALESCE(SUM(rejected_conversions), 0) as rejected_conversions,
           COALESCE(SUM(revenue), 0) as total_revenue,
           COALESCE(SUM(payout), 0) as total_payout,
           COALESCE(SUM(profit), 0) as net_profit
         FROM ${rt}
         WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?`,
        [tenantId, dateFrom, dateTo]
      );

      const [prevRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(total_clicks), 0) as total_clicks,
           COALESCE(SUM(unique_ips), 0) as unique_clicks,
           COALESCE(SUM(total_conversions), 0) as total_conversions,
           COALESCE(SUM(revenue), 0) as total_revenue,
           COALESCE(SUM(payout), 0) as total_payout
         FROM ${rt}
         WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?`,
        [tenantId, prevFrom, prevTo]
      );

      const currentStats = currentRows[0] || {};
      const previousStats = prevRows[0] || {};

      // Compute Values
      const clicksTotal = parseInt(currentStats.total_clicks || 0);
      const uniqueClicks = parseInt(currentStats.unique_clicks || 0);
      const clicksPrev = parseInt(previousStats.total_clicks || 0);

      const convTotal = parseInt(currentStats.total_conversions || 0);
      const convApproved = parseInt(currentStats.approved_conversions || 0);
      const convPending = parseInt(currentStats.pending_conversions || 0);
      const convRejected = parseInt(currentStats.rejected_conversions || 0);
      const convClickExpired = 0;
      const convPrev = parseInt(previousStats.total_conversions || 0);

      const revTotal = parseFloat(currentStats.total_revenue || 0);
      const payoutTotal = parseFloat(currentStats.total_payout || 0);
      const revPrev = parseFloat(previousStats.total_revenue || 0);
      const payoutPrev = parseFloat(previousStats.total_payout || 0);

      const impTotal = 0;
      const impPrev = 0;

      const profit = parseFloat(currentStats.net_profit || (revTotal - payoutTotal));
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
      const dateFrom = filters.date_from || dates.currentFrom;
      const dateTo = filters.date_to || dates.currentTo;
      const rt = getReportingRollupTableName();

      const [rows] = await pool.query(
        `SELECT 
           COALESCE(SUM(unique_ips), 0) as unique_clicks,
           COALESCE(SUM(total_conversions), 0) as total,
           COALESCE(SUM(approved_conversions), 0) as approved,
           COALESCE(SUM(revenue), 0) as revenue,
           COALESCE(SUM(payout), 0) as payout,
           COALESCE(SUM(profit), 0) as profit
         FROM ${rt}
         WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?`,
        [tenantId, dateFrom, dateTo]
      );

      const r = rows[0] || {};
      const uniqueClicks = parseInt(r.unique_clicks || 0);
      const totalConversions = parseInt(r.total || 0);
      const approvedConversions = parseInt(r.approved || 0);
      const revenue = parseFloat(r.revenue || 0);
      const payout = parseFloat(r.payout || 0);
      const profit = parseFloat(r.profit || (revenue - payout));

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
   * Get offer statistics with clicks, conversions, CR, payouts, and profit using daily_reporting_rollup (strictly IST)
   */
  async getOfferStatistics(filters = {}, tenantId) {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const dateBoundaries = this.getDateBoundaries();
      const dateFrom = filters.date_from || dateBoundaries.monthStart;
      const dateTo = filters.date_to || dateBoundaries.todayStart;
      const rt = getReportingRollupTableName();

      const sortBy = filters.sort_by || 'clicks';
      const orderBy = filters.order_by || 'DESC';

      // Validate sort fields to prevent SQL injection
      const allowedSortFields = ['clicks', 'conversions', 'approved_conversions', 'pending_conversions', 'affiliate_payout', 'advertiser_payout', 'profit', 'offer_name', 'conversion_ratio', 'approved_conversion_ratio'];
      const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'clicks';
      const finalOrderBy = orderBy.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 10);
      const offset = (page - 1) * limit;

      const searchTerm = (filters.search || '').trim();
      const searchParams = [];
      let searchClause = '';
      if (searchTerm.length >= 1) {
        const wildcard = `%${searchTerm}%`;
        const numericId = /^\d+$/.test(searchTerm) ? parseInt(searchTerm, 10) : null;
        if (numericId !== null) {
          searchClause = ' AND (o.name LIKE ? OR o.public_offer_id = ?)';
          searchParams.push(wildcard, numericId);
        } else {
          searchClause = ' AND (o.name LIKE ? OR CAST(o.public_offer_id AS CHAR) LIKE ?)';
          searchParams.push(wildcard, wildcard);
        }
      }

      const [rows] = await pool.query(
        `SELECT 
          o.public_offer_id as offer_id,
          (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id,
          o.name as offer_name,
          COALESCE(dos.clicks, 0) as clicks,
          COALESCE(dos.conversions, 0) as conversions,
          COALESCE(dos.approved_conversions, 0) as approved_conversions,
          COALESCE(dos.pending_conversions, 0) as pending_conversions,
          COALESCE(dos.payout, 0) as affiliate_payout,
          COALESCE(dos.revenue, 0) as advertiser_payout,
          COALESCE(dos.profit, 0) as profit,
          CASE WHEN COALESCE(dos.clicks, 0) > 0 
               THEN (COALESCE(dos.conversions, 0) / COALESCE(dos.clicks, 0) * 100) 
               ELSE 0 END as conversion_ratio,
          CASE WHEN COALESCE(dos.clicks, 0) > 0 
               THEN (COALESCE(dos.approved_conversions, 0) / COALESCE(dos.clicks, 0) * 100) 
               ELSE 0 END as approved_conversion_ratio
        FROM offers o
        LEFT JOIN (
          SELECT 
            offer_id,
            COALESCE(SUM(total_clicks), 0) as clicks,
            COALESCE(SUM(total_conversions), 0) as conversions,
            COALESCE(SUM(approved_conversions), 0) as approved_conversions,
            COALESCE(SUM(pending_conversions), 0) as pending_conversions,
            COALESCE(SUM(payout), 0) as payout,
            COALESCE(SUM(revenue), 0) as revenue,
            COALESCE(SUM(profit), 0) as profit
          FROM ${rt}
          WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?
          GROUP BY offer_id
        ) dos ON o.id = dos.offer_id
        WHERE o.status != 'remove' AND o.tenant_id = ?${searchClause}
        ORDER BY ${finalSortBy} ${finalOrderBy}, clicks DESC, conversions DESC
        LIMIT ? OFFSET ?
        `,
        [tenantId, dateFrom, dateTo, tenantId, ...searchParams, limit, offset]
      );

      const [totalRows] = await pool.query(
        `SELECT COUNT(*) as total FROM offers o WHERE o.status != 'remove' AND o.tenant_id = ?${searchClause}`,
        [tenantId, ...searchParams]
      );

      return {
        data: rows.map(row => {
          const clicks = parseInt(row.clicks || 0);
          const conversions = parseInt(row.conversions || 0);
          const approvedConversions = parseInt(row.approved_conversions || 0);
          const conversionRatio = clicks > 0 ? ((conversions / clicks) * 100).toFixed(2) : '0.00';
          const approvedConversionRatio = clicks > 0 ? ((approvedConversions / clicks) * 100).toFixed(2) : '0.00';

          return {
            offer_id: row.offer_id,
            display_id: row.display_id,
            offer_name: row.offer_name,
            clicks: clicks,
            conversions: conversions,
            approved_conversions: approvedConversions,
            pending_conversions: parseInt(row.pending_conversions || 0),
            conversion_ratio: parseFloat(conversionRatio),
            approved_conversion_ratio: parseFloat(approvedConversionRatio),
            affiliate_payout: parseFloat(row.affiliate_payout || 0),
            advertiser_payout: parseFloat(row.advertiser_payout || 0),
            profit: parseFloat(row.profit || 0)
          };
        }),
        total: totalRows[0]?.total || 0,
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
      const sortedData = Array.from(mergedMap.values()).sort((a, b) => {
        if (groupBy === 'hour') {
          return a.label.localeCompare(b.label);
        } else {
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

      const sortBy = filters.sort_by || 'conversions';
      const orderBy = filters.order_by || 'DESC';

      // Validate sort fields
      const allowedSortFields = ['clicks', 'conversions', 'approved_conversions', 'pending_conversions', 'affiliate_payout', 'total_revenue', 'profit', 'publisher_name'];
      const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'conversions';
      const finalOrderBy = orderBy.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 10);
      const offset = (page - 1) * limit;

      const rt = getReportingRollupTableName();

      const [rows] = await pool.query(
        `SELECT 
          p.id as publisher_id, p.public_publisher_id as public_id,
          COALESCE(p.company_name, p.first_name, p.email, 'Unknown') as publisher_name,
          COALESCE(st.clicks, 0) as clicks,
          COALESCE(st.conversions, 0) as conversions,
          COALESCE(st.approved_conversions, 0) as approved_conversions,
          COALESCE(st.pending_conversions, 0) as pending_conversions,
          COALESCE(st.payout, 0) as affiliate_payout,
          COALESCE(st.revenue, 0) as total_revenue,
          COALESCE(st.profit, 0) as profit
        FROM publishers p
        LEFT JOIN (
          SELECT 
            publisher_id,
            COALESCE(SUM(total_clicks), 0) as clicks,
            COALESCE(SUM(total_conversions), 0) as conversions,
            COALESCE(SUM(approved_conversions), 0) as approved_conversions,
            COALESCE(SUM(pending_conversions), 0) as pending_conversions,
            COALESCE(SUM(payout), 0) as payout,
            COALESCE(SUM(revenue), 0) as revenue,
            COALESCE(SUM(profit), 0) as profit
          FROM ${rt}
          WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?
          GROUP BY publisher_id
        ) st ON p.id = st.publisher_id
        WHERE p.status != 'suspended' AND p.tenant_id = ?
        ORDER BY ${finalSortBy} ${finalOrderBy}, conversions DESC, clicks DESC
        LIMIT ? OFFSET ?
        `,
        [tenantId, dateFrom, dateTo, tenantId, limit, offset]
      );

      const [totalRows] = await pool.query(
        `SELECT COUNT(*) as total FROM publishers WHERE status != 'suspended' AND tenant_id = ?`,
        [tenantId]
      );

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

      const summaryPromise = reportService.getSummary({ date_from, date_to, range_start_utc, range_end_utc }, tenantId).catch(err => { logger.error('Error fetching summary:', err); return {}; });
      const summaryPreviousPromise = (previous_from && previous_to)
        ? reportService.getSummary({
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

export default new DashboardService();

