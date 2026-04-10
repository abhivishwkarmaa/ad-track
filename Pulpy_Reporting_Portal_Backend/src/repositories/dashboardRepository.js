export class DashboardRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getMetrics(tenantId, startUtc, endUtc) {
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
        SELECT 'conversions' AS metric, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS revenue, COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) AS payout
        FROM conversions
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
        UNION ALL
        SELECT 'impressions' AS metric, COUNT(*) AS total, 0 AS revenue, 0 AS payout
        FROM impressions
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
      ) metrics
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

    const [rows] = await this.pool.query(metricsSql, metricsParams);
    return rows[0] || {};
  }

  async getEntityCounts(tenantId) {
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

    const [rows] = await this.pool.query(entitiesSql, [
      tenantId,
      tenantId,
      tenantId,
    ]);
    return rows[0] || {};
  }

  async getDashboardList(
    tenantId,
    startUtc,
    endUtc,
    topOffersLimit,
    recentActivityLimit,
  ) {
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

    const [rows] = await this.pool.query(listSql, listParams);
    return rows;
  }
}
