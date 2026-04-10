export class OfferRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findAll({ filters = {}, tenantId = null }) {
    const fields = 'id, public_offer_id, name, category, status, offer_visibility, offer_currency, country, advertiser_id, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, created_at, updated_at';
    let query = `SELECT ${fields} FROM offers WHERE status != "remove"`;
    const params = [];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    // Basic filters
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }
    }

    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async findById(id, tenantId = null) {
    const fields = 'id, public_offer_id, name, description, category, status, offer_visibility, offer_currency, country, advertiser_id, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, offer_url, preview_url, start_date, end_date, start_time, end_time, created_at, updated_at';
    let query = `SELECT ${fields} FROM offers WHERE id = ?`;
    const params = [id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findByPublicId(publicId, tenantId = null) {
    const fields = 'id, public_offer_id, name, description, category, status, offer_visibility, offer_currency, country, advertiser_id, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, offer_url, preview_url, start_date, end_date, start_time, end_time, created_at, updated_at';
    let query = `SELECT ${fields} FROM offers WHERE public_offer_id = ?`;
    const params = [publicId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findOfferByUrlKey({ urlKey }) {
    const [rows] = await this.pool.query(
      'SELECT id, name, category, advertiser_revenue, affiliate_model_cost, start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url, status, url_key, tenant_id, created_at, updated_at FROM offers WHERE url_key = ?',
      [urlKey]
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async updateStatus(id, status) {
    const [result] = await this.pool.query('UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
      status,
      id,
    ]);
    return result;
  }

  async update(id, data) {
    const [result] = await this.pool.query('UPDATE offers SET ? WHERE id = ?', [data, id]);
    return result;
  }

  async findByAdvertiserId(advertiserId, tenantId = null) {
    const fields = 'id, public_offer_id, name, status, country, category, advertiser_amount, affiliate_amount, created_at';
    let query = `SELECT ${fields} FROM offers WHERE advertiser_id = ?`;
    const params = [advertiserId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async findAdvertiserById({ advertiserId, tenantId }) {
    const [rows] = await this.pool.query(
      'SELECT id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at FROM advertisers WHERE id = ? AND tenant_id = ? LIMIT 1',
      [advertiserId, tenantId]
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findAssignmentsForOffer({ offerId, tenantId }) {
    const [rows] = await this.pool.query(
      `SELECT po.id, po.publisher_id, po.offer_id, po.tenant_id, po.payout_override, po.cap_override, po.conversion_approval_percentage, po.capping_budget_duration, po.capping_budget_amount, po.capping_conversions_duration, po.capping_conversions_amount, po.callback_url, po.destination_url, po.status, po.assigned_at, po.updated_at, po.notes,
              p.id as publisher_id,
              p.email as publisher_email,
              p.first_name as publisher_first_name,
              p.company_name as publisher_company,
              p.country as publisher_country,
              p.status as publisher_status
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       WHERE po.offer_id = ? AND po.tenant_id = ?
       ORDER BY po.assigned_at DESC`,
      [offerId, tenantId]
    );
    return rows;
  }

  async createOffer({ data, tenantId, publicOfferId }) {
    const sql = `
      INSERT INTO offers (
        advertiser_id, tenant_id, public_offer_id,
        name, description, category, status, offer_visibility,
        offer_currency, country,
        advertiser_model, advertiser_amount,
        affiliate_model, affiliate_amount,
        offer_url, preview_url, billing_flow, billing_type, token_type, macros_json,
        start_date, end_date, start_time, end_time,
        ip_action, ip_list, country_action, country_list,
        device_targeting_json, device_action,
        os_targeting_json, os_action,
        browser_targeting_json, browser_action,
        isp_targeting_json, carrier_targeting_json, city_targeting_json,
        capping_type, capping_duration, capping_action, fallback_type,
        daily_cap, monthly_cap, total_cap, conversion_cap, capping_conversions_duration,
        budget_cap, advertiser_capping_budget_duration, advertiser_capping_budget_amount,
        advertiser_over_capping, affiliate_over_capping, cap_action,
        fallback_enabled, fallback_url, fallback_offer_id,
        advertiser_postback_url, advertiser_postback_method, advertiser_postback_macros_json,
        system_postback_url, system_postback_method, system_postback_macros_json
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
    `;

    const params = [
      data.advertiser_id, tenantId, publicOfferId,
      data.name, data.description || null, data.category || null, data.status || 'draft', data.offer_visibility || null,
      data.offer_currency, data.country,
      data.advertiser_model, data.advertiser_amount,
      data.affiliate_model, data.affiliate_amount,
      data.offer_url, data.preview_url || null, data.billing_flow || null, data.billing_type || null, data.token_type || null, 
      data.macros_json ? JSON.stringify(data.macros_json) : null,
      data.start_date || null, data.end_date || null, data.start_time || null, data.end_time || null,
      data.ip_action || null, data.ip_list || null,
      data.country_action || null, data.country_list || null,
      data.device_targeting_json ? JSON.stringify(data.device_targeting_json) : null, data.device_action || null,
      data.os_targeting_json ? JSON.stringify(data.os_targeting_json) : null, data.os_action || null,
      data.browser_targeting_json ? JSON.stringify(data.browser_targeting_json) : null, data.browser_action || null,
      data.isp_targeting_json ? JSON.stringify(data.isp_targeting_json) : null, 
      data.carrier_targeting_json ? JSON.stringify(data.carrier_targeting_json) : null, 
      data.city_targeting_json ? JSON.stringify(data.city_targeting_json) : null,
      data.capping_type || 'none', data.capping_duration || null, data.capping_action || null, data.fallback_type || null,
      data.daily_cap || 0, data.monthly_cap || 0, data.total_cap || 0, data.conversion_cap || 0, data.capping_conversions_duration || null,
      data.budget_cap || 0, data.advertiser_capping_budget_duration || null, data.advertiser_capping_budget_amount || 0,
      data.advertiser_over_capping || 0, data.affiliate_over_capping || 0, data.cap_action || null,
      data.fallback_enabled || 0, data.fallback_url || null, data.fallback_offer_id || null,
      data.advertiser_postback_url || null, data.advertiser_postback_method || 'GET', 
      data.advertiser_postback_macros_json ? JSON.stringify(data.advertiser_postback_macros_json) : null,
      data.system_postback_url || null, data.system_postback_method || 'GET', 
      data.system_postback_macros_json ? JSON.stringify(data.system_postback_macros_json) : null
    ];

    const [result] = await this.pool.query(sql, params);
    return result;
  }

  async findAdvertiserIdTenant({ advertiserId, tenantId = null }) {
    let query = 'SELECT id, tenant_id FROM advertisers WHERE id = ?';
    const params = [advertiserId];
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    const [rows] = await this.pool.query(query, params);
    return rows[0];
  }

  async findOfferAssignmentsByInternalOfferId({ offerId, tenantId = null }) {
    let query = `SELECT 
                  po.id, po.publisher_id, po.offer_id, po.tenant_id, po.payout_override, po.cap_override, po.conversion_approval_percentage, po.capping_budget_duration, po.capping_budget_amount, po.capping_conversions_duration, po.capping_conversions_amount, po.callback_url, po.destination_url, po.status, po.assigned_at, po.updated_at, po.notes,
                  po.public_assignment_id,
                  p.id as publisher_id,
                  p.public_publisher_id,
                  p.email as publisher_email,
                  p.first_name as publisher_first_name,
                  p.company_name as publisher_company,
                  p.country as publisher_country,
                  p.status as publisher_status
           FROM publisher_offers po
           JOIN publishers p ON po.publisher_id = p.id
           WHERE po.offer_id = ?`;
    const params = [offerId];

    if (tenantId) {
      query += ' AND po.tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY po.assigned_at DESC';
    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async getRecentClicksForOffer({ offerId, tenantId, limit = 50 }) {
    let query = `SELECT 
                  c.id, c.offer_id, c.publisher_id, c.tenant_id, c.publisher_offer_id, c.ip, c.user_agent, c.referrer, c.click_uuid, c.country, c.region, c.city, c.isp, c.location, c.domain, c.device_type, c.browser, c.os, c.os_version, c.device_brand, c.device_model, c.source_id, c.device_id, c.google_id, c.android_id, c.rcid, c.tid, c.timestamp, c.created_at, c.extra_params,
                  p.email as publisher_email,
                  p.company_name as publisher_company
           FROM clicks c
           LEFT JOIN publishers p ON c.publisher_id = p.id
           WHERE c.offer_id = ?`;
    const params = [offerId];

    if (tenantId) {
      query += ' AND c.tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async getRecentConversionsForOffer({ offerId, tenantId, limit = 50 }) {
    let query = `SELECT 
                  conv.id, conv.conversion_uuid, conv.click_uuid, conv.offer_id, conv.publisher_id, conv.tenant_id, conv.publisher_offer_id, conv.rcid, conv.status, conv.amount, conv.payout, conv.ip, conv.timestamp, conv.postback_payload, conv.created_at, conv.updated_at, conv.extra_params, conv.is_test,
                  p.email as publisher_email,
                  p.company_name as publisher_company,
                  c.click_uuid as click_uuid_derived
           FROM conversions conv
           LEFT JOIN publishers p ON conv.publisher_id = p.id
           LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid
           WHERE conv.offer_id = ?`;
    const params = [offerId];

    if (tenantId) {
      query += ' AND conv.tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY conv.created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async findOfferAssignmentsByInternalIds({ offerId, publisherId, tenantId = null }) {
    let query = 'SELECT id, status FROM publisher_offers WHERE offer_id = ? AND publisher_id = ?';
    const params = [offerId, publisherId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return rows[0];
  }

  async countOffers({ whereClause, params }) {
    const countSql = `
      SELECT COUNT(*) as total
      FROM offers o
      LEFT JOIN advertisers a ON a.id = o.advertiser_id
      ${whereClause}
    `;
    const [rows] = await this.pool.query(countSql, params);
    return Array.isArray(rows) ? rows[0]?.total || 0 : 0;
  }

  async searchOffersQuick({ whereClause, params, startsWithTerm, limit }) {
    const sql = `
      SELECT
        o.id,
        o.public_offer_id,
        o.name,
        o.status,
        o.country,
        o.category,
        a.name AS advertiser_name,
        (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) AS display_id
      FROM offers o
      LEFT JOIN advertisers a ON a.id = o.advertiser_id
      ${whereClause}
      ORDER BY
        CASE WHEN o.name LIKE ? THEN 0 ELSE 1 END,
        o.created_at DESC
      LIMIT ?
    `;
    const [rows] = await this.pool.query(sql, [...params, startsWithTerm, limit]);
    return rows;
  }

  async updateOfferStatusTenantScoped({ id, tenantId = null, status }) {
    let query = 'UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?';
    const params = [status, id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [result] = await this.pool.query(query, params);
    return result;
  }

  async getOfferCappingPerDay({ offerId }) {
    const [rows] = await this.pool.query('SELECT capping_per_day FROM offers WHERE id = ? LIMIT 1', [offerId]);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.capping_per_day ?? 0;
  }

  async getAssignmentCapOverride({ publisherOfferId }) {
    const [rows] = await this.pool.query('SELECT cap_override FROM publisher_offers WHERE id = ? LIMIT 1', [
      publisherOfferId,
    ]);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.cap_override ?? null;
  }

  async countClicksForOfferPublisherOnUtcDay({ offerId, publisherId, utcDate }) {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM clicks
       WHERE offer_id = ?
         AND publisher_id = ?
         AND DATE(created_at) = ?`,
      [offerId, publisherId, utcDate]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return parseInt(row?.count || 0);
  }

  async getOffersStatsSummary() {
    const [rows] = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as active
       FROM offers
       WHERE status != 'remove'`
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async softDeleteOffer({ id }) {
    const [result] = await this.pool.query(`UPDATE offers SET status = 'remove', updated_at = UTC_TIMESTAMP() WHERE id = ?`, [
      id,
    ]);
    return result;
  }

  async updateOffer({ id, tenantId, data }) {
    const fields = [];
    const params = [];
    
    const jsonFields = [
      'macros_json',
      'device_targeting_json',
      'os_targeting_json',
      'browser_targeting_json',
      'isp_targeting_json',
      'carrier_targeting_json',
      'city_targeting_json',
      'advertiser_postback_macros_json',
      'system_postback_macros_json',
    ];

    const updatable = [
      'name', 'description', 'category', 'status', 'offer_visibility',
      'offer_currency', 'country', 'advertiser_model', 'advertiser_amount',
      'affiliate_model', 'affiliate_amount', 'offer_url', 'preview_url',
      'billing_flow', 'billing_type', 'token_type', 'macros_json',
      'start_date', 'end_date', 'start_time', 'end_time',
      'ip_action', 'ip_list', 'country_action', 'country_list',
      'device_targeting_json', 'device_action', 'os_targeting_json', 'os_action',
      'browser_targeting_json', 'browser_action', 'isp_targeting_json',
      'carrier_targeting_json', 'city_targeting_json', 'capping_type',
      'capping_duration', 'capping_action', 'fallback_type', 'daily_cap',
      'monthly_cap', 'total_cap', 'conversion_cap', 'capping_conversions_duration',
      'budget_cap', 'advertiser_capping_budget_duration',
      'advertiser_capping_budget_amount', 'advertiser_over_capping',
      'affiliate_over_capping', 'cap_action', 'fallback_enabled',
      'fallback_url', 'fallback_offer_id', 'advertiser_postback_url',
      'advertiser_postback_method', 'advertiser_postback_macros_json',
      'system_postback_url', 'system_postback_method', 'system_postback_macros_json',
    ];

    updatable.forEach((key) => {
      if (data[key] !== undefined) {
        let value = data[key];
        if (jsonFields.includes(key)) {
          value = (value === null || typeof value === 'string') ? value : JSON.stringify(value);
        } else if (key === 'fallback_enabled') {
          value = value ? 1 : 0;
        } else if (key === 'capping_type' || key === 'fallback_type') {
          value = (value === 'none') ? null : value;
        }
        fields.push(`${key} = ?`);
        params.push(value ?? null);
      }
    });

    if (!fields.length) return { affectedRows: 0 };

    fields.push('updated_at = UTC_TIMESTAMP()');
    params.push(id);

    let sql = `UPDATE offers SET ${fields.join(', ')} WHERE id = ?`;
    if (tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [result] = await this.pool.query(sql, params);
    return result;
  }

  async listOffersPaginated({ whereClause, params, limit, offset }) {
    const fields = 'o.id, o.public_offer_id, o.name, o.category, o.status, o.country, o.advertiser_amount, o.affiliate_amount, o.created_at, o.updated_at';
    const sql = `
      SELECT ${fields},
      a.name as advertiser_name,
      a.public_advertiser_id,
      (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
      FROM offers o
      LEFT JOIN advertisers a ON o.advertiser_id = a.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await this.pool.query(sql, [...params, limit, offset]);
    return rows;
  }

  async getOfferPerformance({ internalId, tenantId, rangeStart, rangeEnd }) {
    const query = `SELECT 
        p.id as publisher_id,
        p.public_publisher_id as public_id,
        COALESCE(p.company_name, p.first_name, p.email, 'Unknown') as publisher_name,
        p.email as publisher_email,
        COALESCE(c.total_clicks, 0) as clicks,
        COALESCE(conv.total_conversions, 0) as conversions,
        COALESCE(conv.pending_conversions, 0) as pending_conversions,
        COALESCE(conv.approved_conversions, 0) as approved_conversions,
        COALESCE(conv.approved_payout, 0) as approved_payout,
        COALESCE(conv.total_revenue, 0) as total_revenue,
        (COALESCE(conv.total_revenue, 0) - COALESCE(conv.approved_payout, 0)) as total_profit
      FROM publisher_offers po
      INNER JOIN publishers p ON po.publisher_id = p.id
      LEFT JOIN (
        SELECT
          publisher_id,
          COUNT(*) as total_clicks
        FROM clicks
        WHERE offer_id = ? 
        ${tenantId ? ' AND tenant_id = ?' : ''}
        ${rangeStart ? ' AND created_at >= ?' : ''}
        ${rangeEnd ? ' AND created_at <= ?' : ''}
        GROUP BY publisher_id
      ) c ON c.publisher_id = p.id
      LEFT JOIN (
        SELECT
          publisher_id,
          COUNT(*) as total_conversions,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as approved_payout,
          COALESCE(SUM(amount), 0) as total_revenue
        FROM conversions
        WHERE offer_id = ?
        ${tenantId ? ' AND tenant_id = ?' : ''}
        ${rangeStart ? ' AND created_at >= ?' : ''}
        ${rangeEnd ? ' AND created_at <= ?' : ''}
        GROUP BY publisher_id
      ) conv ON conv.publisher_id = p.id
      WHERE po.offer_id = ? 
      ${tenantId ? ' AND po.tenant_id = ?' : ''}
      ORDER BY total_revenue DESC
    `;

    const qParams = [internalId];
    if (tenantId) qParams.push(tenantId);
    if (rangeStart) qParams.push(rangeStart);
    if (rangeEnd) qParams.push(rangeEnd);

    qParams.push(internalId);
    if (tenantId) qParams.push(tenantId);
    if (rangeStart) qParams.push(rangeStart);
    if (rangeEnd) qParams.push(rangeEnd);

    qParams.push(internalId);
    if (tenantId) qParams.push(tenantId);

    const [rows] = await this.pool.query(query, qParams);
    return rows;
  }
}
