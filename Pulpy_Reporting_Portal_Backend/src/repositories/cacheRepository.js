export const PUBLISHER_OFFERS_TRACKING_COLUMNS = `id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_type, capping_duration, capping_action, fallback_type, fallback_url, fallback_offer_id, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes`;

export class CacheRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findAssignment(publisherId, offerId, tenantId = null) {
    let query = `SELECT ${PUBLISHER_OFFERS_TRACKING_COLUMNS} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?`;
    const params = [publisherId, offerId, "active"];

    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async getCapHydrationValue(
    entityType,
    entityId,
    capType,
    startUTC,
    endUTC,
    tenantId,
  ) {
    const dateCond = "created_at BETWEEN ? AND ?";
    const statusCond = "status IN ('approved', 'pending')";
    let query = "";
    let params = [startUTC, endUTC];

    if (entityType === "offer") {
      if (capType === "budget") {
        query = `SELECT COALESCE(SUM(amount), 0) as val FROM conversions WHERE offer_id = ? AND ${dateCond} AND ${statusCond}`;
      } else {
        query = `SELECT COUNT(*) as val FROM conversions WHERE offer_id = ? AND ${dateCond} AND ${statusCond}`;
      }
      params.unshift(entityId);
    } else {
      if (capType === "budget") {
        query = `SELECT COALESCE(SUM(payout), 0) as val FROM conversions WHERE publisher_offer_id = ? AND ${dateCond} AND ${statusCond}`;
      } else {
        query = `SELECT COUNT(*) as val FROM conversions WHERE publisher_offer_id = ? AND ${dateCond} AND ${statusCond}`;
      }
      params.unshift(entityId);
    }

    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    const result = Array.isArray(rows) ? rows[0] : rows;
    return parseFloat(result.val || 0);
  }
}
