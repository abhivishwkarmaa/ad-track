import logger from '../utils/logger.js';
import redis from '../config/redis.js';


/**
 * Tenant Metrics Service
 * Provides observability and monitoring for tenants
 */
export class TenantMetricsService {
  constructor(tenantMetricsRepository) {
    this.tenantMetricsRepository = tenantMetricsRepository;
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

      // Get date boundaries if not provided
      if (!dateFrom || !dateTo) {
        const now = new Date();
        // Get YYYY-MM-DD in UTC (or current server context)
        dateTo = now.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      // Day boundaries for "Today" and Period
      const todayStartUTC = `${dateTo} 00:00:00`;
      const todayEndUTC = `${dateTo} 23:59:59`;

      const periodStartUTC = `${dateFrom} 00:00:00`;
      const periodEndUTC = `${dateTo} 23:59:59`;

      // Clicks metrics
      const clicksToday = await this.tenantMetricsRepository.getClickStats(tenantId, todayStartUTC, todayEndUTC);
      const clicksPeriod = await this.tenantMetricsRepository.getClickStats(tenantId, periodStartUTC, periodEndUTC);

      metrics.clicks = {
        today: {
          total: parseInt(clicksToday.total || 0),
          unique: parseInt(clicksToday.unique_clicks || 0),
        },
        period: {
          total: parseInt(clicksPeriod.total || 0),
          unique: parseInt(clicksPeriod.unique_clicks || 0),
        },
      };

      // Conversions metrics
      const conversionsToday = await this.tenantMetricsRepository.getConversionStats(tenantId, todayStartUTC, todayEndUTC);
      const conversionsPeriod = await this.tenantMetricsRepository.getConversionStats(tenantId, periodStartUTC, periodEndUTC);

      metrics.conversions = {
        today: {
          total: parseInt(conversionsToday.total || 0),
          approved: parseInt(conversionsToday.approved || 0),
          pending: parseInt(conversionsToday.pending || 0),
          rejected: parseInt(conversionsToday.rejected || 0),
        },
        period: {
          total: parseInt(conversionsPeriod.total || 0),
          approved: parseInt(conversionsPeriod.approved || 0),
        },
      };

      metrics.revenue = {
        today: parseFloat(conversionsToday.revenue || 0),
        payout_today: parseFloat(conversionsToday.payout || 0),
        period: parseFloat(conversionsPeriod.revenue || 0),
        payout_period: parseFloat(conversionsPeriod.payout || 0),
        profit_period: parseFloat(conversionsPeriod.revenue || 0) - parseFloat(conversionsPeriod.payout || 0),
      };

      // Publishers count
      const publishersCount = await this.tenantMetricsRepository.getPublisherCounts(tenantId);
      metrics.publishers = {
        total: parseInt(publishersCount.total || 0),
        active: parseInt(publishersCount.active || 0),
      };

      // Offers count
      const offersCount = await this.tenantMetricsRepository.getOfferCounts(tenantId);
      metrics.offers = {
        total: parseInt(offersCount.total || 0),
        live: parseInt(offersCount.live || 0),
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
   * Get daily metrics for a tenant (last N days)
   */
  async getTenantDailyMetrics(tenantId, days = 30) {
    try {
      const startUTC = new Date(new Date().getTime() - (days * 24 * 60 * 60 * 1000)).toISOString().slice(0, 19).replace('T', ' ');
      return await this.tenantMetricsRepository.getDailyMetrics(tenantId, startUTC);
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
        const istTime = new Date(now.getTime());
        dateTo = istTime.toISOString().split('T')[0];
        const monthStart = dateTo.substring(0, 7) + '-01';
        dateFrom = monthStart;
      }

      const startUTC = `${dateFrom} 00:00:00`;
      const endUTC = `${dateTo} 23:59:59`;

      return await this.tenantMetricsRepository.getTopOffers(tenantId, startUTC, endUTC, limit);
    } catch (error) {
      logger.error('TenantMetricsService.getTenantTopOffers error:', error);
      throw error;
    }
  }
}

// (no singleton export)
