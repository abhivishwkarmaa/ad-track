import logger from '../utils/logger.js';
import bcrypt from 'bcrypt';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

export class PublisherService {
  constructor(publisherRepository, offerPublicIdService) {
    this.publisherRepository = publisherRepository;
    this.offerPublicIdService = offerPublicIdService;
  }

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
      const publicPublisherId = await this.offerPublicIdService.generatePublicPublisherId(tenantId);

      const insertId = await this.publisherRepository.create({
        ...data,
        password_hash: passwordHash,
        tenant_id: tenantId,
        public_publisher_id: publicPublisherId
      });

      const publisher = await this.publisherRepository.findById(insertId, tenantId);
      
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
      const publicRow = await this.publisherRepository.findByPublicId(id, tenantId);
      if (publicRow) return publicRow;
    }

    // 2. Fallback to internal ID
    return await this.publisherRepository.findById(id, tenantId);
  }

  async getInternalIdByPublicId(publicId, tenantId) {
    if (publicId == null || !tenantId) return null;
    return await this.publisherRepository.getInternalIdByPublicId(publicId, tenantId);
  }

  async findByEmail(email, tenantId = null) {
    const publisher = await this.publisherRepository.findByEmail(email, tenantId);
    
    // Remove password_hash from response if present
    if (publisher && publisher.password_hash) {
      delete publisher.password_hash;
    }
    return publisher;
  }

  async findByEmailWithPassword(email, tenantId = null) {
    return await this.publisherRepository.findByEmail(email, tenantId, true);
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

    const { dataRows, total } = await this.publisherRepository.findAll({ where, params, limit, offset });

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

    await this.publisherRepository.update(internalId, tenantId, fields, params);
    // Return publisher without password_hash
    return this.findById(id, tenantId);
  }

  async getStats(tenantId = null) {
    return await this.publisherRepository.getStats(tenantId);
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
        const utcStart = `${filters.date_from} 00:00:00`;
        const utcEnd = `${filters.date_to} 23:59:59`;
        dateCondition = ' AND conv.created_at BETWEEN ? AND ?';
        statsParams.push(utcStart, utcEnd);
      } else if (filters.date_from) {
        const utcStart = `${filters.date_from} 00:00:00`;
        dateCondition = ' AND conv.created_at >= ?';
        statsParams.push(utcStart);
      } else if (filters.date_to) {
        const utcEnd = `${filters.date_to} 23:59:59`;
        dateCondition = ' AND conv.created_at <= ?';
        statsParams.push(utcEnd);
      }

      // ✅ ARCHITECTURE: SQL moved to this.publisherRepository.getPublisherSummaryReport
      const rows = await this.publisherRepository.getPublisherSummaryReport({
        tenantId,
        whereClause,
        params,
        dateCondition,
        statsParams
      });
        params,
        summaryQuery,
        summaryParams
      });

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
    await this.publisherRepository.softDelete(internalId, tenantId);
    return this.findById(id, tenantId);
  }
}

// (no singleton export)

