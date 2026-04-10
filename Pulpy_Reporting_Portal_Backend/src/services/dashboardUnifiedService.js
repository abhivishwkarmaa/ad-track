import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import dashboardRepository from '../repositories/dashboardRepository.js';

const CACHE_TTL_SECONDS = 8;
const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getTenantLocalDateString = (offsetMinutes) => {
  const now = new Date();
  const localMillis = now.getTime() + offsetMinutes * 60 * 1000;
  return new Date(localMillis).toISOString().slice(0, 10);
};

const toSqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const buildUtcRange = (dateFrom, dateTo, offsetMinutes) => {
  if (!DATE_INPUT_REGEX.test(dateFrom) || !DATE_INPUT_REGEX.test(dateTo)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  const [fromYear, fromMonth, fromDay] = dateFrom.split('-').map(Number);
  const [toYear, toMonth, toDay] = dateTo.split('-').map(Number);

  const fromLocal = Date.UTC(fromYear, fromMonth - 1, fromDay, 0, 0, 0);
  const toLocal = Date.UTC(toYear, toMonth - 1, toDay, 23, 59, 59);

  const startUtc = new Date(fromLocal - offsetMinutes * 60 * 1000);
  const endUtc = new Date(toLocal - offsetMinutes * 60 * 1000);

  return {
    startUtc: toSqlDateTime(startUtc),
    endUtc: toSqlDateTime(endUtc),
  };
};

const normalizeDateRange = (dateFrom, dateTo, offsetMinutes) => {
  const defaultDate = getTenantLocalDateString(offsetMinutes);
  let from = dateFrom || defaultDate;
  let to = dateTo || defaultDate;

  if (!DATE_INPUT_REGEX.test(from) || !DATE_INPUT_REGEX.test(to)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  if (from > to) {
    const temp = from;
    from = to;
    to = temp;
  }

  return { dateFrom: from, dateTo: to };
};

const buildCacheKey = (tenantId, dateFrom, dateTo) =>
  `dashboard:${tenantId}:${dateFrom}:${dateTo}`;

const dashboardUnifiedService = {
  async getDashboard({ tenantId, dateFrom, dateTo }) {
    if (!tenantId) {
      throw new Error('Tenant ID required');
    }

    const tzOffsetMinutes = Number(process.env.DASHBOARD_TZ_OFFSET_MINUTES || 0);
    const normalizedRange = normalizeDateRange(dateFrom, dateTo, tzOffsetMinutes);
    const cacheKey = buildCacheKey(tenantId, normalizedRange.dateFrom, normalizedRange.dateTo);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn(`Dashboard cache read failed: ${error.message}`);
    }

    const { startUtc, endUtc } = buildUtcRange(
      normalizedRange.dateFrom,
      normalizedRange.dateTo,
      tzOffsetMinutes
    );

    const topOffersLimit = 5;
    const recentActivityLimit = 10;

    // Fetch all data from repository
    const metrics = await dashboardRepository.getMetrics(tenantId, startUtc, endUtc);
    const entities = await dashboardRepository.getEntityCounts(tenantId);
    const listRows = await dashboardRepository.getDashboardList(tenantId, startUtc, endUtc, topOffersLimit, recentActivityLimit);

    const topOffers = listRows
      .filter((row) => row.row_type === 'top_offer')
      .map((row) => ({
        offer_id: row.offer_id,
        offer_name: row.offer_name,
        conversions: Number(row.conversions || 0),
      }))
      .sort((a, b) => b.conversions - a.conversions);

    const recentActivity = listRows
      .filter((row) => row.row_type === 'recent_activity')
      .map((row) => ({
        time: row.activity_time,
        offer: {
          name: row.offer_name,
          thumbnail: row.offer_thumbnail,
        },
        publisher: row.publisher_name || 'Unknown',
        conversion_status: row.conversion_status || 'No',
        revenue: Number(row.revenue || 0),
      }))
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    const response = {
      stats: {
        total_clicks: Number(metrics.total_clicks || 0),
        total_conversions: Number(metrics.total_conversions || 0),
        revenue: Number(metrics.revenue || 0),
        payout: Number(metrics.payout || 0),
        impressions: Number(metrics.impressions || 0),
      },
      entities: {
        offers: Number(entities.offers || 0),
        publishers: Number(entities.publishers || 0),
        advertisers: Number(entities.advertisers || 0),
      },
      topOffers,
      recentActivity,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      logger.warn(`Dashboard cache write failed: ${error.message}`);
    }

    return response;
  },
};

export default dashboardUnifiedService;
