import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcrypt';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

export class PublisherService {
  async create(data, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenant_id for publisher creation
      if (!tenantId) {
        const err = new Error('Tenant context required to create publisher');
        err.statusCode = 400;
        throw err;
      }
      
      // ✅ CRITICAL: Check for duplicate email within tenant (prevents false 409 conflicts)
      const existing = await this.findByEmail(data.email, tenantId);
      if (existing) {
        const err = new Error('Publisher with this email already exists for this tenant');
        err.statusCode = 409;
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      
      // Hash password if provided
      let passwordHash = null;
      if (data.password) {
        passwordHash = await bcrypt.hash(data.password, 10);
      }

      // ✅ CRITICAL: Include tenant_id in INSERT
      const [result] = await pool.query(
        `INSERT INTO publishers (
          email, first_name, company_name, country, password_hash, global_postback_url, status, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          data.email,
          data.first_name || null,
          data.company_name || null,
          data.country || null,
          passwordHash,
          data.global_postback_url || null,
          tenantId, // Add tenant_id
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      // ✅ CRITICAL: Fetch with tenant_id filtering (include tenant_id in SELECT)
      const [rows] = await pool.query(
        'SELECT id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE id = ? AND tenant_id = ?',
        [insertId, tenantId]
      );
      const publisher = Array.isArray(rows) ? rows[0] : rows;
      // Remove password_hash from response
      if (publisher && publisher.password_hash) {
        delete publisher.password_hash;
      }
      return publisher;
    } catch (error) {
      logger.error('PublisherService.create error:', error);
      throw error;
    }
  }

  async findById(id, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    // ✅ CRITICAL: Include tenant_id in SELECT fields for verification
    let query = 'SELECT id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE id = ?';
    const params = [id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);
    const publisher = Array.isArray(rows) ? rows[0] : rows;

    // Verify publisher belongs to tenant (now that tenant_id is selected)
    if (tenantId && publisher && publisher.tenant_id !== tenantId) {
      return null;
    }

    // Remove password_hash from response if present
    if (publisher && publisher.password_hash) {
      delete publisher.password_hash;
    }
    return publisher;
  }

  async findByEmail(email, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation (prevents duplicate email conflicts across tenants)
    let query = 'SELECT id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at FROM publishers WHERE email = ?';
    const params = [email];
    
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    const [rows] = await pool.query(query, params);
    const publisher = Array.isArray(rows) ? rows[0] : rows;
    
    // Verify publisher belongs to tenant if tenant_id is set
    if (tenantId && publisher && publisher.tenant_id !== tenantId) {
      return null;
    }
    
    // Remove password_hash from response if present
    if (publisher && publisher.password_hash) {
      delete publisher.password_hash;
    }
    return publisher;
  }

  // Internal method to get publisher with password_hash (for authentication)
  // ✅ CRITICAL: For authentication, we may need to check across tenants or specific tenant
  async findByEmailWithPassword(email, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    let query = 'SELECT * FROM publishers WHERE email = ?';
    const params = [email];
    
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    const [rows] = await pool.query(query, params);
    const publisher = Array.isArray(rows) ? rows[0] : rows;
    
    // Verify publisher belongs to tenant if tenant_id is set
    if (tenantId && publisher && publisher.tenant_id !== tenantId) {
      return null;
    }
    
    return publisher;
  }

  async findAll(filters = {}, tenantId = null) {
    let where = ' WHERE 1=1';
    const params = [];

    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    if (tenantId) {
      where += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    if (filters.status) {
      where += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.email) {
      where += ' AND email LIKE ?';
      params.push(`%${filters.email}%`);
    }

    if (filters.company_name) {
      where += ' AND company_name LIKE ?';
      params.push(`%${filters.company_name}%`);
    }

    // Pagination
    const page = parseInt(filters.page || 1, 10);
    const limit = parseInt(filters.limit || 10, 10);
    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at
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

    const [dataRows] = await pool.query(dataQuery, [...params, limit, offset]);
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0]?.count || 0;

    return {
      data: dataRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id, data, tenantId = null) {
    // ✅ CRITICAL: Verify publisher belongs to tenant first
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      const err = new Error('Publisher not found');
      err.statusCode = 404;
      throw err;
    }
    
    if (tenantId && existing.tenant_id !== tenantId) {
      const err = new Error('Publisher does not belong to this tenant');
      err.statusCode = 403;
      throw err;
    }
    
    const fields = [];
    const params = [];

    // Handle password hashing separately
    if (data.password !== undefined) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      fields.push(`password_hash = ?`);
      params.push(passwordHash);
    }

    // Handle other allowed fields
    const allowedFields = ['email', 'first_name', 'company_name', 'country', 'global_postback_url', 'status'];
    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && allowedFields.includes(key) && key !== 'password') {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0) {
      return this.findById(id, tenantId);
    }

    fields.push(`updated_at = UTC_TIMESTAMP()`);
    params.push(id);

    // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
    let query = `UPDATE publishers SET ${fields.join(', ')} WHERE id = ?`;
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    await pool.query(query, params);
    // Return publisher without password_hash
    return this.findById(id, tenantId);
  }

  async getStats(tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
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
    
    const [rows] = await pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async softDelete(id, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
    let query = `UPDATE publishers SET status = 'suspended', updated_at = UTC_TIMESTAMP() WHERE id = ?`;
    const params = [id];
    
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    const [result] = await pool.query(query, params);
    if ((result.affectedRows || result.affectedRows === 0) && result.affectedRows === 0) {
      return null;
    }
    return this.findById(id, tenantId);
  }
}

export default new PublisherService();

