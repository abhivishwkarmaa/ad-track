import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

class AdvertiserService {
  async createAdvertiser(data, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenant_id for advertiser creation
      if (!tenantId) {
        const err = new Error('Tenant context required to create advertiser');
        err.statusCode = 400;
        throw err;
      }
      
      // ✅ CRITICAL: Check for duplicate email within tenant (prevents false 409 conflicts)
      const existing = await this.getAdvertiserById(null, tenantId); // We'll check by email
      // Better: Check by email with tenant_id
      const [emailCheck] = await pool.query(
        'SELECT id FROM advertisers WHERE email = ? AND tenant_id = ? LIMIT 1',
        [data.email, tenantId]
      );
      if (emailCheck && emailCheck.length > 0) {
        const err = new Error('Advertiser with this email already exists for this tenant');
        err.statusCode = 409;
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      
      // ✅ CRITICAL: Include tenant_id in INSERT
      const sql = `
        INSERT INTO advertisers (
          name,
          email,
          company_name,
          country,
          website,
          notes,
          status,
          tenant_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        data.name,
        data.email,
        data.company_name || null,
        data.country,
        data.website || null,
        data.notes || null,
        data.status || 'active',
        tenantId, // Add tenant_id
      ];

      const [result] = await pool.query(sql, params);
      const insertId = result.insertId ?? result?.[0]?.insertId;
      
      // ✅ CRITICAL: Fetch with tenant_id filtering
      return this.getAdvertiserById(insertId, tenantId);
    } catch (error) {
      logger.error('AdvertiserService.createAdvertiser error:', error);
      throw error;
    }
  }

  async updateAdvertiser(id, data, tenantId = null) {
    try {
      // ✅ CRITICAL: Verify advertiser belongs to tenant first
      const existing = await this.getAdvertiserById(id, tenantId);
      if (!existing) {
        const err = new Error('Advertiser not found');
        err.statusCode = 404;
        throw err;
      }
      
      if (tenantId && existing.tenant_id !== tenantId) {
        const err = new Error('Advertiser does not belong to this tenant');
        err.statusCode = 403;
        throw err;
      }
      
      const fields = [];
      const params = [];

      const updatable = [
        'name',
        'email',
        'company_name',
        'country',
        'website',
        'notes',
        'status',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(data[key] ?? null);
        }
      });

      if (!fields.length) {
        return this.getAdvertiserById(id, tenantId);
      }

      fields.push('updated_at = UTC_TIMESTAMP()');
      params.push(id);

      // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
      let sql = `UPDATE advertisers SET ${fields.join(', ')} WHERE id = ?`;
      if (tenantId) {
        sql += ' AND tenant_id = ?';
        params.push(tenantId);
      }
      
      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return null;
      }

      return this.getAdvertiserById(id, tenantId);
    } catch (error) {
      logger.error('AdvertiserService.updateAdvertiser error:', error);
      throw error;
    }
  }

  async getAdvertiserById(id, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    let query = 'SELECT * FROM advertisers WHERE id = ?';
    const params = [id];
    
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    query += ' LIMIT 1';
    
    const [rows] = await pool.query(query, params);
    const advertiser = Array.isArray(rows) ? rows[0] : rows;
    
    // Verify advertiser belongs to tenant
    if (tenantId && advertiser && advertiser.tenant_id !== tenantId) {
      return null;
    }
    
    return advertiser;
  }

  async listAdvertisers(filters = {}, tenantId = null) {
    const conditions = [];
    const params = [];

    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    if (tenantId) {
      conditions.push('tenant_id = ?');
      params.push(tenantId);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.country) {
      conditions.push('country = ?');
      params.push(filters.country);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push('(name LIKE ? OR email LIKE ? OR company_name LIKE ?)');
      params.push(term, term, term);
    }

    const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const listSql = `
      SELECT *
      FROM advertisers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(listSql, [...params, limit, offset]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM advertisers
      ${whereClause}
    `;
    const [countRows] = await pool.query(countSql, params);
    const total = Array.isArray(countRows) ? countRows[0]?.total || 0 : 0;

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async deleteAdvertiser(id, tenantId = null) {
    try {
      // ✅ CRITICAL: Verify advertiser belongs to tenant first
      const existing = await this.getAdvertiserById(id, tenantId);
      if (!existing) {
        return null;
      }
      
      // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
      let sql = `
        UPDATE advertisers
        SET status = 'inactive', updated_at = UTC_TIMESTAMP()
        WHERE id = ?`;
      const params = [id];
      
      if (tenantId) {
        sql += ' AND tenant_id = ?';
        params.push(tenantId);
      }
      
      const [result] = await pool.query(sql, params);

      if (!result.affectedRows) {
        return null;
      }

      return this.getAdvertiserById(id);
    } catch (error) {
      logger.error('AdvertiserService.deleteAdvertiser error:', error);
      throw error;
    }
  }
}

export default new AdvertiserService();
