export class AdvertiserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async checkEmailExists(email, tenantId) {
    const [rows] = await this.pool.query(
      "SELECT id FROM advertisers WHERE email = ? AND tenant_id = ? LIMIT 1",
      [email, tenantId],
    );
    return rows.length > 0;
  }

  async create(data) {
    const sql = `
      INSERT INTO advertisers (
        name,
        email,
        company_name,
        country,
        website,
        notes,
        status,
        tenant_id,
        public_advertiser_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.name,
      data.email,
      data.company_name || null,
      data.country,
      data.website || null,
      data.notes || null,
      data.status || "active",
      data.tenant_id,
      data.public_advertiser_id,
    ];

    const [result] = await this.pool.query(sql, params);
    return result.insertId || result[0]?.insertId;
  }

  async findByPublicId(publicId, tenantId) {
    const [rows] = await this.pool.query(
      "SELECT id, public_advertiser_id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at FROM advertisers WHERE public_advertiser_id = ? AND tenant_id = ? LIMIT 1",
      [publicId, tenantId],
    );
    return rows[0];
  }

  async findById(id, tenantId) {
    let query =
      "SELECT id, public_advertiser_id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at FROM advertisers WHERE id = ?";
    const params = [id];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    query += " LIMIT 1";

    const [rows] = await this.pool.query(query, params);
    return rows[0];
  }

  async update(id, tenantId, fields, params) {
    let sql = `UPDATE advertisers SET ${fields.join(", ")} WHERE id = ?`;
    const finalParams = [...params, id];
    if (tenantId) {
      sql += " AND tenant_id = ?";
      finalParams.push(tenantId);
    }

    const [result] = await this.pool.query(sql, finalParams);
    return result.affectedRows;
  }

  async findAll({ whereClause, params, limit, offset }) {
    const listSql = `
      SELECT id, public_advertiser_id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at
      FROM advertisers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM advertisers
      ${whereClause}
    `;

    const [dataRows] = await this.pool.query(listSql, [
      ...params,
      limit,
      offset,
    ]);
    const [countRows] = await this.pool.query(countSql, params);

    return {
      dataRows,
      total: countRows[0]?.total || 0,
    };
  }

  async delete(id, tenantId) {
    let sql = `DELETE FROM advertisers WHERE id = ?`;
    const params = [id];

    if (tenantId) {
      sql += " AND tenant_id = ?";
      params.push(tenantId);
    }

    const [result] = await this.pool.query(sql, params);
    return result.affectedRows;
  }
}
