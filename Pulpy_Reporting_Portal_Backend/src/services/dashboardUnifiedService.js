import pool from '../db/connection.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';

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

    const metricsSql = `
      SELECT
        SUM(CASE WHEN metric = 'clicks' THEN total ELSE 0 END) AS total_clicks,
        SUM(CASE WHEN metric = 'conversions' THEN total ELSE 0 END) AS total_conversions,
        SUM(CASE WHEN metric = 'impressions' THEN total ELSE 0 END) AS impressions,
        SUM(CASE WHEN metric = 'conversions' THEN revenue ELSE 0 END) AS revenue,
        SUM(CASE WHEN metric = 'conversions' THEN payout ELSE 0 END) AS payout
      FROM (
        SELECT 'clicks' AS metric, COUNT(*) AS total, 0 AS revenue, 0 AS payout
        FROM clicks
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
        UNION ALL
        SELECT 'conversions' AS metric, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS revenue, COALESCE(SUM(payout), 0) AS payout
        FROM conversions
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
        UNION ALL
        SELECT 'impressions' AS metric, COUNT(*) AS total, 0 AS revenue, 0 AS payout
        FROM impressions
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
      ) metrics
    `;

    const entitiesSql = `
      SELECT
        SUM(CASE WHEN entity = 'offers' THEN total ELSE 0 END) AS offers,
        SUM(CASE WHEN entity = 'publishers' THEN total ELSE 0 END) AS publishers,
        SUM(CASE WHEN entity = 'advertisers' THEN total ELSE 0 END) AS advertisers
      FROM (
        SELECT 'offers' AS entity, COUNT(*) AS total
        FROM offers
        WHERE tenant_id = ? AND status != 'remove'
        UNION ALL
        SELECT 'publishers' AS entity, COUNT(*) AS total
        FROM publishers
        WHERE tenant_id = ?
        UNION ALL
        SELECT 'advertisers' AS entity, COUNT(*) AS total
        FROM advertisers
        WHERE tenant_id = ?
      ) entities
    `;

    const listSql = `
      (
        SELECT
          'top_offer' AS row_type,
          o.public_offer_id AS offer_id,
          o.name AS offer_name,
          COUNT(*) AS conversions,
          NULL AS activity_time,
          NULL AS publisher_name,
          NULL AS offer_thumbnail,
          NULL AS conversion_status,
          NULL AS revenue
        FROM conversions conv
        INNER JOIN offers o ON o.id = conv.offer_id
        WHERE conv.tenant_id = ? AND conv.created_at BETWEEN ? AND ?
        GROUP BY o.id, o.public_offer_id, o.name
        ORDER BY conversions DESC
        LIMIT ?
      )
      UNION ALL
      (
        SELECT
          'recent_activity' AS row_type,
          NULL AS offer_id,
          o.name AS offer_name,
          NULL AS conversions,
          c.created_at AS activity_time,
          COALESCE(p.company_name, CONCAT_WS(' ', p.first_name, p.last_name)) AS publisher_name,
          o.thumbnail_url AS offer_thumbnail,
          conv.status AS conversion_status,
          COALESCE(conv.amount, 0) AS revenue
        FROM clicks c
        LEFT JOIN offers o ON o.id = c.offer_id
        LEFT JOIN publishers p ON p.id = c.publisher_id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?
        ORDER BY c.created_at DESC
        LIMIT ?
      )
    `;

    const metricsParams = [
      tenantId,
      startUtc,
      endUtc,
      tenantId,
      startUtc,
      endUtc,
      tenantId,
      startUtc,
      endUtc,
    ];

    const entitiesParams = [tenantId, tenantId, tenantId];
    const topOffersLimit = 5;
    const recentActivityLimit = 10;
    const listParams = [
      tenantId,
      startUtc,
      endUtc,
      topOffersLimit,
      tenantId,
      startUtc,
      endUtc,
      recentActivityLimit,
    ];

    const [metricsRows] = await pool.query(metricsSql, metricsParams);
    const [entityRows] = await pool.query(entitiesSql, entitiesParams);
    const [listRows] = await pool.query(listSql, listParams);

    const metrics = metricsRows[0] || {};
    const entities = entityRows[0] || {};

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
