export class PostbackRepository {
  constructor(pool) {
    this.pool = pool;
  }
// ... methods remain unchanged

  async getOfferByInternalId({ offerId, tenantId = null }) {
    if (offerId == null) return null;
    const id = parseInt(offerId, 10);
    if (Number.isNaN(id) || id < 1) return null;
    let query = 'SELECT o.id, o.public_offer_id, o.name, o.status, o.tenant_id, o.offer_url, o.preview_url FROM offers o WHERE o.id = ?';
    const params = [id];
    if (tenantId != null) {
      query += ' AND o.tenant_id = ?';
      params.push(tenantId);
    }
    query += ' LIMIT 1';
    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async getAssignmentByInternalId({ id, tenantId = null }) {
    if (id == null || id === '') return null;
    const numericId = Number(String(id).trim());
    if (Number.isNaN(numericId)) return null;
    let query = `SELECT po.id, po.public_assignment_id, po.publisher_id, po.offer_id, po.tenant_id, po.payout_override, po.conversion_approval_percentage, po.callback_url, po.status, po.capping_budget_duration, po.capping_budget_amount, po.capping_conversions_duration, po.capping_conversions_amount, o.public_offer_id
      FROM publisher_offers po
      JOIN offers o ON po.offer_id = o.id
      WHERE po.id = ?`;
    const params = [numericId];
    if (tenantId != null) {
      query += ' AND po.tenant_id = ?';
      params.push(tenantId);
    }
    query += ' LIMIT 1';
    const [rows] = await this.pool.query(query, params);
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) return null;
    return {
      id: row.public_assignment_id ?? row.id,
      internal_id: row.id,
      publisher_id: row.publisher_id,
      offer_id: row.offer_id,
      payout_override: row.payout_override,
      conversion_approval_percentage: row.conversion_approval_percentage,
      callback_url: row.callback_url,
      tenant_id: row.tenant_id,
      public_offer_id: row.public_offer_id,
      capping_budget_duration: row.capping_budget_duration,
      capping_budget_amount: row.capping_budget_amount,
      capping_conversions_duration: row.capping_conversions_duration,
      capping_conversions_amount: row.capping_conversions_amount,
    };
  }

