export class TrackingRepository {
  constructor(dbPool) {
    this.pool = dbPool;
  }

  buildUtcDateCondition(column, duration) {
    if (duration === "hour") {
      return `DATE(${column}) = UTC_DATE() AND HOUR(${column}) = HOUR(UTC_TIMESTAMP())`;
    }
    if (duration === "day") {
      return `DATE(${column}) = UTC_DATE()`;
    }
    if (duration === "week") {
      return `YEARWEEK(${column}, 1) = YEARWEEK(UTC_TIMESTAMP(), 1)`;
    }
    if (duration === "month") {
      return `YEAR(${column}) = YEAR(UTC_TIMESTAMP()) AND MONTH(${column}) = MONTH(UTC_TIMESTAMP())`;
    }
    return null;
  }

  async findTenantById(tenantId) {
    const [rows] = await this.pool.query(
      "SELECT id, name FROM tenants WHERE id = ?",
      [tenantId],
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findPublisherOfferAssignment({
    selectColumns,
    publisherId,
    offerId,
    tenantId,
  }) {
    const [rows] = await this.pool.query(
      `SELECT ${selectColumns} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND tenant_id = ? LIMIT 1`,
      [publisherId, offerId, tenantId],
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findActiveAssignmentForImpression({
    selectColumns,
    publisherId,
    offerId,
    tenantId,
  }) {
    let query = `SELECT ${selectColumns} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?`;
    const params = [publisherId, offerId, "active"];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    query += " LIMIT 1";

    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async insertImpression({
    impUuid,
    offerId,
    publisherId,
    tenantId,
    ip,
    userAgent,
    referrer,
  }) {
    await this.pool.query(
      `INSERT INTO impressions (
        imp_uuid, offer_id, publisher_id, tenant_id, ip, user_agent, referrer, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [impUuid, offerId, publisherId, tenantId, ip, userAgent, referrer],
    );
  }

  async sumConversionAmountForAssignmentCap({
    offerId,
    publisherId,
    duration,
  }) {
    const dateCondition = this.buildUtcDateCondition("created_at", duration);
    if (!dateCondition) return 0;
    const [rows] = await this.pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`,
      [offerId, publisherId],
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return parseFloat(row?.total_revenue || 0);
  }

  async countConversionsForAssignmentCap({ offerId, publisherId, duration }) {
    const dateCondition = this.buildUtcDateCondition("created_at", duration);
    if (!dateCondition) return 0;
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`,
      [offerId, publisherId],
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return parseInt(row?.conversion_count || 0);
  }

  async findLatestClickIp({ offerId, publisherId }) {
    const [rows] = await this.pool.query(
      `SELECT ip FROM clicks
       WHERE offer_id = ? AND publisher_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [offerId, publisherId],
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.ip || null;
  }

  async countClicksForUniqueIpOnUtcDay({ offerId, ip, utcDate, tenantId }) {
    let query = `SELECT COUNT(*) as cnt FROM clicks
      WHERE offer_id = ?
        AND ip = ?
        AND DATE(created_at) = ?`;
    const params = [offerId, ip, utcDate];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const [rows] = await this.pool.query(query, params);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return parseInt(row?.cnt || 0);
  }

  async upsertDailyOfferStatsClick({ offerId, tenantId, utcDate, isUnique }) {
    await this.pool.query(
      `INSERT INTO daily_offer_stats (offer_id, tenant_id, day, clicks, unique_clicks)
       VALUES (?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         clicks = daily_offer_stats.clicks + 1,
         unique_clicks = daily_offer_stats.unique_clicks + (CASE WHEN ? = 1 THEN 1 ELSE 0 END),
         updated_at = UTC_TIMESTAMP()`,
      [offerId, tenantId, utcDate, isUnique ? 1 : 0, isUnique ? 1 : 0],
    );
  }

  async upsertDailyOfferStatsImpression({ offerId, tenantId, utcDate }) {
    await this.pool.query(
      `INSERT INTO daily_offer_stats (offer_id, tenant_id, day, impressions)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         impressions = daily_offer_stats.impressions + 1,
         updated_at = UTC_TIMESTAMP()`,
      [offerId, tenantId, utcDate],
    );
  }
}
