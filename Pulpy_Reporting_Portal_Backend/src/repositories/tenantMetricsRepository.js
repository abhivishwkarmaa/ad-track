export class TenantMetricsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getClickStats(tenantId, startAt, endAt) {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks
       FROM clicks
       WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
      [tenantId, startAt, endAt]
    );
    return rows[0] || { total: 0, unique_clicks: 0 };
  }

  async getConversionStats(tenantId, startAt, endAt) {
    const [rows] = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
         COALESCE(SUM(amount), 0) as revenue,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
       FROM conversions
       WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
      [tenantId, startAt, endAt]
    );
    return rows[0] || { total: 0, approved: 0, pending: 0, rejected: 0, revenue: 0, payout: 0 };
  }

  async getPublisherCounts(tenantId) {
    const [rows] = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
       FROM publishers
       WHERE tenant_id = ?`,
      [tenantId]
    );
    return rows[0] || { total: 0, active: 0 };
  }

  async getOfferCounts(tenantId) {
    const [rows] = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as live
       FROM offers
       WHERE tenant_id = ?`,
      [tenantId]
    );
    return rows[0] || { total: 0, live: 0 };
  }

  async getDailyMetrics(tenantId, startUTC) {
    const [rows] = await this.pool.query(
        `SELECT 
           DATE(DATE_ADD(created_at)) as date,
           COUNT(DISTINCT c.id) as clicks,
           COUNT(DISTINCT conv.id) as conversions,
           COALESCE(SUM(conv.amount), 0) as revenue
         FROM clicks c
         LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid 
           AND conv.tenant_id = c.tenant_id
         WHERE c.tenant_id = ?
           AND c.created_at >= ?
         GROUP BY date
         ORDER BY date DESC`,
        [tenantId, startUTC]
    );
    return rows;
  }

  async getTopOffers(tenantId, startUTC, endUTC, limit) {
    const [rows] = await this.pool.query(
        `SELECT 
           o.id,
           o.name,
           COUNT(DISTINCT c.id) as clicks,
           COUNT(DISTINCT conv.id) as conversions,
           COALESCE(SUM(conv.amount), 0) as revenue
         FROM offers o
         LEFT JOIN clicks c ON c.offer_id = o.id AND c.tenant_id = o.tenant_id
           AND c.created_at BETWEEN ? AND ?
         LEFT JOIN conversions conv ON conv.offer_id = o.id AND conv.tenant_id = o.tenant_id
           AND conv.created_at BETWEEN ? AND ?
         WHERE o.tenant_id = ?
         GROUP BY o.id, o.name
         ORDER BY conversions DESC, revenue DESC
         LIMIT ?`,
        [startUTC, endUTC, startUTC, endUTC, tenantId, limit]
    );
    return rows;
  }
}