  async getPublisherByInternalId({ id, tenantId = null }) {
    if (id == null) return null;
    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) return null;
    let query =
      'SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE id = ?';
    const params = [numericId];
    if (tenantId != null) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    query += ' LIMIT 1';
    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async getClickByUuidOrTid({ clickId, tenantId }) {
    const fields = 'id, offer_id, publisher_id, tenant_id, click_uuid, rcid, tid, ip, created_at';
    const query = `SELECT ${fields} FROM clicks WHERE (click_uuid = ? OR tid = ?) AND tenant_id = ? ORDER BY id DESC LIMIT 1`;
    const [rows] = await this.pool.query(query, [clickId, clickId, tenantId]);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async getConversionByRcid({ rcid, offerId, tenantId }) {
    const fields = 'id, conversion_uuid, click_uuid, offer_id, publisher_id, tenant_id, status, amount, payout, created_at';
    const query = `SELECT ${fields} FROM conversions WHERE rcid = ? AND offer_id = ? AND tenant_id = ? LIMIT 1`;
    const [rows] = await this.pool.query(query, [rcid, offerId, tenantId]);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async findConversionById({ id, tenantId }) {
    const fields = 'id, conversion_uuid, click_uuid, offer_id, publisher_id, tenant_id, status, amount, payout, created_at';
    const query = `SELECT ${fields} FROM conversions WHERE id = ? AND tenant_id = ? LIMIT 1`;
    const [rows] = await this.pool.query(query, [id, tenantId]);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async insertConversion(data) {
    const {
      conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
      rcid, status, amount, payout, ip, postback_payload
    } = data;

    const [result] = await this.pool.query(
      `INSERT INTO conversions (
        conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [
        conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        rcid, status, amount, payout, ip, JSON.stringify(postback_payload)
      ]
    );
    return result;
  }

  async updateConversionPostbackStatus({ id, tenantId, status }) {
    const [result] = await this.pool.query(
      'UPDATE conversions SET affiliate_postback_fired = ? WHERE id = ? AND tenant_id = ?',
      [status, id, tenantId]
    );
    return result;
  }

  async updateDailyOfferStats(data) {
    const {
      offerId, day, conversions, approved_conversions, pending_conversions, rejected_conversions,
      revenue, payout, profit
    } = data;

    const [result] = await this.pool.query(
      `INSERT INTO daily_offer_stats (
        offer_id, day, conversions, approved_conversions, pending_conversions, rejected_conversions,
        revenue, payout, profit, created_at, updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         conversions = daily_offer_stats.conversions + VALUES(conversions),
         approved_conversions = daily_offer_stats.approved_conversions + VALUES(approved_conversions),
         pending_conversions = daily_offer_stats.pending_conversions + VALUES(pending_conversions),
         rejected_conversions = daily_offer_stats.rejected_conversions + VALUES(rejected_conversions),
         revenue = daily_offer_stats.revenue + VALUES(revenue),
         payout = daily_offer_stats.payout + VALUES(payout),
         profit = daily_offer_stats.profit + VALUES(profit),
         updated_at = UTC_TIMESTAMP()`,
      [
        offerId, day, conversions, approved_conversions, pending_conversions, rejected_conversions,
        revenue, payout, profit
      ]
    );
    return result;
  }

  async getCapUsageSum({ offerId, publisherId, tenantId, dateCondition, clickExpiredStatus }) {
    let query = `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND status != 'rejected' AND status != 'rejected_cap' AND status != ? AND ${dateCondition}`;
    const params = [offerId, publisherId, clickExpiredStatus];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return parseFloat((Array.isArray(rows) ? rows[0] : rows).total_revenue || 0);
  }

  async getCapUsageCount({ offerId, publisherId, tenantId, dateCondition, clickExpiredStatus }) {
    let query = `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND status != 'rejected' AND status != 'rejected_cap' AND status != ? AND ${dateCondition}`;
    const params = [offerId, publisherId, clickExpiredStatus];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return parseInt((Array.isArray(rows) ? rows[0] : rows).conversion_count || 0);
  }

  async getTotalConversionCount({ offerId, tenantId }) {
    let query = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?';
    const params = [offerId];
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    const [rows] = await this.pool.query(query, params);
    return parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
  }

  async logPostbackAttempt(data) {
    const {
      publisher_id, conversion_id, affiliate_click_id, fired_url, http_status,
      response_body, error_message, execution_time_ms, tenant_id
    } = data;

    const [result] = await this.pool.query(
      `INSERT INTO affiliate_postback_logs (
        publisher_id, conversion_id, affiliate_click_id, fired_url, 
        http_status, response_body, error_message, execution_time_ms, tenant_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        publisher_id || 0,
        conversion_id || null,
        affiliate_click_id || null,
        fired_url || '',
        http_status || 0,
        response_body || null,
        error_message || null,
        execution_time_ms || 0,
        tenant_id || 0
      ]
    );
    return result;
  }

  async getPostbackLogs(filters = {}, tenantId = null) {
    const lFields = 'l.id, l.publisher_id, l.conversion_id, l.affiliate_click_id, l.fired_url, l.http_status, l.execution_time_ms, l.created_at';
    let query = `
      SELECT ${lFields}, p.email as publisher_email, p.company_name, p.tenant_id
      FROM affiliate_postback_logs l
      LEFT JOIN publishers p ON l.publisher_id = p.id
    `;
    const params = [];
    const conditions = [];

    if (tenantId) {
      conditions.push('p.tenant_id = ?');
      params.push(tenantId);
    }
    if (filters.publisher_id) {
      conditions.push('l.publisher_id = ?');
      params.push(filters.publisher_id);
    }
    if (filters.conversion_id) {
      conditions.push('l.conversion_id = ?');
      params.push(filters.conversion_id);
    }
    if (filters.affiliate_click_id) {
      conditions.push('l.affiliate_click_id = ?');
      params.push(filters.affiliate_click_id);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY l.id DESC';

    let countQuery = `
      SELECT COUNT(*) as total
      FROM affiliate_postback_logs l
      LEFT JOIN publishers p ON l.publisher_id = p.id
    `;
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    const [countRows] = await this.pool.query(countQuery, params);
    const total = countRows[0].total;

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    } else {
      query += ' LIMIT 100';
    }
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(parseInt(filters.offset));
    }

    const [rows] = await this.pool.query(query, params);
    return { data: rows, total };
  }

  async updateConversionToApproved({ id, tenantId, payout, amount }) {
    const [result] = await this.pool.query(
      `UPDATE conversions SET 
        status = 'approved', 
        payout = ?, 
        amount = ?,
        updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND tenant_id = ?`,
      [payout, amount, id, tenantId]
    );
    return result;
  }

  async updateDailyStatsManualNew(data) {
    const { offerId, tenantId, day, advertiserAmount, payout, profit } = data;
    const [result] = await this.pool.query(
      `INSERT INTO daily_offer_stats (
        offer_id, tenant_id, day, 
        conversions, approved_conversions, revenue, payout, profit,
        created_at, updated_at
      ) VALUES (?, ?, ?, 1, 1, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        conversions = conversions + 1,
        approved_conversions = approved_conversions + 1,
        revenue = revenue + ?,
        payout = payout + ?,
        profit = profit + ?,
        updated_at = UTC_TIMESTAMP()`,
      [
        offerId, tenantId, day, 
        advertiserAmount, payout, profit,
        advertiserAmount, payout, profit
      ]
    );
    return result;
  }

  async updateDailyStatsManualStatusChange(data) {
    const { offerId, tenantId, day, pendingDelta, rejectedDelta, payout } = data;
    const [result] = await this.pool.query(
      `INSERT INTO daily_offer_stats (
        offer_id, tenant_id, day, 
        approved_conversions, pending_conversions, rejected_conversions,
        payout, profit,
        created_at, updated_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        approved_conversions = approved_conversions + 1,
        pending_conversions = pending_conversions + ?,
        rejected_conversions = rejected_conversions + ?,
        payout = payout + ?,
        profit = profit - ?,
        updated_at = UTC_TIMESTAMP()`,
      [
        offerId, tenantId, day,
        pendingDelta, rejectedDelta, payout, payout,
        pendingDelta, rejectedDelta, payout, payout
      ]
    );
    return result;
  }
}

// (no singleton export)

