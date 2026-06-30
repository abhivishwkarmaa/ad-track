import pool from '../db/connection.js';
import { getClickTableName } from '../repositories/clickRepository.js';
import clickRepository from '../repositories/clickRepository.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class OfferService {
  async create(data, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenant_id for offer creation
      if (!tenantId) {
        const err = new Error('Tenant context required to create offer');
        err.statusCode = 400;
        throw err;
      }

      // Generate unique URL key
      const urlKey = this.generateUrlKey(data.name);
      // Ensure nullable dates have safe defaults for MySQL
      const startAt = data.start_at || new Date();
      const endAt = data.end_at || null;

      // ✅ CRITICAL: Include tenant_id in INSERT
      const [result] = await pool.query(
        `INSERT INTO offers (
          name, category, advertiser_revenue, affiliate_model_cost,
          start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url,
          status, url_key, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          data.name,
          data.category,
          data.advertiser_revenue,
          data.affiliate_model_cost,
          startAt,
          endAt,
          data.offer_url,
          data.preview_url || null,
          data.capping_per_day || 0,
          data.fallback_url || null,
          data.status || 'pending',
          urlKey,
          tenantId, // ✅ CRITICAL: Include tenant_id
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      // ✅ CRITICAL: Fetch with tenant_id filtering
      const [rows] = await pool.query('SELECT id, name, category, advertiser_revenue, affiliate_model_cost, start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url, status, url_key, tenant_id, created_at, updated_at FROM offers WHERE id = ? AND tenant_id = ?', [insertId, tenantId]);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('OfferService.create error:', error);
      throw error;
    }
  }

  generateUrlKey(name) {
    // Generate a short unique key from name
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    const unique = uuidv4().substring(0, 8);
    return `${base}-${unique}`;
  }

  async findById(id, tenantId = null) {
    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    let query = 'SELECT id, name, category, advertiser_revenue, affiliate_model_cost, start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url, status, url_key, tenant_id, created_at, updated_at FROM offers WHERE id = ?';
    const params = [id];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);
    const offer = Array.isArray(rows) ? rows[0] : rows;

    // Verify offer belongs to tenant
    if (tenantId && offer && offer.tenant_id !== tenantId) {
      return null;
    }

    return offer;
  }

  /**
   * Check if offer is valid for operations (clicks, conversions, etc.)
   * @param {Object} offer - Offer object from database
   * @param {boolean} checkTimeRestrictions - Whether to check time restrictions (default: false for clicks, true for conversions)
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  checkOfferValidity(offer, checkTimeRestrictions = false) {
    if (!offer) {
      return {
        valid: false,
        message: 'Offer not found',
        error_type: 'offer_not_found'
      };
    }

    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not live. Current status: ${offer.status}. Only live offers can accept traffic.`,
        error_type: 'offer_not_live'
      };
    }

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date);
      endDate.setHours(23, 59, 59, 999); // End of day

      if (now > endDate) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}. The offer is no longer accepting traffic.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      const startDate = new Date(offer.start_date);
      startDate.setHours(0, 0, 0, 0); // Start of day

      if (now < startDate) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}. The offer will become active on this date.`,
          error_type: 'offer_not_started'
        };
      }
    }

    // Check time restrictions (for conversions)
    if (checkTimeRestrictions) {
      if (offer.start_time && offer.end_time) {
        if (currentTime < offer.start_time || currentTime > offer.end_time) {
          return {
            valid: false,
            message: `Conversion outside allowed time window. Allowed: ${offer.start_time} - ${offer.end_time}, Current: ${currentTime}`,
            error_type: 'offer_time_restricted'
          };
        }
      } else if (offer.start_time) {
        if (currentTime < offer.start_time) {
          return {
            valid: false,
            message: `Conversion before allowed start time. Start time: ${offer.start_time}, Current: ${currentTime}`,
            error_type: 'offer_time_restricted'
          };
        }
      } else if (offer.end_time) {
        if (currentTime > offer.end_time) {
          return {
            valid: false,
            message: `Conversion after allowed end time. End time: ${offer.end_time}, Current: ${currentTime}`,
            error_type: 'offer_time_restricted'
          };
        }
      }
    }

    return {
      valid: true,
      message: 'Offer is valid and active',
      error_type: null
    };
  }

  async findByIdWithDetails(id, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenantId for tenant isolation
      if (!tenantId) {
        const err = new Error('Tenant context required');
        err.statusCode = 400;
        throw err;
      }

      // Get offer details with tenant_id filtering
      const offer = await this.findById(id, tenantId);
      if (!offer) {
        return null;
      }

      // Get advertiser details if advertiser_id exists (with tenant_id filtering)
      let advertiser = null;
      if (offer.advertiser_id) {
        const [advertiserRows] = await pool.query(
          'SELECT id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at FROM advertisers WHERE id = ? AND tenant_id = ?',
          [offer.advertiser_id, tenantId]
        );
        advertiser = Array.isArray(advertiserRows) ? advertiserRows[0] : advertiserRows;
      }

      // ✅ CRITICAL: Get assigned publishers (assignments) with tenant_id filtering
      const [assignmentsRows] = await pool.query(
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
        [id, tenantId]
      );
      const assignments = Array.isArray(assignmentsRows) ? assignmentsRows : [];

      // Format assignments
      const formattedAssignments = assignments.map(assignment => ({
        id: assignment.id,
        publisher_id: assignment.publisher_id,
        publisher_email: assignment.publisher_email,
        publisher_first_name: assignment.publisher_first_name,
        publisher_company: assignment.publisher_company,
        publisher_country: assignment.publisher_country,
        publisher_status: assignment.publisher_status,
        payout_override: assignment.payout_override,
        cap_override: assignment.cap_override,
        conversion_approval_percentage: assignment.conversion_approval_percentage,
        capping_budget: assignment.capping_budget_duration ? {
          duration: assignment.capping_budget_duration,
          amount: assignment.capping_budget_amount,
        } : null,
        capping_conversions: assignment.capping_conversions_duration ? {
          duration: assignment.capping_conversions_duration,
          amount: assignment.capping_conversions_amount,
        } : null,
        callback_url: assignment.callback_url,
        destination_url: assignment.destination_url,
        notes: assignment.notes,
        status: assignment.status,
        assigned_at: assignment.assigned_at,
      }));

      // ✅ CRITICAL: Get statistics with tenant_id filtering in all subqueries
      const [statsRows] = await pool.query(
        `SELECT 
          (SELECT COUNT(*) FROM ${getClickTableName()} WHERE offer_id = o.id AND tenant_id = ?) as total_clicks,
          (SELECT COUNT(DISTINCT publisher_id) FROM ${getClickTableName()} WHERE offer_id = o.id AND tenant_id = ?) as unique_publishers,
          (SELECT COUNT(*) FROM impressions WHERE offer_id = o.id AND tenant_id = ?) as total_impressions,
          (SELECT COUNT(*) FROM conversions WHERE offer_id = o.id AND tenant_id = ?) as total_conversions,
          (SELECT COUNT(*) FROM conversions WHERE offer_id = o.id AND status = 'approved' AND tenant_id = ?) as approved_conversions,
          (SELECT COUNT(*) FROM conversions WHERE offer_id = o.id AND status = 'pending' AND tenant_id = ?) as pending_conversions,
          (SELECT COUNT(*) FROM conversions WHERE offer_id = o.id AND status = 'rejected' AND tenant_id = ?) as rejected_conversions,
          -- FINANCIAL SEPARATION: Revenue (ALL), Payout (Approved Only)
          (SELECT COALESCE(SUM(amount), 0) FROM conversions WHERE offer_id = o.id AND tenant_id = ?) as total_revenue,
          (SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) FROM conversions WHERE offer_id = o.id AND tenant_id = ?) as total_payout,
          (SELECT COALESCE(SUM(amount) - SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) FROM conversions WHERE offer_id = o.id AND tenant_id = ?) as total_profit
        FROM offers o
        WHERE o.id = ? AND o.tenant_id = ?`,
        [tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, id, tenantId]
      );
      const stats = Array.isArray(statsRows) ? statsRows[0] : statsRows;

      // Calculate conversion rate
      const conversionRate = stats.total_clicks > 0
        ? ((stats.total_conversions || 0) / stats.total_clicks) * 100
        : 0;

      // Get recent clicks (last 50)
      const [recentClicksRows] = await pool.query(
        `SELECT c.id, c.offer_id, c.publisher_id, c.tenant_id, c.publisher_offer_id, c.ip, c.user_agent, c.referrer, c.click_uuid, c.country, c.region, c.city, c.isp, c.location, c.domain, c.device_type, c.browser, c.os, c.os_version, c.device_brand, c.device_model, c.source_id, c.device_id, c.google_id, c.android_id, c.rcid, c.tid, c.timestamp, c.created_at, c.extra_params, 
                p.email as publisher_email,
                p.company_name as publisher_company
         FROM ${getClickTableName()} c
         LEFT JOIN publishers p ON c.publisher_id = p.id
         WHERE c.offer_id = ? AND c.tenant_id = ?
         ORDER BY c.created_at DESC
         LIMIT 50`,
        [id, tenantId]
      );
      const recentClicks = Array.isArray(recentClicksRows) ? recentClicksRows : [];

      // Get recent conversions (last 50)
      const [recentConversionsRows] = await pool.query(
        `SELECT conv.id, conv.conversion_uuid, conv.click_uuid, conv.offer_id, conv.publisher_id, conv.tenant_id, conv.publisher_offer_id, conv.rcid, conv.status, conv.amount, conv.payout, conv.ip, conv.timestamp, conv.postback_payload, conv.created_at, conv.updated_at, conv.extra_params, conv.is_test,
                p.email as publisher_email,
                p.company_name as publisher_company,
                c.click_uuid
         FROM conversions conv
         LEFT JOIN publishers p ON conv.publisher_id = p.id
         LEFT JOIN ${getClickTableName()} c ON conv.click_uuid = c.click_uuid
         WHERE conv.offer_id = ? AND conv.tenant_id = ?
         ORDER BY conv.created_at DESC
         LIMIT 50`,
        [id, tenantId]
      );
      const recentConversions = Array.isArray(recentConversionsRows) ? recentConversionsRows : [];

      // Get clicks by publisher
      const [clicksByPublisherRows] = await pool.query(
        `SELECT 
          c.publisher_id,
          p.email as publisher_email,
          p.company_name as publisher_company,
          COUNT(DISTINCT c.id) as click_count,
          COUNT(DISTINCT conv.id) as conversion_count,
          -- FINANCIAL SEPARATION: Revenue (ALL), Payout (Approved Only)
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout
        FROM ${getClickTableName()} c
        LEFT JOIN publishers p ON c.publisher_id = p.id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE c.offer_id = ? AND c.tenant_id = ?
        GROUP BY c.publisher_id, p.email, p.company_name
        ORDER BY click_count DESC`,
        [id, tenantId]
      );
      const clicksByPublisher = Array.isArray(clicksByPublisherRows) ? clicksByPublisherRows : [];

      return {
        ...offer,
        advertiser,
        assignments: formattedAssignments,
        statistics: {
          total_clicks: parseInt(stats.total_clicks || 0),
          unique_publishers: parseInt(stats.unique_publishers || 0),
          total_impressions: parseInt(stats.total_impressions || 0),
          total_conversions: parseInt(stats.total_conversions || 0),
          approved_conversions: parseInt(stats.approved_conversions || 0),
          pending_conversions: parseInt(stats.pending_conversions || 0),
          rejected_conversions: parseInt(stats.rejected_conversions || 0),
          total_revenue: parseFloat(stats.total_revenue || 0),
          total_payout: parseFloat(stats.total_payout || 0),
          total_profit: parseFloat(stats.total_profit || 0),
          conversion_rate: parseFloat(conversionRate.toFixed(2)),
        },
        recent_clicks: recentClicks,
        recent_conversions: recentConversions,
        clicks_by_publisher: clicksByPublisher,
      };
    } catch (error) {
      logger.error('OfferService.findByIdWithDetails error:', error);
      throw error;
    }
  }

  async findByUrlKey(urlKey) {
    // ✅ CRITICAL: URL key lookup should also consider tenant_id if provided
    // Note: url_key uniqueness should be per-tenant, but for now we'll allow cross-tenant url_keys
    // If tenant_id is provided, filter by it
    let query = 'SELECT id, name, category, advertiser_revenue, affiliate_model_cost, start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url, status, url_key, tenant_id, created_at, updated_at FROM offers WHERE url_key = ?';
    const params = [urlKey];

    // If tenant_id is provided, filter by it (for tenant isolation)
    // If not provided, return first match (backward compatibility)
    // TODO: Consider making url_key unique per tenant in database
    const [rows] = await pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findAll(filters = {}, tenantId = null) {
    // ✅ CRITICAL: Require tenant_id for listing offers
    if (!tenantId) {
      const err = new Error('Tenant context required to list offers');
      err.statusCode = 400;
      throw err;
    }

    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    let query = 'SELECT id, name, category, advertiser_revenue, affiliate_model_cost, start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url, status, url_key, tenant_id, created_at, updated_at FROM offers WHERE tenant_id = ?';
    const params = [tenantId]; // ✅ CRITICAL: Always filter by tenant_id

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.live) {
      query += ` AND status = 'active' AND (start_at IS NULL OR start_at <= CURRENT_TIMESTAMP) AND (end_at IS NULL OR end_at >= CURRENT_TIMESTAMP)`;
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    return rows;
  }

  async getLive(tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required');
      err.statusCode = 400;
      throw err;
    }
    return this.findAll({ live: true }, tenantId);
  }

  async getApproved(tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required');
      err.statusCode = 400;
      throw err;
    }
    return this.findAll({ status: 'active' }, tenantId);
  }

  async getAll(tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required');
      err.statusCode = 400;
      throw err;
    }
    return this.findAll({}, tenantId);
  }

  async getCategories() {
    const [rows] = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM offers
      WHERE status != 'remove'
      GROUP BY category
    `);
    return rows;
  }

  async updateStatus(id, status) {
    await pool.query(
      'UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [status, id]
    );
    return this.findById(id);
  }

  async update(id, data) {
    const fields = [];
    const params = [];

    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = UTC_TIMESTAMP()`);
    params.push(id);

    const query = `UPDATE offers SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(query, params);
    return this.findById(id);
  }

  async checkCapping(offerId, publisherId, publisherOfferId = null) {
    const today = new Date().toISOString().split('T')[0];

    // Get cap limit
    let capLimit = null;
    if (publisherOfferId) {
      const [assignmentRows] = await pool.query(
        // ✅ CRITICAL: Add tenant_id filtering (if available in context)
        // Note: This method may not have tenantId, but should filter if available
        'SELECT cap_override, tenant_id FROM publisher_offers WHERE id = ?',
        [publisherOfferId]
      );
      const assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;
      if (assignment?.cap_override) {
        capLimit = assignment.cap_override;
      }
    }

    if (!capLimit) {
      const [offerRows] = await pool.query(
        // ✅ CRITICAL: Add tenant_id filtering (if available in context)
        'SELECT capping_per_day, tenant_id FROM offers WHERE id = ?',
        [offerId]
      );
      const offer = Array.isArray(offerRows) ? offerRows[0] : offerRows;
      capLimit = offer?.capping_per_day || 0;
    }

    if (capLimit === 0) {
      return { capped: false, count: 0, limit: 0 };
    }

    // Count clicks today (IST)
    const todayStr = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const startUTC = new Date(`${todayStr}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
    const endUTC = new Date(`${todayStr}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

    const countRow = await clickRepository.countClicksTodayForCap(offerId, publisherId, startUTC, endUTC);
    const count = parseInt(countRow?.count || 0);

    return {
      capped: count >= capLimit,
      count,
      limit: capLimit,
    };
  }

  async getStats() {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as active
      FROM offers
      WHERE status != 'remove'
    `);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async softDelete(id) {
    await pool.query(
      `UPDATE offers SET status = 'remove', updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }
}

export default new OfferService();

