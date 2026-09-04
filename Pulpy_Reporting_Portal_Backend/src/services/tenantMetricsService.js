import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import redis from '../config/redis.js';
import { getReportingRollupTableName } from '../config/reportingRollupTable.js';
import { getIstTodayYmd, splitDateRangeForRollup } from '../utils/reportDailyRollup.js';
import { istYmdSpanToMysqlUtcRange } from '../utils/mysqlUtcRange.js';

function buildHybridOfferStatsSubquery(tenantId, dateFrom, dateTo) {
  const split = splitDateRangeForRollup(dateFrom, dateTo);
  const rt = getReportingRollupTableName();
  const unions = [];
  const params = [];

  if (split.useRollup) {
    unions.push(`
      SELECT 
        offer_id,
        COALESCE(SUM(total_clicks), 0) as clicks,
        COALESCE(SUM(unique_ips), 0) as unique_clicks,
        COALESCE(SUM(total_conversions), 0) as conversions,
        COALESCE(SUM(approved_conversions), 0) as approved_conversions,
        COALESCE(SUM(pending_conversions), 0) as pending_conversions,
        COALESCE(SUM(revenue), 0) as revenue,
        COALESCE(SUM(payout), 0) as payout,
        COALESCE(SUM(profit), 0) as profit
      FROM ${rt}
      WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?
      GROUP BY offer_id
    `);
    params.push(tenantId, split.rollupFrom, split.rollupTo);
  }

  if (split.scanToday) {
    const { start: todayUtcStart, end: todayUtcEnd } = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
    unions.push(`
      SELECT 
        c.offer_id,
        COUNT(*) as clicks,
        COUNT(DISTINCT c.ip) as unique_clicks,
        0 as conversions,
        0 as approved_conversions,
        0 as pending_conversions,
        0 as revenue,
        0 as payout,
        0 as profit
      FROM clicks c
      WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?
      GROUP BY c.offer_id
    `);
    params.push(tenantId, todayUtcStart, todayUtcEnd);

    unions.push(`
      SELECT 
        conv.offer_id,
        0 as clicks,
        0 as unique_clicks,
        COUNT(*) as conversions,
        SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
        SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
        COALESCE(SUM(conv.amount), 0) as revenue,
        COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
        (COALESCE(SUM(conv.amount), 0) - SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END)) as profit
      FROM conversions conv
      WHERE conv.tenant_id = ? AND conv.created_at BETWEEN ? AND ?
      GROUP BY conv.offer_id
    `);
    params.push(tenantId, todayUtcStart, todayUtcEnd);
  }

  if (unions.length === 0) {
    return {
      sql: `(SELECT NULL as offer_id, 0 as clicks, 0 as unique_clicks, 0 as conversions, 0 as approved_conversions, 0 as pending_conversions, 0 as revenue, 0 as payout, 0 as profit WHERE 1=0)`,
      params: []
    };
  }

  const sql = `(
    SELECT 
      offer_id,
      SUM(clicks) as clicks,
      SUM(unique_clicks) as unique_clicks,
      SUM(conversions) as conversions,
      SUM(approved_conversions) as approved_conversions,
      SUM(pending_conversions) as pending_conversions,
      SUM(revenue) as revenue,
      SUM(payout) as payout,
      SUM(profit) as profit
    FROM (
      ${unions.join(' UNION ALL ')}
    ) combined_offers
    GROUP BY offer_id
  )`;

  return { sql, params };
}

/**
 * Tenant Metrics Service
 * Provides observability and monitoring for tenants
 */
