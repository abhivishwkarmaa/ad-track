import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcrypt';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

import offerPublicIdService from './offerPublicIdService.js';

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

      // Generate public_publisher_id
      const publicPublisherId = await offerPublicIdService.generatePublicPublisherId(tenantId);

      // ✅ CRITICAL: Include tenant_id in INSERT
      const [result] = await pool.query(
        `INSERT INTO publishers (
          email, first_name, company_name, country, password_hash, global_postback_url, status, tenant_id, public_publisher_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          data.email,
          data.first_name || null,
          data.company_name || null,
          data.country || null,
          passwordHash,
          data.global_postback_url || null,
          tenantId, // Add tenant_id
          publicPublisherId
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

  async findById(id, tenantId = null, internalOnly = false) {
    if (!id) return null;

    const fields = 'id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at';

    // 1. Try Public ID first (unless strict internal lookup)
    if (tenantId && !internalOnly) {
      const [publicRows] = await pool.query(
        `SELECT ${fields} FROM publishers WHERE public_publisher_id = ? AND tenant_id = ? LIMIT 1`,
        [id, tenantId]
      );
      if (publicRows && (Array.isArray(publicRows) ? publicRows[0] : publicRows)) {
        return Array.isArray(publicRows) ? publicRows[0] : publicRows;
      }
    }

    // 2. Fallback to internal ID
    let query = `SELECT ${fields} FROM publishers WHERE id = ?`;
    const params = [id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);
    const publisher = Array.isArray(rows) ? rows[0] : rows;

    // Verify publisher belongs to tenant
    if (tenantId && publisher && publisher.tenant_id !== tenantId) {
      return null;
    }

    return publisher;
  }

  async getInternalIdByPublicId(publicId, tenantId) {
    if (publicId == null || !tenantId) return null;
    const [rows] = await pool.query(
      'SELECT id FROM publishers WHERE tenant_id = ? AND public_publisher_id = ? LIMIT 1',
      [tenantId, publicId]
    );
    return rows?.[0]?.id ?? null;
  }

  async findByEmail(email, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation (prevents duplicate email conflicts across tenants)
    let query = 'SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at FROM publishers WHERE email = ?';
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
    let query = 'SELECT id, public_publisher_id, email, password_hash, first_name, company_name, country, global_postback_url, status, tenant_id, created_at, updated_at FROM publishers WHERE email = ?';
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
    const internalId = existing.id;
    params.push(internalId);

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

  async getPerformanceStats(filters = {}, tenantId = null) {
    // FINANCIAL SEPARATION RULES:
    // 1. Revenue = SUM(amount) (Advertiser Revenue) - ALWAYS counted, regardless of status (even rejected).
    // 2. Payout = SUM(payout) (Publisher Earnings) - ONLY counted when status = 'approved'.
    // 3. Profit = Revenue - Payout.
    try {
      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 50);
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE p.tenant_id = ?';
      const params = [tenantId];

      if (filters.search) {
        whereClause += ` AND (p.company_name LIKE ? OR p.email LIKE ? OR p.first_name LIKE ?)`;
        const term = `%${filters.search}%`;
        params.push(term, term, term);
      }

      if (filters.status) {
        whereClause += ` AND p.status = ?`;
        params.push(filters.status);
      }

      let dateCondition = '';
      const statsParams = [];
      if (filters.date_from && filters.date_to) {
        const utcStart = new Date(`${filters.date_from}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        const utcEnd = new Date(`${filters.date_to}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        dateCondition = ' AND conv.created_at BETWEEN ? AND ?';
        statsParams.push(utcStart, utcEnd);
      } else if (filters.date_from) {
        const utcStart = new Date(`${filters.date_from}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        dateCondition = ' AND conv.created_at >= ?';
        statsParams.push(utcStart);
      } else if (filters.date_to) {
        const utcEnd = new Date(`${filters.date_to}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        dateCondition = ' AND conv.created_at <= ?';
        statsParams.push(utcEnd);
      }

      const query = `
        SELECT 
          p.id,
          p.public_publisher_id,
          p.company_name,
          p.email,
          p.status,
          COALESCE(stats.clicks, 0) as clicks,
          COALESCE(stats.conversions, 0) as conversions,
          COALESCE(stats.radius_revenue, 0) as revenue, -- "Radius Revenue" usually means Advertiser Revenue
          COALESCE(stats.payout, 0) as payout,
          COALESCE(stats.profit, 0) as profit,
          COALESCE(stats.pending_payout, 0) as pending_payout
        FROM publishers p
        LEFT JOIN (
          SELECT 
            c.publisher_id,
            COUNT(DISTINCT c.id) as clicks,
            COUNT(DISTINCT CASE WHEN conv.status != 'rejected' AND conv.status != 'rejected_cap' THEN conv.id END) as conversions,
            
            -- Revenue: ALL (Advertiser Revenue - inc. Rejected)
            COALESCE(SUM(conv.amount), 0) as radius_revenue,
            
            -- Payout: Approved Only (Publisher Earnings)
            COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
            
            -- Profit: Revenue - Approved Payout
            COALESCE(SUM(conv.amount) - SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,

             -- Pending Payout (For reference only, also included in Total Payout now)
            COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout

          FROM clicks c
          LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid ${dateCondition.replace('conv.', '')}
          WHERE c.tenant_id = ? 
          /* Date condition for clicks also needs to be applied if we want accurate click counts in range */
          ${dateCondition.replace('conv.', 'c.')}
          GROUP BY c.publisher_id
        ) stats ON stats.publisher_id = p.id
        ${whereClause}
        ORDER BY stats.radius_revenue DESC
        LIMIT ? OFFSET ?
      `;

      // Params for stats subquery (conversions) + clicks subquery + main query
      const finalParams = [
        ...statsParams, // for conv JOIN
        tenantId,
        ...statsParams, // for clicks WHERE
        ...params,      // for main WHERE
        limit,
        offset
      ];

      const countQuery = `SELECT COUNT(*) as total FROM publishers p ${whereClause}`;

      const [dataRows] = await pool.query(query, finalParams);
      const [countRows] = await pool.query(countQuery, params);
      const total = countRows[0]?.total || 0;

      // Calculate Total Summary (Grand Total for the filters)
      const summaryQuery = `
        SELECT 
          COUNT(DISTINCT c.id) as total_clicks,
          COUNT(DISTINCT CASE WHEN conv.status != 'rejected' AND conv.status != 'rejected_cap' THEN conv.id END) as total_conversions,
          COALESCE(SUM(conv.amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as total_payout,
          COALESCE(SUM(conv.amount) - SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as total_profit
        FROM publishers p
        LEFT JOIN clicks c ON c.publisher_id = p.id AND c.tenant_id = p.tenant_id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid 
        ${dateCondition}
        ${whereClause} 
        /* Ensure we filter by date for clicks too in the summary if date range applies */
        ${dateCondition.replace('conv.', 'c.')}
      `;

      // Params for summary (statsParams for conv, params for where, statsParams for clicks)
      const summaryParams = [...statsParams, ...params, ...statsParams];

      const [summaryRows] = await pool.query(summaryQuery, summaryParams);
      const summaryData = summaryRows[0] || {};

      return {
        data: dataRows.map(row => ({
          ...row,
          clicks: parseInt(row.clicks),
          conversions: parseInt(row.conversions),
          revenue: parseFloat(row.revenue),
          payout: parseFloat(row.payout),
          profit: parseFloat(row.profit),
          epc: parseInt(row.clicks) > 0 ? (parseFloat(row.revenue) / parseInt(row.clicks)).toFixed(2) : '0.00',
          cr: parseInt(row.clicks) > 0 ? ((parseInt(row.conversions) / parseInt(row.clicks)) * 100).toFixed(2) : '0.00'
        })),
        summary: {
          clicks: parseInt(summaryData.total_clicks || 0),
          conversions: parseInt(summaryData.total_conversions || 0),
          revenue: parseFloat(summaryData.total_revenue || 0),
          payout: parseFloat(summaryData.total_payout || 0),
          profit: parseFloat(summaryData.total_profit || 0)
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('PublisherService.getPerformanceStats error:', error);
      throw error;
    }
  }

  async softDelete(id, tenantId = null) {
    // ✅ CRITICAL: Resolve internal ID first
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const internalId = existing.id;
    // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
    let query = `UPDATE publishers SET status = 'suspended', updated_at = UTC_TIMESTAMP() WHERE id = ?`;
    const params = [internalId];

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

