export class PublicIdRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getPublicId(table, column, field, id, tenantId) {
    const [rows] = await this.pool.query(
      `SELECT ${column} FROM ${table} WHERE ${field} = ? AND tenant_id = ? LIMIT 1`,
      [id, tenantId]
    );
    return rows[0]?.[column] || null;
  }

  async generateNextPublicId(table, column, tenantId) {
    const [rows] = await this.pool.query(
      `SELECT COALESCE(MAX(${column}), 0) + 1 AS next_id 
       FROM ${table} 
       WHERE tenant_id = ?`,
      [tenantId]
    );
    return rows[0]?.next_id || 1;
  }

  async getOfferByPublicIdOrDisplayId(tenantId, publicOfferId, status = 'live') {
    const fields = 't.id, t.advertiser_id, t.tenant_id, t.public_offer_id, t.name, t.category, t.status, t.offer_visibility, t.country, t.advertiser_model, t.advertiser_amount, t.affiliate_model, t.affiliate_amount, t.offer_url, t.preview_url, t.token_type, t.macros_json, t.start_date, t.end_date, t.ip_action, t.ip_list, t.country_action, t.country_list, t.device_targeting_json, t.device_action, t.os_targeting_json, t.os_action, t.browser_targeting_json, t.browser_action, t.capping_type, t.capping_duration, t.capping_action, t.fallback_type, t.daily_cap, t.monthly_cap, t.total_cap, t.conversion_cap, t.budget_cap, t.fallback_enabled, t.fallback_url, t.fallback_offer_id, t.created_at, t.updated_at, t.display_id';
    const query = `
      SELECT ${fields} FROM (
          SELECT 
              o.id, o.advertiser_id, o.tenant_id, o.public_offer_id, o.name, o.category, o.status, o.offer_visibility, o.country, o.advertiser_model, o.advertiser_amount, o.affiliate_model, o.affiliate_amount, o.offer_url, o.preview_url, o.token_type, o.macros_json, o.start_date, o.end_date, o.ip_action, o.ip_list, o.country_action, o.country_list, o.device_targeting_json, o.device_action, o.os_targeting_json, o.os_action, o.browser_targeting_json, o.browser_action, o.capping_type, o.capping_duration, o.capping_action, o.fallback_type, o.daily_cap, o.monthly_cap, o.total_cap, o.conversion_cap, o.budget_cap, o.fallback_enabled, o.fallback_url, o.fallback_offer_id, o.created_at, o.updated_at,
              (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
          FROM offers o 
          WHERE o.tenant_id = ?
      ) t 
      WHERE (t.public_offer_id = ? OR t.display_id = ?)
      ${status ? ' AND t.status = ?' : ''}
      LIMIT 1
    `;
    const params = [tenantId, publicOfferId, publicOfferId];
    if (status) params.push(status);

    const [rows] = await this.pool.query(query, params);
    return rows[0] || null;
  }

  async getOfferById(id, tenantId, status) {
    let query = `SELECT id, advertiser_id, tenant_id, public_offer_id, name, description, category, status, offer_visibility, offer_currency, country, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, offer_url, preview_url, token_type, macros_json, start_date, end_date, start_time, end_time, ip_action, ip_list, country_action, country_list, device_targeting_json, device_action, os_targeting_json, os_action, browser_targeting_json, browser_action, isp_targeting_json, carrier_targeting_json, city_targeting_json, capping_type, capping_duration, capping_action, fallback_type, daily_cap, monthly_cap, total_cap, conversion_cap, capping_conversions_duration, budget_cap, advertiser_capping_budget_duration, advertiser_capping_budget_amount, advertiser_over_capping, affiliate_over_capping, cap_action, fallback_enabled, fallback_url, fallback_offer_id, advertiser_postback_url, advertiser_postback_method, advertiser_postback_macros_json, system_postback_url, system_postback_method, system_postback_macros_json, created_at, updated_at FROM offers WHERE tenant_id = ? AND id = ?`;
    const params = [tenantId, id];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' LIMIT 1';
    const [rows] = await this.pool.query(query, params);
    return rows[0] || null;
  }

  async getEntityByPublicId(table, column, id, tenantId) {
    const fieldsMap = {
      publishers: 'id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at',
      advertisers: 'id, public_advertiser_id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at'
    };
    const fields = fieldsMap[table] || '*';
    const [rows] = await this.pool.query(
      `SELECT ${fields} FROM ${table} WHERE tenant_id = ? AND ${column} = ? LIMIT 1`,
      [tenantId, id]
    );
    return rows[0] || null;
  }

  async archiveOffer(offerId, tenantId) {
    const [result] = await this.pool.query(
      `UPDATE offers 
       SET status = 'archived', updated_at = UTC_TIMESTAMP() 
       WHERE id = ? AND tenant_id = ?`,
      [offerId, tenantId]
    );
    return result.affectedRows;
  }
}