export class TenantMetricsService {
  async queryHybridTenantSummary(tenantId, dateFrom, dateTo) {
    const split = splitDateRangeForRollup(dateFrom, dateTo);
    const rt = getReportingRollupTableName();

    let totalClicks = 0;
    let uniqueClicks = 0;
    let totalConversions = 0;
    let approvedConversions = 0;
    let pendingConversions = 0;
    let rejectedConversions = 0;
    let revenue = 0;
    let payout = 0;
    let profit = 0;

    if (split.useRollup) {
      const [rows] = await pool.query(
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
        [tenantId, split.rollupFrom, split.rollupTo]
      );
      const sum = rows[0] || {};
      totalClicks += parseInt(sum.total_clicks || 0, 10);
      uniqueClicks += parseInt(sum.unique_clicks || 0, 10);
      totalConversions += parseInt(sum.total_conversions || 0, 10);
      approvedConversions += parseInt(sum.approved_conversions || 0, 10);
      pendingConversions += parseInt(sum.pending_conversions || 0, 10);
      rejectedConversions += parseInt(sum.rejected_conversions || 0, 10);
      revenue += parseFloat(sum.total_revenue || 0);
      payout += parseFloat(sum.total_payout || 0);
      profit += parseFloat(sum.net_profit || 0);
    }

    if (split.scanToday) {
      const { start: todayUtcStart, end: todayUtcEnd } = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
      const [clickRows] = await pool.query(
        `SELECT 
           COUNT(*) as total_clicks,
           COUNT(DISTINCT ip) as unique_clicks
         FROM clicks
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, todayUtcStart, todayUtcEnd]
      );
      const [convRows] = await pool.query(
        `SELECT 
           COUNT(*) as total_conversions,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_conversions,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_conversions,
           COUNT(CASE WHEN status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 END) as rejected_conversions,
           COALESCE(SUM(amount), 0) as total_revenue,
           COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as total_payout
         FROM conversions
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, todayUtcStart, todayUtcEnd]
      );

      const c = clickRows[0] || {};
      const cv = convRows[0] || {};
      totalClicks += parseInt(c.total_clicks || 0, 10);
      uniqueClicks += parseInt(c.unique_clicks || 0, 10);
      totalConversions += parseInt(cv.total_conversions || 0, 10);
      approvedConversions += parseInt(cv.approved_conversions || 0, 10);
      pendingConversions += parseInt(cv.pending_conversions || 0, 10);
      rejectedConversions += parseInt(cv.rejected_conversions || 0, 10);
      const cvRev = parseFloat(cv.total_revenue || 0);
      const cvPay = parseFloat(cv.total_payout || 0);
      revenue += cvRev;
      payout += cvPay;
      profit += (cvRev - cvPay);
    }

