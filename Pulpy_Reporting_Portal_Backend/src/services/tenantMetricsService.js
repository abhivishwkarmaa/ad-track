import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import redis from '../config/redis.js';

/**
 * Tenant Metrics Service
 * Provides observability and monitoring for tenants
 */
export class TenantMetricsService {
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

      // Get date boundaries if not provided
      if (!dateFrom || !dateTo) {
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      // IST Day boundaries for "Today"
      const todayStartUTC = new Date(`${dateTo}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const todayEndUTC = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // Period boundaries
      const periodStartUTC = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const periodEndUTC = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // Clicks metrics
      const [clicksToday] = await pool.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks
         FROM clicks
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, todayStartUTC, todayEndUTC]
      );

      const [clicksPeriod] = await pool.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks
         FROM clicks
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, periodStartUTC, periodEndUTC]
      );

      metrics.clicks = {
        today: {
          total: parseInt(clicksToday[0]?.total || 0),
          unique: parseInt(clicksToday[0]?.unique_clicks || 0),
        },
        period: {
          total: parseInt(clicksPeriod[0]?.total || 0),
          unique: parseInt(clicksPeriod[0]?.unique_clicks || 0),
        },
      };

      // Conversions metrics
      const [conversionsToday] = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
           COALESCE(SUM(amount), 0) as revenue,
           COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
         FROM conversions
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, todayStartUTC, todayEndUTC]
      );

      const [conversionsPeriod] = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
           COALESCE(SUM(amount), 0) as revenue,
           COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
         FROM conversions
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
        [tenantId, periodStartUTC, periodEndUTC]
      );

      metrics.conversions = {
        today: {
          total: parseInt(conversionsToday[0]?.total || 0),
          approved: parseInt(conversionsToday[0]?.approved || 0),
          pending: parseInt(conversionsToday[0]?.pending || 0),
          rejected: parseInt(conversionsToday[0]?.rejected || 0),
        },
        period: {
          total: parseInt(conversionsPeriod[0]?.total || 0),
          approved: parseInt(conversionsPeriod[0]?.approved || 0),
        },
      };

      metrics.revenue = {
        today: parseFloat(conversionsToday[0]?.revenue || 0),
        payout_today: parseFloat(conversionsToday[0]?.payout || 0),
        period: parseFloat(conversionsPeriod[0]?.revenue || 0),
        payout_period: parseFloat(conversionsPeriod[0]?.payout || 0),
        profit_period: parseFloat(conversionsPeriod[0]?.revenue || 0) - parseFloat(conversionsPeriod[0]?.payout || 0),
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
        // Note: This is global, not tenant-specific. For tenant-specific metrics,
        // you'd need to track tenant_id in the stream or use separate streams per tenant
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
   * Get comprehensive stats and daily breakdown for a tenant in a date range using daily_offer_stats
   */
  async getTenantStats(tenantId, dateFrom = null, dateTo = null) {
    try {
      if (!dateFrom || !dateTo) {
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      // Summary from daily_offer_stats table
      const [summaryRows] = await pool.query(
        `SELECT 
           COALESCE(SUM(clicks), 0) as total_clicks,
           COALESCE(SUM(unique_clicks), 0) as unique_clicks,
           COALESCE(SUM(conversions), 0) as total_conversions,
           COALESCE(SUM(approved_conversions), 0) as approved_conversions,
           COALESCE(SUM(pending_conversions), 0) as pending_conversions,
           COALESCE(SUM(rejected_conversions), 0) as rejected_conversions,
           COALESCE(SUM(revenue), 0) as total_revenue,
           COALESCE(SUM(payout), 0) as total_payout,
           COALESCE(SUM(profit), 0) as net_profit
         FROM daily_offer_stats
         WHERE tenant_id = ? AND day BETWEEN ? AND ?`,
        [tenantId, dateFrom, dateTo]
      );

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

      const sum = summaryRows[0] || {};
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

      // Daily Breakdown from daily_offer_stats
      const [dailyRows] = await pool.query(
        `SELECT 
           DATE_FORMAT(day, '%Y-%m-%d') as date,
           COALESCE(SUM(clicks), 0) as clicks,
           COALESCE(SUM(unique_clicks), 0) as unique_clicks,
           COALESCE(SUM(conversions), 0) as conversions,
           COALESCE(SUM(approved_conversions), 0) as approved,
           COALESCE(SUM(pending_conversions), 0) as pending,
           COALESCE(SUM(rejected_conversions), 0) as rejected,
           COALESCE(SUM(revenue), 0) as revenue,
           COALESCE(SUM(payout), 0) as payout,
           COALESCE(SUM(profit), 0) as profit
         FROM daily_offer_stats
         WHERE tenant_id = ? AND day BETWEEN ? AND ?
         GROUP BY date
         ORDER BY date DESC`,
        [tenantId, dateFrom, dateTo]
      );

      const dailyBreakdown = dailyRows.map(row => {
        const c = parseInt(row.clicks || 0);
        const conv = parseInt(row.conversions || 0);
        const rev = parseFloat(row.revenue || 0);
        const pay = parseFloat(row.payout || 0);
        const prof = parseFloat(row.profit || (rev - pay));

        return {
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
        };
      });

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
   * Get offers list with performance stats for a tenant using daily_offer_stats
   */
  async getTenantOffers(tenantId, dateFrom = null, dateTo = null, { search = '', status = '', page = 1, limit = 20 } = {}) {
    try {
      if (!dateFrom || !dateTo) {
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['o.tenant_id = ?'];
      const params = [tenantId, dateFrom, dateTo, tenantId];

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
        LEFT JOIN (
          SELECT 
            offer_id,
            COALESCE(SUM(clicks), 0) as clicks,
            COALESCE(SUM(unique_clicks), 0) as unique_clicks,
            COALESCE(SUM(conversions), 0) as conversions,
            COALESCE(SUM(approved_conversions), 0) as approved_conversions,
            COALESCE(SUM(revenue), 0) as revenue,
            COALESCE(SUM(payout), 0) as payout,
            COALESCE(SUM(profit), 0) as profit
          FROM daily_offer_stats
          WHERE tenant_id = ? AND day BETWEEN ? AND ?
          GROUP BY offer_id
        ) dos ON dos.offer_id = o.id
        WHERE ${whereClause}
        ORDER BY total_clicks DESC, o.id DESC
        LIMIT ? OFFSET ?
      `;

      const fullParams = [
        ...params,
        parsedLimit,
        offset
      ];

      const [rows] = await pool.query(query, fullParams);

      const formattedOffers = rows.map(r => {
        const clicks = parseInt(r.total_clicks || 0);
        const unique = parseInt(r.unique_clicks || 0);
        const conversions = parseInt(r.total_conversions || 0);
        const approved = parseInt(r.approved_conversions || 0);
        const revenue = parseFloat(r.total_revenue || 0);
        const payout = parseFloat(r.total_payout || 0);
        const profit = parseFloat(r.net_profit || (revenue - payout));
        const cr = clicks > 0 ? parseFloat(((conversions / clicks) * 100).toFixed(2)) : 0;
        const epc = clicks > 0 ? parseFloat((revenue / clicks).toFixed(4)) : 0;

        return {
          id: r.id,
          public_offer_id: r.public_offer_id,
          name: r.name,
          status: r.status,
          category: r.category,
          affiliate_model: r.affiliate_model,
          affiliate_amount: parseFloat(r.affiliate_amount || 0),
          advertiser_name: r.advertiser_name,
          created_at: r.created_at,
          total_clicks: clicks,
          unique_clicks: unique,
          total_conversions: conversions,
          approved_conversions: approved,
          total_revenue: revenue,
          total_payout: payout,
          net_profit: profit,
          conversion_rate: cr,
          epc: epc,
        };
      });

      return {
        data: formattedOffers,
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
   * Get clicks log for a tenant
   */
  async getTenantClicks(tenantId, dateFrom = null, dateTo = null, { search = '', offerId = null, publisherId = null, page = 1, limit = 25 } = {}) {
    try {
      if (!dateFrom || !dateTo) {
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const startUTC = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const endUTC = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 25));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['c.tenant_id = ?', 'c.created_at BETWEEN ? AND ?'];
      const params = [tenantId, startUTC, endUTC];

      if (offerId) {
        whereConditions.push('c.offer_id = ?');
        params.push(offerId);
      }

      if (publisherId) {
        whereConditions.push('c.publisher_id = ?');
        params.push(publisherId);
      }

      if (search && search.trim()) {
        whereConditions.push('(c.click_uuid LIKE ? OR c.ip LIKE ? OR o.name LIKE ? OR p.company_name LIKE ? OR p.email LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const whereClause = whereConditions.join(' AND ');

      // Count query
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total 
         FROM clicks c
         LEFT JOIN offers o ON c.offer_id = o.id
         LEFT JOIN publishers p ON c.publisher_id = p.id
         WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countRows[0]?.total || 0);

      // Data query
      const [rows] = await pool.query(
        `SELECT 
           c.id,
           c.click_uuid,
           c.created_at,
           c.ip,
           c.country,
           c.city,
           c.device_type,
           c.os,
           c.browser,
           o.id as offer_id,
           o.public_offer_id,
           o.name as offer_name,
           p.id as publisher_id,
           p.public_publisher_id,
           COALESCE(p.company_name, p.email, 'Publisher') as publisher_name,
           conv.id as conversion_id,
           conv.status as conversion_status,
           conv.amount as conversion_amount
         FROM clicks c
         LEFT JOIN offers o ON c.offer_id = o.id
         LEFT JOIN publishers p ON c.publisher_id = p.id
         LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid AND conv.tenant_id = c.tenant_id
         WHERE ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parsedLimit, offset]
      );

      return {
        data: rows,
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
   * Get conversions log for a tenant
   */
  async getTenantConversions(tenantId, dateFrom = null, dateTo = null, { search = '', status = '', offerId = null, publisherId = null, page = 1, limit = 25 } = {}) {
    try {
      if (!dateFrom || !dateTo) {
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const startUTC = new Date(`${dateFrom}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const endUTC = new Date(`${dateTo}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 25));
      const offset = (parsedPage - 1) * parsedLimit;

      const whereConditions = ['conv.tenant_id = ?', 'conv.created_at BETWEEN ? AND ?'];
      const params = [tenantId, startUTC, endUTC];

      if (status) {
        whereConditions.push('LOWER(conv.status) = LOWER(?)');
        params.push(status);
      }

      if (offerId) {
        whereConditions.push('conv.offer_id = ?');
        params.push(offerId);
      }

      if (publisherId) {
        whereConditions.push('conv.publisher_id = ?');
        params.push(publisherId);
      }

      if (search && search.trim()) {
        whereConditions.push('(conv.conversion_uuid LIKE ? OR conv.click_uuid LIKE ? OR conv.ip LIKE ? OR o.name LIKE ? OR p.company_name LIKE ? OR p.email LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const whereClause = whereConditions.join(' AND ');

      // Count query
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total 
         FROM conversions conv
         LEFT JOIN offers o ON conv.offer_id = o.id
         LEFT JOIN publishers p ON conv.publisher_id = p.id
         WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countRows[0]?.total || 0);

      // Data query
      const [rows] = await pool.query(
        `SELECT 
           conv.id,
           conv.conversion_uuid,
           conv.click_uuid,
           conv.created_at,
           conv.status,
           conv.amount,
           conv.payout,
           conv.ip,
           o.id as offer_id,
           o.public_offer_id,
           o.name as offer_name,
           p.id as publisher_id,
           p.public_publisher_id,
           COALESCE(p.company_name, p.email, 'Publisher') as publisher_name,
           c.country,
           c.city,
           c.device_type,
           c.os,
           c.browser
         FROM conversions conv
         LEFT JOIN offers o ON conv.offer_id = o.id
         LEFT JOIN publishers p ON conv.publisher_id = p.id
         LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid AND c.tenant_id = conv.tenant_id
         WHERE ${whereClause}
         ORDER BY conv.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parsedLimit, offset]
      );

      return {
        data: rows,
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
   * Get daily metrics for a tenant (last N days) from daily_offer_stats
   */
  async getTenantDailyMetrics(tenantId, days = 30) {
    try {
      const [rows] = await pool.query(
        `SELECT 
           DATE_FORMAT(day, '%Y-%m-%d') as date,
           COALESCE(SUM(clicks), 0) as clicks,
           COALESCE(SUM(unique_clicks), 0) as unique_clicks,
           COALESCE(SUM(conversions), 0) as conversions,
           COALESCE(SUM(approved_conversions), 0) as approved_conversions,
           COALESCE(SUM(revenue), 0) as revenue,
           COALESCE(SUM(payout), 0) as payout,
           COALESCE(SUM(profit), 0) as profit
         FROM daily_offer_stats
         WHERE tenant_id = ?
           AND day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY date
         ORDER BY date DESC`,
        [tenantId, days]
      );

      return rows;
    } catch (error) {
      logger.error('TenantMetricsService.getTenantDailyMetrics error:', error);
      throw error;
    }
  }

  /**
   * Get top performing offers for a tenant from daily_offer_stats
   */
  async getTenantTopOffers(tenantId, limit = 10, dateFrom = null, dateTo = null) {
    try {
      if (!dateFrom || !dateTo) {
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const [rows] = await pool.query(
        `SELECT 
           o.id,
           o.name,
           COALESCE(SUM(dos.clicks), 0) as clicks,
           COALESCE(SUM(dos.unique_clicks), 0) as unique_clicks,
           COALESCE(SUM(dos.conversions), 0) as conversions,
           COALESCE(SUM(dos.approved_conversions), 0) as approved_conversions,
           COALESCE(SUM(dos.revenue), 0) as revenue,
           COALESCE(SUM(dos.payout), 0) as payout,
           COALESCE(SUM(dos.profit), 0) as profit
         FROM offers o
         INNER JOIN daily_offer_stats dos ON dos.offer_id = o.id AND dos.tenant_id = o.tenant_id
           AND dos.day BETWEEN ? AND ?
         WHERE o.tenant_id = ?
         GROUP BY o.id, o.name
         ORDER BY conversions DESC, revenue DESC
         LIMIT ?`,
        [dateFrom, dateTo, tenantId, limit]
      );

      return rows;
    } catch (error) {
      logger.error('TenantMetricsService.getTenantTopOffers error:', error);
      throw error;
    }
  }
}

export default new TenantMetricsService();
