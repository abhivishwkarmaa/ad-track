export class PublisherRepository {
  constructor(pool) {
    this.pool = pool;
  }
// ... methods remain unchanged

  async create(data) {
    const [result] = await this.pool.query(
      `INSERT INTO publishers (
        email, first_name, company_name, country, password_hash, global_postback_url, status, tenant_id, public_publisher_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [
        data.email,
        data.first_name || null,
        data.company_name || null,
        data.country || null,
        data.password_hash,
        data.global_postback_url || null,
        data.tenant_id,
        data.public_publisher_id
      ]
    );
    return result.insertId || result[0]?.insertId;
  }

  async findById(id, tenantId) {
    const fields = 'id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at';
    let query = `SELECT ${fields} FROM publishers WHERE id = ?`;
    const params = [id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return rows[0];
  }

  async findByPublicId(publicId, tenantId) {
    const fields = 'id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at';
    const [rows] = await this.pool.query(
      `SELECT ${fields} FROM publishers WHERE public_publisher_id = ? AND tenant_id = ? LIMIT 1`,
      [publicId, tenantId]
    );
    return rows[0];
  }

  async getInternalIdByPublicId(publicId, tenantId) {
    const [rows] = await this.pool.query(
      'SELECT id FROM publishers WHERE tenant_id = ? AND public_publisher_id = ? LIMIT 1',
      [tenantId, publicId]
    );
    return rows?.[0]?.id ?? null;
  }

  async findByEmail(email, tenantId, includePassword = false) {
    const fields = includePassword 
      ? 'id, public_publisher_id, email, password_hash, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at'
      : 'id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at';
    
    let query = `SELECT ${fields} FROM publishers WHERE email = ?`;
    const params = [email];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return rows[0];
  }

  async findAll({ where, params, limit, offset }) {
    const dataQuery = `
      SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at
      FROM publishers
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM publishers
      ${where}
    `;

    const [dataRows] = await this.pool.query(dataQuery, [...params, limit, offset]);
    const [countRows] = await this.pool.query(countQuery, params);
    const total = countRows[0]?.count || 0;

    return { dataRows, total };
  }

  async update(id, tenantId, fields, params) {
    let query = `UPDATE publishers SET ${fields.join(', ')} WHERE id = ?`;
    const finalParams = [...params, id];
    
    if (tenantId) {
      query += ' AND tenant_id = ?';
      finalParams.push(tenantId);
    }

    const [result] = await this.pool.query(query, finalParams);
    return result.affectedRows;
  }

  async getStats(tenantId) {
    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
      FROM publishers`;
    const params = [];

    if (tenantId) {
      query += ' WHERE tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await this.pool.query(query, params);
    return rows[0];
  }

  async getPerformanceStats({ query, finalParams, countQuery, params, summaryQuery, summaryParams }) {
    const [dataRows] = await this.pool.query(query, finalParams);
    const [countRows] = await this.pool.query(countQuery, params);
    const [summaryRows] = await this.pool.query(summaryQuery, summaryParams);

    return {
      dataRows,
      total: countRows[0]?.total || 0,
      summaryData: summaryRows[0] || {}
    };
  }

  async softDelete(id, tenantId) {
    let query = `UPDATE publishers SET status = 'suspended', updated_at = UTC_TIMESTAMP() WHERE id = ?`;
    const params = [id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [result] = await this.pool.query(query, params);
    return result.affectedRows;
  }
  async getPublisherSummaryReport({ tenantId, whereClause, params, dateCondition, statsParams }) {
    const query = `
      SELECT 
        p.id,
        p.public_publisher_id,
        p.company_name,
        p.email,
        p.status,
        COALESCE(stats.clicks, 0) as clicks,
        COALESCE(stats.conversions, 0) as conversions,
        COALESCE(stats.radius_revenue, 0) as revenue,
        COALESCE(stats.payout, 0) as payout,
        COALESCE(stats.profit, 0) as profit,
        COALESCE(stats.pending_payout, 0) as pending_payout
      FROM publishers p
      LEFT JOIN (
        SELECT 
          c.publisher_id,
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT CASE WHEN conv.status != 'rejected' AND conv.status != 'rejected_cap' AND conv.status != 'click_expired' THEN conv.id END) as conversions,
          COALESCE(SUM(conv.amount), 0) as radius_revenue,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
          COALESCE(SUM(conv.amount) - SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
          COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout
        FROM clicks c
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid ${dateCondition.replace(/conv\./g, '')}
        WHERE c.tenant_id = ? 
        ${dateCondition.replace(/conv\./g, 'c.')}
        GROUP BY c.publisher_id
      ) stats ON p.id = stats.publisher_id
      WHERE p.tenant_id = ? ${whereClause}
    `;
    
    // Params order: pairs(×6) + click_stats(tenantId, utcStart, utcEnd) + conv_stats(tenantId, utcStart, utcEnd)
    // Actually our params are: dateCondition(for LEFT JOIN), tenantId, dateCondition(for WHERE), tenantId, ...whereClauseParams
    const allParams = [...statsParams, tenantId, ...statsParams, tenantId, ...params];
    const [rows] = await this.pool.query(query, allParams);
    return rows;
  }
}

// (no singleton export)