    return {
      total_clicks: totalClicks,
      unique_clicks: uniqueClicks,
      total_conversions: totalConversions,
      approved_conversions: approvedConversions,
      pending_conversions: pendingConversions,
      rejected_conversions: rejectedConversions,
      total_revenue: revenue,
      total_payout: payout,
      net_profit: profit
    };
  }

  /**
   * Get comprehensive metrics for a tenant
   */
  async getTenantMetrics(tenantId, dateFrom = null, dateTo = null) {
    try {
      const metrics = {
        tenant_id: tenantId,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        clicks: {},
        conversions: {},
        revenue: {},
        publishers: {},
        offers: {},
        redis: {},
      };

      const todayIST = getIstTodayYmd();
      if (!dateFrom || !dateTo) {
        dateTo = todayIST;
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const tStat = await this.queryHybridTenantSummary(tenantId, todayIST, todayIST);
      const pStat = await this.queryHybridTenantSummary(tenantId, dateFrom, dateTo);

      metrics.clicks = {
        today: {
          total: parseInt(tStat.total_clicks || 0),
          unique: parseInt(tStat.unique_clicks || 0),
        },
        period: {
          total: parseInt(pStat.total_clicks || 0),
          unique: parseInt(pStat.unique_clicks || 0),
        },
      };

      metrics.conversions = {
        today: {
          total: parseInt(tStat.total_conversions || 0),
          approved: parseInt(tStat.approved_conversions || 0),
          pending: parseInt(tStat.pending_conversions || 0),
          rejected: parseInt(tStat.rejected_conversions || 0),
        },
        period: {
          total: parseInt(pStat.total_conversions || 0),
          approved: parseInt(pStat.approved_conversions || 0),
          pending: parseInt(pStat.pending_conversions || 0),
          rejected: parseInt(pStat.rejected_conversions || 0),
        },
      };

      metrics.revenue = {
        today: parseFloat(tStat.total_revenue || 0),
        payout_today: parseFloat(tStat.total_payout || 0),
        period: parseFloat(pStat.total_revenue || 0),
        payout_period: parseFloat(pStat.total_payout || 0),
        profit_period: parseFloat(pStat.net_profit || ((parseFloat(pStat.total_revenue || 0)) - (parseFloat(pStat.total_payout || 0)))),
      };

      // Publishers count
      const [publishersCount] = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
         FROM publishers
         WHERE tenant_id = ?`,
        [tenantId]
      );

      metrics.publishers = {
        total: parseInt(publishersCount[0]?.total || 0),
        active: parseInt(publishersCount[0]?.active || 0),
      };

      // Offers count
      const [offersCount] = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as live
         FROM offers
         WHERE tenant_id = ?`,
        [tenantId]
      );

      metrics.offers = {
        total: parseInt(offersCount[0]?.total || 0),
        live: parseInt(offersCount[0]?.live || 0),
      };

      // Redis queue depth (approximate)
      try {
        const streamLength = await redis.xlen('stream:clicks');
        metrics.redis = {
          click_queue_depth: streamLength || 0,
          note: 'Global queue depth, not tenant-specific',
        };
      } catch (e) {
        logger.warn('Failed to get Redis queue depth', e);
        metrics.redis = { error: 'Unable to fetch queue depth' };
      }

      return metrics;
    } catch (error) {
      logger.error('TenantMetricsService.getTenantMetrics error:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive stats and daily breakdown for a tenant in a date range using hybrid query
   */
  async getTenantStats(tenantId, dateFrom = null, dateTo = null) {
    try {
      const todayIST = getIstTodayYmd();
      if (!dateFrom || !dateTo) {
        dateTo = todayIST;
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const sum = await this.queryHybridTenantSummary(tenantId, dateFrom, dateTo);

      // Counts
      const [offersCount] = await pool.query(
        `SELECT 
           COUNT(*) as total_offers,
           SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as active_offers
         FROM offers
         WHERE tenant_id = ?`,
        [tenantId]
      );

      const [publishersCount] = await pool.query(
        `SELECT 
           COUNT(*) as total_publishers,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_publishers
         FROM publishers
         WHERE tenant_id = ?`,
        [tenantId]
      );

      const totalClicks = parseInt(sum.total_clicks || 0);
      const uniqueClicks = parseInt(sum.unique_clicks || 0);
      const totalConversions = parseInt(sum.total_conversions || 0);
      const approvedConversions = parseInt(sum.approved_conversions || 0);
      const pendingConversions = parseInt(sum.pending_conversions || 0);
      const rejectedConversions = parseInt(sum.rejected_conversions || 0);
      const revenue = parseFloat(sum.total_revenue || 0);
      const payout = parseFloat(sum.total_payout || 0);
      const profit = parseFloat(sum.net_profit || (revenue - payout));
      const cr = totalClicks > 0 ? parseFloat(((totalConversions / totalClicks) * 100).toFixed(2)) : 0;
      const approvedCr = totalClicks > 0 ? parseFloat(((approvedConversions / totalClicks) * 100).toFixed(2)) : 0;
      const epc = totalClicks > 0 ? parseFloat((revenue / totalClicks).toFixed(4)) : 0;

      // Daily Breakdown
      const split = splitDateRangeForRollup(dateFrom, dateTo);
      const rt = getReportingRollupTableName();
      const dailyMap = new Map();

      if (split.useRollup) {
        const [dailyRows] = await pool.query(
          `SELECT 
             DATE_FORMAT(stat_date, '%Y-%m-%d') as date,
             COALESCE(SUM(total_clicks), 0) as clicks,
             COALESCE(SUM(unique_ips), 0) as unique_clicks,
             COALESCE(SUM(total_conversions), 0) as conversions,
             COALESCE(SUM(approved_conversions), 0) as approved,
             COALESCE(SUM(pending_conversions), 0) as pending,
             COALESCE(SUM(rejected_conversions), 0) as rejected,
             COALESCE(SUM(revenue), 0) as revenue,
             COALESCE(SUM(payout), 0) as payout,
             COALESCE(SUM(profit), 0) as profit
           FROM ${rt}
           WHERE tenant_id = ? AND stat_date BETWEEN ? AND ?
           GROUP BY date
           ORDER BY date DESC`,
          [tenantId, split.rollupFrom, split.rollupTo]
        );

        for (const row of dailyRows) {
          const c = parseInt(row.clicks || 0);
          const conv = parseInt(row.conversions || 0);
          const rev = parseFloat(row.revenue || 0);
          const pay = parseFloat(row.payout || 0);
          const prof = parseFloat(row.profit || (rev - pay));

          dailyMap.set(row.date, {
            date: row.date,
            clicks: c,
            unique_clicks: parseInt(row.unique_clicks || 0),
            conversions: conv,
            approved: parseInt(row.approved || 0),
            pending: parseInt(row.pending || 0),
            rejected: parseInt(row.rejected || 0),
            revenue: rev,
            payout: pay,
            profit: prof,
            cr: c > 0 ? parseFloat(((conv / c) * 100).toFixed(2)) : 0,
            epc: c > 0 ? parseFloat((rev / c).toFixed(4)) : 0,
          });
        }
      }

      if (split.scanToday) {
        const todaySummary = await this.queryHybridTenantSummary(tenantId, split.todayIST, split.todayIST);
        const c = todaySummary.total_clicks;
        const conv = todaySummary.total_conversions;
        const rev = todaySummary.total_revenue;
        const pay = todaySummary.total_payout;
        const prof = todaySummary.net_profit;

        dailyMap.set(split.todayIST, {
          date: split.todayIST,
          clicks: c,
          unique_clicks: todaySummary.unique_clicks,
          conversions: conv,
          approved: todaySummary.approved_conversions,
          pending: todaySummary.pending_conversions,
          rejected: todaySummary.rejected_conversions,
          revenue: rev,
          payout: pay,
          profit: prof,
          cr: c > 0 ? parseFloat(((conv / c) * 100).toFixed(2)) : 0,
          epc: c > 0 ? parseFloat((rev / c).toFixed(4)) : 0,
        });
      }

      const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

      return {
        tenant_id: tenantId,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        summary: {
          total_clicks: totalClicks,
          unique_clicks: uniqueClicks,
          total_conversions: totalConversions,
          approved_conversions: approvedConversions,
          pending_conversions: pendingConversions,
          rejected_conversions: rejectedConversions,
          total_revenue: revenue,
          total_payout: payout,
          net_profit: profit,
          conversion_rate: cr,
          approved_cr: approvedCr,
          epc: epc,
          total_offers: parseInt(offersCount[0]?.total_offers || 0),
          active_offers: parseInt(offersCount[0]?.active_offers || 0),
          total_publishers: parseInt(publishersCount[0]?.total_publishers || 0),
          active_publishers: parseInt(publishersCount[0]?.active_publishers || 0),
        },
        daily_breakdown: dailyBreakdown,
      };
    } catch (error) {
      logger.error('TenantMetricsService.getTenantStats error:', error);
      throw error;
    }
  }

  /**
   * Get offers list with performance stats for a tenant using hybrid query
   */
  async getTenantOffers(tenantId, dateFrom = null, dateTo = null, { search = '', status = '', page = 1, limit = 20 } = {}) {
    try {
      const todayIST = getIstTodayYmd();
      if (!dateFrom || !dateTo) {
        dateTo = todayIST;
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['o.tenant_id = ?'];
      const params = [tenantId];

      if (status) {
        whereConditions.push('LOWER(o.status) = LOWER(?)');
        params.push(status);
      }

      if (search && search.trim()) {
        whereConditions.push('(o.name LIKE ? OR o.public_offer_id LIKE ? OR CAST(o.id AS CHAR) LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      const whereClause = whereConditions.join(' AND ');

      // Total count query
      const countParams = [tenantId];
      const countConditions = ['o.tenant_id = ?'];
      if (status) {
        countConditions.push('LOWER(o.status) = LOWER(?)');
        countParams.push(status);
      }
      if (search && search.trim()) {
        countConditions.push('(o.name LIKE ? OR o.public_offer_id LIKE ? OR CAST(o.id AS CHAR) LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        countParams.push(searchPattern, searchPattern, searchPattern);
      }

      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM offers o WHERE ${countConditions.join(' AND ')}`,
        countParams
      );
      const total = parseInt(countRows[0]?.total || 0);

      const sub = buildHybridOfferStatsSubquery(tenantId, dateFrom, dateTo);

      const query = `
        SELECT 
          o.id,
          o.public_offer_id,
          o.name,
          o.status,
          o.category,
          o.affiliate_model,
          o.affiliate_amount,
          o.created_at,
          COALESCE(adv.company_name, adv.name, 'N/A') as advertiser_name,
          COALESCE(dos.clicks, 0) as total_clicks,
          COALESCE(dos.unique_clicks, 0) as unique_clicks,
          COALESCE(dos.conversions, 0) as total_conversions,
          COALESCE(dos.approved_conversions, 0) as approved_conversions,
          COALESCE(dos.revenue, 0) as total_revenue,
          COALESCE(dos.payout, 0) as total_payout,
          COALESCE(dos.profit, 0) as net_profit
        FROM offers o
        LEFT JOIN advertisers adv ON o.advertiser_id = adv.id
        LEFT JOIN ${sub.sql} dos ON dos.offer_id = o.id
        WHERE ${whereClause}
        ORDER BY total_clicks DESC, o.id DESC
        LIMIT ? OFFSET ?
      `;

      const fullParams = [
        ...sub.params,
        ...params,
        parsedLimit,
        offset
      ];

      const [rows] = await pool.query(query, fullParams);

      const offers = rows.map(row => {
        const clicks = parseInt(row.total_clicks || 0);
        const conversions = parseInt(row.total_conversions || 0);
        const approvedConversions = parseInt(row.approved_conversions || 0);
        const revenue = parseFloat(row.total_revenue || 0);
        const payout = parseFloat(row.total_payout || 0);
        const profit = parseFloat(row.net_profit || (revenue - payout));
        const cr = clicks > 0 ? parseFloat(((conversions / clicks) * 100).toFixed(2)) : 0;
        const approvedCr = clicks > 0 ? parseFloat(((approvedConversions / clicks) * 100).toFixed(2)) : 0;
        const epc = clicks > 0 ? parseFloat((revenue / clicks).toFixed(4)) : 0;

        return {
          id: row.id,
          public_offer_id: row.public_offer_id,
          name: row.name,
          status: row.status,
          category: row.category,
          affiliate_model: row.affiliate_model,
          affiliate_amount: parseFloat(row.affiliate_amount || 0),
          advertiser_name: row.advertiser_name,
          created_at: row.created_at,
          metrics: {
            clicks,
            unique_clicks: parseInt(row.unique_clicks || 0),
            conversions,
            approved_conversions: approvedConversions,
            revenue,
            payout,
            profit,
            cr,
            approved_cr: approvedCr,
            epc,
          },
        };
      });

      return {
        tenant_id: tenantId,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        offers,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
        },
      };
    } catch (error) {
      logger.error('TenantMetricsService.getTenantOffers error:', error);
      throw error;
    }
  }

  /**
   * Get publishers list with performance stats for a tenant using raw clicks and conversions
   */
  async getTenantPublishers(tenantId, dateFrom = null, dateTo = null, { search = '', status = '', page = 1, limit = 20 } = {}) {
    try {
      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['p.tenant_id = ?'];
      const params = [tenantId];

      if (status) {
        whereConditions.push('LOWER(p.status) = LOWER(?)');
        params.push(status);
      }

      if (search && search.trim()) {
        whereConditions.push('(p.company_name LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.email LIKE ? OR CAST(p.id AS CHAR) LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const whereClause = whereConditions.join(' AND ');

      // Total count query
      const countParams = [tenantId];
      const countConditions = ['p.tenant_id = ?'];
      if (status) {
        countConditions.push('LOWER(p.status) = LOWER(?)');
        countParams.push(status);
      }
      if (search && search.trim()) {
        countConditions.push('(p.company_name LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.email LIKE ? OR CAST(p.id AS CHAR) LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        countParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM publishers p WHERE ${countConditions.join(' AND ')}`,
        countParams
      );
      const total = parseInt(countRows[0]?.total || 0);

      let clicksDateClause = '';
      let convDateClause = '';
      const dateParams = [];

      if (dateFrom && dateTo) {
        const { start, end } = istYmdSpanToMysqlUtcRange(dateFrom, dateTo);
        clicksDateClause = 'AND c.created_at BETWEEN ? AND ?';
        convDateClause = 'AND conv.created_at BETWEEN ? AND ?';
        dateParams.push(start, end);
      }

      const query = `
        SELECT 
          p.id,
          p.public_publisher_id,
          p.company_name,
          p.first_name,
          p.last_name,
          p.email,
          p.status,
          p.created_at,
          COALESCE(c.total_clicks, 0) as total_clicks,
          COALESCE(c.unique_clicks, 0) as unique_clicks,
          COALESCE(conv.total_conversions, 0) as total_conversions,
          COALESCE(conv.approved_conversions, 0) as approved_conversions,
          COALESCE(conv.total_revenue, 0) as total_revenue,
          COALESCE(conv.total_payout, 0) as total_payout,
          (COALESCE(conv.total_revenue, 0) - COALESCE(conv.total_payout, 0)) as net_profit
        FROM publishers p
        LEFT JOIN (
          SELECT 
            publisher_id,
            COUNT(*) as total_clicks,
            COUNT(DISTINCT ip) as unique_clicks
          FROM clicks c
          WHERE c.tenant_id = ? ${clicksDateClause}
          GROUP BY publisher_id
        ) c ON c.publisher_id = p.id
        LEFT JOIN (
          SELECT 
            publisher_id,
            COUNT(*) as total_conversions,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
            SUM(amount) as total_revenue,
            SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END) as total_payout
          FROM conversions conv
          WHERE conv.tenant_id = ? ${convDateClause}
          GROUP BY publisher_id
        ) conv ON conv.publisher_id = p.id
        WHERE ${whereClause}
        ORDER BY total_clicks DESC, p.id DESC
        LIMIT ? OFFSET ?
      `;

      const fullParams = [
        tenantId,
        ...(dateParams.length > 0 ? dateParams : []),
        tenantId,
        ...(dateParams.length > 0 ? dateParams : []),
        ...params,
        parsedLimit,
        offset
      ];

      const [rows] = await pool.query(query, fullParams);

      const publishers = rows.map(row => {
        const clicks = parseInt(row.total_clicks || 0);
        const conversions = parseInt(row.total_conversions || 0);
        const approvedConversions = parseInt(row.approved_conversions || 0);
        const revenue = parseFloat(row.total_revenue || 0);
        const payout = parseFloat(row.total_payout || 0);
        const profit = parseFloat(row.net_profit || (revenue - payout));
        const cr = clicks > 0 ? parseFloat(((conversions / clicks) * 100).toFixed(2)) : 0;
        const approvedCr = clicks > 0 ? parseFloat(((approvedConversions / clicks) * 100).toFixed(2)) : 0;
        const epc = clicks > 0 ? parseFloat((revenue / clicks).toFixed(4)) : 0;

        return {
          id: row.id,
          public_publisher_id: row.public_publisher_id,
          company_name: row.company_name,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          status: row.status,
          created_at: row.created_at,
          metrics: {
            clicks,
            unique_clicks: parseInt(row.unique_clicks || 0),
            conversions,
            approved_conversions: approvedConversions,
            revenue,
            payout,
            profit,
            cr,
            approved_cr: approvedCr,
            epc,
          },
        };
      });

      return {
        tenant_id: tenantId,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        publishers,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
        },
      };
    } catch (error) {
      logger.error('TenantMetricsService.getTenantPublishers error:', error);
      throw error;
    }
  }

  /**
   * Get raw clicks list for a tenant with filters and pagination
   */
  async getTenantClicks(tenantId, dateFrom = null, dateTo = null, { offerId = null, publisherId = null, page = 1, limit = 50 } = {}) {
    try {
      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 50));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['c.tenant_id = ?'];
      const params = [tenantId];

      if (dateFrom && dateTo) {
        const { start, end } = istYmdSpanToMysqlUtcRange(dateFrom, dateTo);
        whereConditions.push('c.created_at BETWEEN ? AND ?');
        params.push(start, end);
      }

      if (offerId) {
        whereConditions.push('c.offer_id = ?');
        params.push(offerId);
      }

      if (publisherId) {
        whereConditions.push('c.publisher_id = ?');
        params.push(publisherId);
      }

      const whereClause = whereConditions.join(' AND ');

      // Total count query
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM clicks c WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countRows[0]?.total || 0);

      // Clicks list with offer and publisher details
      const query = `
        SELECT 
          c.id,
          c.click_uuid,
          c.offer_id,
          o.name as offer_name,
          o.public_offer_id,
          c.publisher_id,
          p.company_name as publisher_company_name,
          p.first_name as publisher_first_name,
          p.last_name as publisher_last_name,
          p.public_publisher_id,
          c.ip,
          c.country,
          c.city,
          c.device_type,
          c.os,
          c.browser,
          c.sub1,
          c.sub2,
          c.sub3,
          c.sub4,
          c.sub5,
          c.created_at,
          CASE WHEN conv.id IS NOT NULL THEN 1 ELSE 0 END as is_converted,
          conv.status as conversion_status,
          conv.amount as conversion_amount,
          conv.payout as conversion_payout
        FROM clicks c
        LEFT JOIN offers o ON o.id = c.offer_id
        LEFT JOIN publishers p ON p.id = c.publisher_id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await pool.query(query, [...params, parsedLimit, offset]);

      return {
        tenant_id: tenantId,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        clicks: rows,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
        },
      };
    } catch (error) {
      logger.error('TenantMetricsService.getTenantClicks error:', error);
      throw error;
    }
  }

  /**
   * Get conversions list for a tenant with filters and pagination
   */
  async getTenantConversions(tenantId, dateFrom = null, dateTo = null, { offerId = null, publisherId = null, status = null, page = 1, limit = 50 } = {}) {
    try {
      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 50));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['conv.tenant_id = ?'];
      const params = [tenantId];

      if (dateFrom && dateTo) {
        const { start, end } = istYmdSpanToMysqlUtcRange(dateFrom, dateTo);
        whereConditions.push('conv.created_at BETWEEN ? AND ?');
        params.push(start, end);
      }

      if (offerId) {
        whereConditions.push('conv.offer_id = ?');
        params.push(offerId);
      }

      if (publisherId) {
        whereConditions.push('conv.publisher_id = ?');
        params.push(publisherId);
      }

      if (status) {
        whereConditions.push('conv.status = ?');
        params.push(status);
      }

      const whereClause = whereConditions.join(' AND ');

      // Total count query
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM conversions conv WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countRows[0]?.total || 0);

      // Conversions list with offer, publisher, and click details
      const query = `
        SELECT 
          conv.id,
          conv.click_uuid,
          conv.conversion_id,
          conv.offer_id,
          o.name as offer_name,
          o.public_offer_id,
          conv.publisher_id,
          p.company_name as publisher_company_name,
          p.first_name as publisher_first_name,
          p.last_name as publisher_last_name,
          p.public_publisher_id,
          conv.status,
          conv.amount,
          conv.payout,
          conv.currency,
          conv.sub1,
          conv.sub2,
          conv.sub3,
          conv.sub4,
          conv.sub5,
          conv.ip,
          conv.country,
          conv.created_at,
          conv.updated_at,
          c.device_type,
          c.os,
          c.browser
        FROM conversions conv
        LEFT JOIN offers o ON o.id = conv.offer_id
        LEFT JOIN publishers p ON p.id = conv.publisher_id
        LEFT JOIN clicks c ON c.click_uuid = conv.click_uuid
        WHERE ${whereClause}
        ORDER BY conv.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await pool.query(query, [...params, parsedLimit, offset]);

      return {
        tenant_id: tenantId,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        conversions: rows,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
        },
      };
    } catch (error) {
      logger.error('TenantMetricsService.getTenantConversions error:', error);
      throw error;
    }
  }

  /**
   * Get daily metrics for a tenant (last N days) using hybrid approach
   */
  async getTenantDailyMetrics(tenantId, days = 30) {
    try {
      const todayIST = getIstTodayYmd();
      const fromDateObj = new Date(Date.now() + 330 * 60 * 1000 - days * 24 * 60 * 60 * 1000);
      const dateFrom = fromDateObj.toISOString().split('T')[0];
      const dateTo = todayIST;

      const split = splitDateRangeForRollup(dateFrom, dateTo);
      const rt = getReportingRollupTableName();
      const dailyMap = new Map();

      if (split.useRollup) {
        const [rows] = await pool.query(
          `SELECT 
             DATE_FORMAT(stat_date, '%Y-%m-%d') as date,
             COALESCE(SUM(total_clicks), 0) as clicks,
             COALESCE(SUM(unique_ips), 0) as unique_clicks,
             COALESCE(SUM(total_conversions), 0) as conversions,
             COALESCE(SUM(approved_conversions), 0) as approved_conversions,
             COALESCE(SUM(revenue), 0) as revenue,
             COALESCE(SUM(payout), 0) as payout,
             COALESCE(SUM(profit), 0) as profit
           FROM ${rt}
           WHERE tenant_id = ?
             AND stat_date BETWEEN ? AND ?
           GROUP BY date
           ORDER BY date DESC`,
          [tenantId, split.rollupFrom, split.rollupTo]
        );

        for (const r of rows) {
          dailyMap.set(r.date, r);
        }
      }

      if (split.scanToday) {
        const todaySummary = await this.queryHybridTenantSummary(tenantId, split.todayIST, split.todayIST);
        dailyMap.set(split.todayIST, {
          date: split.todayIST,
          clicks: todaySummary.total_clicks,
          unique_clicks: todaySummary.unique_clicks,
          conversions: todaySummary.total_conversions,
          approved_conversions: todaySummary.approved_conversions,
          revenue: todaySummary.total_revenue,
          payout: todaySummary.total_payout,
          profit: todaySummary.net_profit,
        });
      }

      return Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      logger.error('TenantMetricsService.getTenantDailyMetrics error:', error);
      throw error;
    }
  }

  /**
   * Get top performing offers for a tenant using hybrid approach
   */
  async getTenantTopOffers(tenantId, limit = 10, dateFrom = null, dateTo = null) {
    try {
      const todayIST = getIstTodayYmd();
      if (!dateFrom || !dateTo) {
        dateTo = todayIST;
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const sub = buildHybridOfferStatsSubquery(tenantId, dateFrom, dateTo);

      const [rows] = await pool.query(
        `SELECT 
           o.id,
           o.name,
           COALESCE(dos.clicks, 0) as clicks,
           COALESCE(dos.unique_clicks, 0) as unique_clicks,
           COALESCE(dos.conversions, 0) as conversions,
           COALESCE(dos.approved_conversions, 0) as approved_conversions,
           COALESCE(dos.revenue, 0) as revenue,
           COALESCE(dos.payout, 0) as payout,
           COALESCE(dos.profit, 0) as profit
         FROM offers o
         INNER JOIN ${sub.sql} dos ON dos.offer_id = o.id
         WHERE o.tenant_id = ?
         GROUP BY o.id, o.name
         ORDER BY conversions DESC, revenue DESC
         LIMIT ?`,
        [...sub.params, tenantId, limit]
      );

      return rows;
    } catch (error) {
      logger.error('TenantMetricsService.getTenantTopOffers error:', error);
      throw error;
    }
  }
}

export default new TenantMetricsService();
