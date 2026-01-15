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

      // Clicks metrics
      const [clicksToday] = await pool.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks
         FROM clicks
         WHERE tenant_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = ?`,
        [tenantId, dateTo]
      );

      const [clicksPeriod] = await pool.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks
         FROM clicks
         WHERE tenant_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) >= ? 
         AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) <= ?`,
        [tenantId, dateFrom, dateTo]
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
           COALESCE(SUM(payout), 0) as payout
         FROM conversions
         WHERE tenant_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = ?`,
        [tenantId, dateTo]
      );

      const [conversionsPeriod] = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
           COALESCE(SUM(amount), 0) as revenue,
           COALESCE(SUM(payout), 0) as payout
         FROM conversions
         WHERE tenant_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) >= ? 
         AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) <= ?`,
        [tenantId, dateFrom, dateTo]
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
   * Get daily metrics for a tenant (last N days)
   */
  async getTenantDailyMetrics(tenantId, days = 30) {
    try {
      const [rows] = await pool.query(
        `SELECT 
           DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) as date,
           COUNT(DISTINCT c.id) as clicks,
           COUNT(DISTINCT conv.id) as conversions,
           COALESCE(SUM(conv.amount), 0) as revenue
         FROM clicks c
         LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid 
           AND conv.tenant_id = c.tenant_id
         WHERE c.tenant_id = ?
           AND DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30')) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30'))
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
   * Get top performing offers for a tenant
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
           COUNT(DISTINCT c.id) as clicks,
           COUNT(DISTINCT conv.id) as conversions,
           COALESCE(SUM(conv.amount), 0) as revenue
         FROM offers o
         LEFT JOIN clicks c ON c.offer_id = o.id AND c.tenant_id = o.tenant_id
           AND DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30')) >= ?
           AND DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30')) <= ?
         LEFT JOIN conversions conv ON conv.offer_id = o.id AND conv.tenant_id = o.tenant_id
           AND DATE(CONVERT_TZ(conv.created_at, '+00:00', '+05:30')) >= ?
           AND DATE(CONVERT_TZ(conv.created_at, '+00:00', '+05:30')) <= ?
         WHERE o.tenant_id = ?
         GROUP BY o.id, o.name
         ORDER BY conversions DESC, revenue DESC
         LIMIT ?`,
        [dateFrom, dateTo, dateFrom, dateTo, tenantId, limit]
      );

      return rows;
    } catch (error) {
      logger.error('TenantMetricsService.getTenantTopOffers error:', error);
      throw error;
    }
  }
}

export default new TenantMetricsService();
