import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { normalizeMysqlUtcDatetime } from '../utils/mysqlUtcRange.js';
import { getTenantIdFromRequest, addTenantScope } from '../utils/tenantScope.js';
import offerPublicIdService from './offerPublicIdService.js';
import offerParamsService from './offerParamsService.js';
import cacheService from './cacheService.js';

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

const toJsonOrNull = (val) =>
  val === undefined || val === null ? null : JSON.stringify(val);

class OfferService {
  /**
   * Check if offer is valid for operations (clicks, conversions, etc.)
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  checkOfferValidity(offer) {
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

    return {
      valid: true,
      message: 'Offer is valid and active',
      error_type: null
    };
  }

  /**
   * Validate offer dates and status for create/update operations
   * @param {Object} offerData - Offer data to validate
   * @param {Object} existingOffer - Existing offer (for updates)
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferDatesAndStatus(offerData, existingOffer = null) {
    const now = new Date();

    // Check if offer has expired (end_date passed)
    const endDate = offerData.end_date || (existingOffer ? existingOffer.end_date : null);
    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999); // End of day

      if (now > endDateObj) {
        return {
          valid: false,
          message: `Offer has expired. End date (${endDate}) has already passed. Cannot create or update expired offers.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if status is being set to 'live' but offer has expired
    const status = offerData.status || (existingOffer ? existingOffer.status : null);
    if (status === 'live' && endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      if (now > endDateObj) {
        return {
          valid: false,
          message: `Cannot set offer status to 'live': Offer has expired. End date (${endDate}) has already passed.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if trying to set status to 'live' but offer is not live
    if (status && status !== 'live' && existingOffer && existingOffer.status !== 'live') {
      // This is just informational, not blocking
    }

    return {
      valid: true,
      message: 'Offer validation passed',
      error_type: null
    };
  }

  async createOffer(data) {
    const tenantId = data.tenant_id;
    try {
      // ✅ CRITICAL: Validate advertiser exists and belongs to tenant
      if (data.advertiser_id) {
        let advertiserQuery = 'SELECT id, tenant_id FROM advertisers WHERE id = ?';
        const advertiserParams = [data.advertiser_id];

        if (tenantId) {
          advertiserQuery += ' AND tenant_id = ?';
          advertiserParams.push(tenantId);
        }

        const [advRows] = await pool.query(advertiserQuery, advertiserParams);
        if (!advRows || advRows.length === 0) {
          const err = new Error('Advertiser not found or does not belong to this tenant');
          err.statusCode = 400;
          throw err;
        }

        // Verify advertiser belongs to tenant
        const advertiser = advRows[0];
        if (tenantId && advertiser.tenant_id !== tenantId) {
          const err = new Error('Advertiser does not belong to this tenant');
          err.statusCode = 403;
          throw err;
        }
      }

      // Validate offer dates and status
      const validation = this.validateOfferDatesAndStatus(data);
      if (!validation.valid) {
        const err = new Error(validation.message);
        err.statusCode = 400;
        throw err;
      }

      // 🔥 NEW: Generate stable public_offer_id
      const publicOfferId = await offerPublicIdService.generatePublicOfferId(tenantId);
      logger.info(`Generated public_offer_id ${publicOfferId} for new offer in tenant ${tenantId}`);

      const sql = `
        INSERT INTO offers (
          advertiser_id,
          tenant_id,
          public_offer_id,
          name, description, category, status, offer_visibility,
          offer_currency, country,
          advertiser_model, advertiser_amount,
          affiliate_model, affiliate_amount,
          offer_url, preview_url, billing_flow, carrier_name, billing_type, token_type, macros_json,
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
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `;

      const params = [
        data.advertiser_id,
        tenantId,
        publicOfferId, // 🔥 NEW: Add public_offer_id
        data.name,
        data.description || null,
        data.category || null,
        data.status || 'draft',
        data.offer_visibility || null,
        data.offer_currency,
        data.country,
        data.advertiser_model,
        data.advertiser_amount,
        data.affiliate_model,
        data.affiliate_amount,
        data.offer_url,
        data.preview_url || null,
        data.billing_flow || null,
        data.carrier_name || null,
        data.billing_type || null,
        data.token_type || null,
        toJsonOrNull(data.macros_json),
        data.start_date || null,
        data.end_date || null,
        data.start_time || null,
        data.end_time || null,
        data.ip_action || null,
        data.ip_list || null,
        data.country_action || null,
        data.country_list || null,
        toJsonOrNull(data.device_targeting_json),
        data.device_action || null,
        toJsonOrNull(data.os_targeting_json),
        data.os_action || null,
        toJsonOrNull(data.browser_targeting_json),
        data.browser_action || null,
        toJsonOrNull(data.isp_targeting_json),
        toJsonOrNull(data.carrier_targeting_json),
        toJsonOrNull(data.city_targeting_json),
        (data.capping_type && data.capping_type !== 'none') ? data.capping_type : null,
        data.capping_duration || null,
        data.capping_action || 'stop',
        (data.fallback_type && data.fallback_type !== 'none') ? data.fallback_type : null,

        data.daily_cap ?? null,
        data.monthly_cap ?? null,
        data.total_cap ?? null,
        (data.capping_type === 'conversion' && data.capping_amount != null) ? data.capping_amount : (data.conversion_cap ?? null),
        data.capping_conversions_duration || null,

        (data.capping_type === 'budget' && data.capping_amount != null) ? data.capping_amount : (data.budget_cap ?? null),
        data.advertiser_capping_budget_duration || null,
        data.advertiser_capping_budget_amount ?? null,

        data.advertiser_over_capping || null,
        data.affiliate_over_capping || null,
        data.cap_action || null,
        data.fallback_enabled ? 1 : 0,
        data.fallback_url || null,
        data.fallback_offer_id ?? null,
        data.advertiser_postback_url || null,
        data.advertiser_postback_method || null,
        toJsonOrNull(data.advertiser_postback_macros_json),
        data.system_postback_url || null,
        data.system_postback_method || null,
        toJsonOrNull(data.system_postback_macros_json),
      ];

      const [result] = await pool.query(sql, params);
      const insertId = result.insertId ?? result?.[0]?.insertId;

      // 🔥 NEW: Save offer parameters if provided
      if (data.offer_params && Array.isArray(data.offer_params) && data.offer_params.length > 0) {
        await offerParamsService.setOfferParams(insertId, tenantId, data.offer_params);
        logger.info(`Saved ${data.offer_params.length} parameters for offer ${insertId}`);
      }

      // ✅ CRITICAL: Fetch with tenant_id filtering
      return this.getOfferById(insertId, tenantId);
    } catch (error) {
      logger.error('OfferService.createOffer error:', error);
      throw error;
    }
  }

  async updateOffer(id, data, tenantId = null) {
    try {
      if (data.advertiser_id !== undefined && data.advertiser_id !== null) {
        // ✅ CRITICAL: Validate advertiser exists and belongs to tenant
        let advertiserQuery = 'SELECT id, tenant_id FROM advertisers WHERE id = ?';
        const advertiserParams = [data.advertiser_id];

        if (tenantId) {
          advertiserQuery += ' AND tenant_id = ?';
          advertiserParams.push(tenantId);
        }

        const [advRows] = await pool.query(advertiserQuery, advertiserParams);
        if (!advRows || advRows.length === 0) {
          const err = new Error('Advertiser not found or does not belong to this tenant');
          err.statusCode = 400;
          throw err;
        }

        // Verify advertiser belongs to tenant
        const advertiser = advRows[0];
        if (tenantId && advertiser.tenant_id !== tenantId) {
          const err = new Error('Advertiser does not belong to this tenant');
          err.statusCode = 403;
          throw err;
        }
      }

      // Get existing offer for validation (with tenant isolation)
      const existingOffer = await this.getOfferById(id, tenantId);
      if (!existingOffer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
      }
      const internalId = existingOffer.id;

      // ✅ CRITICAL: Verify offer belongs to tenant
      if (tenantId && existingOffer.tenant_id !== tenantId) {
        const err = new Error('Offer does not belong to this tenant');
        err.statusCode = 403;
        throw err;
      }

      // Validate offer dates and status
      const validation = this.validateOfferDatesAndStatus(data, existingOffer);
      if (!validation.valid) {
        const err = new Error(validation.message);
        err.statusCode = 400;
        throw err;
      }

      // Pre-process capping_amount mapping for update
      if (data.capping_amount !== undefined) {
        if (data.capping_type === 'budget' || (data.capping_type === undefined && existingOffer.capping_type === 'budget')) {
          data.budget_cap = data.capping_amount;
        } else if (data.capping_type === 'conversion' || (data.capping_type === undefined && existingOffer.capping_type === 'conversion')) {
          data.conversion_cap = data.capping_amount;
        }
      }

      const fields = [];
      const params = [];

      const updatable = [
        'advertiser_id',
        'name',
        'description',
        'category',
        'status',
        'offer_visibility',
        'offer_currency',
        'country',
        'advertiser_model',
        'advertiser_amount',
        'affiliate_model',
        'affiliate_amount',
        'offer_url',
        'preview_url',
        'billing_flow',
        'carrier_name',
        'billing_type',
        'token_type',
        'macros_json',
        'start_date',
        'end_date',
        'start_time',
        'end_time',
        'ip_action',
        'ip_list',
        'country_action',
        'country_list',
        'device_targeting_json',
        'device_action',
        'os_targeting_json',
        'os_action',
        'browser_targeting_json',
        'browser_action',
        'isp_targeting_json',
        'carrier_targeting_json',
        'city_targeting_json',
        'capping_type',
        'capping_duration',
        'capping_action',
        'fallback_type',
        'daily_cap',
        'monthly_cap',
        'total_cap',
        'conversion_cap',
        'capping_conversions_duration',
        'budget_cap',
        'advertiser_capping_budget_duration',
        'advertiser_capping_budget_amount',
        'advertiser_over_capping',
        'affiliate_over_capping',
        'cap_action',
        'fallback_enabled',
        'fallback_url',
        'fallback_offer_id',
        'advertiser_postback_url',
        'advertiser_postback_method',
        'advertiser_postback_macros_json',
        'system_postback_url',
        'system_postback_method',
        'system_postback_macros_json',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          let value = data[key];
          if (jsonFields.includes(key)) {
            value = toJsonOrNull(value);
          } else if (key === 'fallback_enabled') {
            value = value ? 1 : 0;
          } else if (key === 'capping_type' || key === 'fallback_type') {
            value = (value === 'none') ? null : value;
          }
          fields.push(`${key} = ?`);
          params.push(value ?? null);
        }
      });

      if (!fields.length) {
        return this.getOfferById(internalId);
      }

      fields.push('updated_at = UTC_TIMESTAMP()');
      params.push(internalId);

      // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
      let sql = `UPDATE offers SET ${fields.join(', ')} WHERE id = ?`;
      if (tenantId) {
        sql += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return null;
      }

      await cacheService.invalidateOffer(internalId, tenantId);
      // Layer 2: also drop the public-id → internal-id cache so /click resolves freshly
      await cacheService.invalidateOfferByPublicId(existingOffer.public_offer_id, tenantId);

      return this.getOfferById(internalId, tenantId);
    } catch (error) {
      logger.error('OfferService.updateOffer error:', error);
      throw error;
    }
  }

  /**
   * Resolve public_offer_id to internal offer id only (no display_id fallback).
   * Use when filtering assignments by offer from detail page URL (public id).
   */
  async getInternalOfferIdByPublicId(publicOfferId, tenantId) {
    if (publicOfferId == null || !tenantId) return null;

    // 1. Try Public ID or Display ID
    const [publicRows] = await pool.query(
      `SELECT id FROM (
        SELECT id, public_offer_id, 
        (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
        FROM offers o WHERE tenant_id = ?
      ) t WHERE t.public_offer_id = ? OR t.display_id = ? LIMIT 1`,
      [tenantId, publicOfferId, publicOfferId]
    );

    if (publicRows?.[0]?.id) return publicRows[0].id;

    // 2. Fallback to Internal ID
    const [internalRows] = await pool.query(
      'SELECT id FROM offers WHERE tenant_id = ? AND id = ? LIMIT 1',
      [tenantId, publicOfferId]
    );
    return internalRows?.[0]?.id ?? null;
    
  }

  async getOfferById(id, tenantId = null, internalOnly = false) {
    if (id === undefined || id === null) return null;
    // When looking up by internal id only, coerce to integer so we never match display_id/public_offer_id by mistake
    const internalId = internalOnly ? parseInt(id, 10) : id;
    if (internalOnly && (Number.isNaN(internalId) || internalId < 1)) return null;

    // 1. Try Public ID / Display ID first (unless searching strictly by internal ID)
    if (tenantId && !internalOnly) {
      // Look by public_offer_id OR the sequential display_id
      const publicQuery = `
        SELECT * FROM (
          SELECT 
            o.id, o.advertiser_id, o.tenant_id, o.public_offer_id, o.name, o.description, o.category, o.status, o.offer_visibility, o.offer_currency, o.country, o.advertiser_model, o.advertiser_amount, o.affiliate_model, o.affiliate_amount, o.offer_url, o.preview_url, o.billing_flow, o.carrier_name, o.billing_type, o.token_type, o.macros_json, o.start_date, o.end_date, o.start_time, o.end_time, o.ip_action, o.ip_list, o.country_action, o.country_list, o.device_targeting_json, o.device_action, o.os_targeting_json, o.os_action, o.browser_targeting_json, o.browser_action, o.isp_targeting_json, o.carrier_targeting_json, o.city_targeting_json, o.capping_type, o.capping_duration, o.capping_action, o.fallback_type, o.daily_cap, o.monthly_cap, o.total_cap, o.conversion_cap, o.capping_conversions_duration, o.budget_cap, o.advertiser_capping_budget_duration, o.advertiser_capping_budget_amount, o.advertiser_over_capping, o.affiliate_over_capping, o.cap_action, o.fallback_enabled, o.fallback_url, o.fallback_offer_id, o.advertiser_postback_url, o.advertiser_postback_method, o.advertiser_postback_macros_json, o.system_postback_url, o.system_postback_method, o.system_postback_macros_json, o.created_at, o.updated_at,
            (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
          FROM offers o 
          WHERE o.tenant_id = ?
        ) t 
        WHERE t.public_offer_id = ? OR t.display_id = ?
        LIMIT 1
      `;
      const [publicRows] = await pool.query(publicQuery, [tenantId, id, id]);
      if (publicRows && (Array.isArray(publicRows) ? publicRows[0] : publicRows)) {
        return Array.isArray(publicRows) ? publicRows[0] : publicRows;
      }
    }

    // 2. Internal ID lookup (use internalId when internalOnly to avoid type/coercion issues)
    const lookupId = internalOnly ? internalId : id;
    let query = `
      SELECT 
        o.id, o.advertiser_id, o.tenant_id, o.public_offer_id, o.name, o.description, o.category, o.status, o.offer_visibility, o.offer_currency, o.country, o.advertiser_model, o.advertiser_amount, o.affiliate_model, o.affiliate_amount, o.offer_url, o.preview_url, o.billing_flow, o.carrier_name, o.billing_type, o.token_type, o.macros_json, o.start_date, o.end_date, o.start_time, o.end_time, o.ip_action, o.ip_list, o.country_action, o.country_list, o.device_targeting_json, o.device_action, o.os_targeting_json, o.os_action, o.browser_targeting_json, o.browser_action, o.isp_targeting_json, o.carrier_targeting_json, o.city_targeting_json, o.capping_type, o.capping_duration, o.capping_action, o.fallback_type, o.daily_cap, o.monthly_cap, o.total_cap, o.conversion_cap, o.capping_conversions_duration, o.budget_cap, o.advertiser_capping_budget_duration, o.advertiser_capping_budget_amount, o.advertiser_over_capping, o.affiliate_over_capping, o.cap_action, o.fallback_enabled, o.fallback_url, o.fallback_offer_id, o.advertiser_postback_url, o.advertiser_postback_method, o.advertiser_postback_macros_json, o.system_postback_url, o.system_postback_method, o.system_postback_macros_json, o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
      FROM offers o WHERE o.id = ?
    `;
    const params = [lookupId];
    if (tenantId) {
      query += ' AND o.tenant_id = ?';
      params.push(tenantId);
    }
    query += ' LIMIT 1';

    const [rows] = await pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async getOfferByIdWithDetails(id, timezone = '+05:30', tenantId = null) {
    try {
      // Get offer details (with tenant isolation)
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) {
        return null;
      }

      // Parse JSON fields
      const parseJsonFields = (offer) => {
        jsonFields.forEach((field) => {
          if (offer[field]) {
            try {
              offer[field] = typeof offer[field] === 'string' ? JSON.parse(offer[field]) : offer[field];
            } catch (e) {
              offer[field] = null;
            }
          } else {
            offer[field] = null;
          }
        });
        return offer;
      };
      const parsedOffer = parseJsonFields({ ...offer });

      // Get advertiser details if advertiser_id exists (with tenant isolation)
      let advertiser = null;
      if (parsedOffer.advertiser_id) {
        let advertiserQuery = 'SELECT id, name, email, company_name, country, website, notes, status, tenant_id, created_at, updated_at FROM advertisers WHERE id = ?';
        const advertiserParams = [parsedOffer.advertiser_id];

        if (tenantId) {
          advertiserQuery += ' AND tenant_id = ?';
          advertiserParams.push(tenantId);
        }

        const [advertiserRows] = await pool.query(advertiserQuery, advertiserParams);
        advertiser = Array.isArray(advertiserRows) ? advertiserRows[0] : advertiserRows;

        // Verify advertiser belongs to tenant
        if (tenantId && advertiser && advertiser.tenant_id !== tenantId) {
          advertiser = null;
        }
      }

      return {
        ...parsedOffer,
        advertiser,
      };
    } catch (error) {
      logger.error('OfferService.getOfferByIdWithDetails error:', error);
      throw error;
    }
  }

  async getOfferAssignments(id, tenantId = null) {
    try {
      // 1. Resolve by public_offer_id only (same as detail page URL) so we don't mix in other offers
      const internalId = await this.getInternalOfferIdByPublicId(
        id != null ? Number(id) : null,
        tenantId
      );
      if (!internalId) return [];

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      let query = `SELECT 
                po.id, po.publisher_id AS internal_publisher_id, po.offer_id AS internal_offer_id,
                po.tenant_id, po.payout_override, po.cap_override, po.conversion_approval_percentage,
                po.capping_budget_duration, po.capping_budget_amount, po.capping_conversions_duration,
                po.capping_conversions_amount, po.callback_url, po.destination_url, po.status,
                po.assigned_at, po.updated_at, po.notes, po.public_assignment_id,
                p.public_publisher_id,
                p.email as publisher_email,
                p.first_name as publisher_first_name,
                p.company_name as publisher_company,
                p.country as publisher_country,
                p.status as publisher_status
         FROM publisher_offers po
         JOIN publishers p ON po.publisher_id = p.id
         WHERE po.offer_id = ?`;
      const params = [internalId];

      if (tenantId) {
        query += ' AND po.tenant_id = ?';
        params.push(tenantId);
      }

      query += ' ORDER BY po.assigned_at DESC';

      const [assignmentsRows] = await pool.query(query, params);
      const assignments = Array.isArray(assignmentsRows) ? assignmentsRows : [];

      // Return public_assignment_id as id so getTrackingUrl(id) finds the correct assignment on this offer
      return assignments.map(assignment => ({
        id: assignment.public_assignment_id ?? assignment.id,
        assignment_id: assignment.public_assignment_id ?? assignment.id,
        publisher_id: assignment.public_publisher_id,
        internal_publisher_id: assignment.internal_publisher_id,
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
    } catch (error) {
      logger.error('OfferService.getOfferAssignments error:', error);
      throw error;
    }
  }

  async getOfferStats(id, tenantId = null, filters = {}) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) {
        return {
          total_clicks: 0,
          unique_clicks: 0,
          unique_publishers: 0,
          total_impressions: 0,
          total_conversions: 0,
          approved_conversions: 0,
          pending_conversions: 0,
          rejected_conversions: 0,
          total_revenue: 0,
          total_payout: 0,
          total_profit: 0,
          conversion_rate: 0,
          cap_usage: {
            daily_cap: 0,
            daily_used: 0,
            monthly_cap: 0,
            monthly_used: 0,
            total_cap: 0,
            total_used: 0,
          },
        };
      }
      const internalId = offer.id;

      const dateFrom = filters?.date_from || null;
      const dateTo = filters?.date_to || null;
      const toUtcIstStart = (ymd) => new Date(`${ymd}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const toUtcIstEnd = (ymd) => new Date(`${ymd}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const rs = normalizeMysqlUtcDatetime(filters?.range_start_utc);
      const re = normalizeMysqlUtcDatetime(filters?.range_end_utc);
      let rangeStart;
      let rangeEndExclusive;
      if (rs && re) {
        rangeStart = rs;
        rangeEndExclusive = re;
      } else {
        rangeStart = dateFrom ? toUtcIstStart(dateFrom) : null;
        rangeEndExclusive = dateTo ? toUtcIstEnd(dateTo) : null;
      }

      const buildTimeFilteredWhere = (tableAlias = '') => {
        const prefix = tableAlias ? `${tableAlias}.` : '';
        let clause = `${prefix}offer_id = ?`;
        const params = [internalId];

        if (tenantId) {
          clause += ` AND ${prefix}tenant_id = ?`;
          params.push(tenantId);
        }
        if (rangeStart) {
          clause += ` AND ${prefix}created_at >= ?`;
          params.push(rangeStart);
        }
        if (rangeEndExclusive) {
          clause += ` AND ${prefix}created_at <= ?`;
          params.push(rangeEndExclusive);
        }

        return { clause, params };
      };

      const clicksWhere = buildTimeFilteredWhere();
      const [clickRows] = await pool.query(
        `SELECT
          COUNT(*) AS total_clicks,
          COUNT(DISTINCT click_uuid) AS unique_clicks,
          COUNT(DISTINCT publisher_id) AS unique_publishers
         FROM clicks
         WHERE ${clicksWhere.clause}`,
        clicksWhere.params
      );

      const [impressionsRows] = await pool.query(
        `SELECT COUNT(*) AS total_impressions
         FROM impressions
         WHERE ${clicksWhere.clause}`,
        clicksWhere.params
      );

      const convWhere = buildTimeFilteredWhere();
      const [conversionRows] = await pool.query(
        `SELECT
          COUNT(*) AS total_conversions,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_conversions,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_conversions,
          SUM(CASE WHEN status IN ('rejected', 'rejected_cap') THEN 1 ELSE 0 END) AS rejected_conversions,
          SUM(CASE WHEN status = 'click_expired' THEN 1 ELSE 0 END) AS click_expired_conversions,
          COALESCE(SUM(amount), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved_revenue,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_revenue,
          COALESCE(SUM(payout), 0) AS total_payout,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) AS approved_payout,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN payout ELSE 0 END), 0) AS pending_payout
         FROM conversions
         WHERE ${convWhere.clause}`,
        convWhere.params
      );

      const clickStats = Array.isArray(clickRows) ? clickRows[0] : clickRows;
      const conversionStats = Array.isArray(conversionRows) ? conversionRows[0] : conversionRows;
      const impressionsStats = Array.isArray(impressionsRows) ? impressionsRows[0] : impressionsRows;

      const conversionRate = (clickStats.total_clicks || 0) > 0
        ? ((conversionStats.total_conversions || 0) / clickStats.total_clicks) * 100
        : 0;

      const totalRevenue = parseFloat(conversionStats.total_revenue || 0);
      const approvedPayout = parseFloat(conversionStats.approved_payout || 0);
      const totalProfit = totalRevenue - approvedPayout;

      const now = new Date();
      const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const istToday = istNow.toISOString().split('T')[0];
      const refDate = dateTo || dateFrom || istToday;
      const [year, month] = refDate.split('-').map(Number);
      const monthStartDate = new Date(year, month - 1, 1);
      const monthEndDate = new Date(year, month, 0);
      const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const monthStart = toUtcIstStart(toYmd(monthStartDate));
      const monthEnd = toUtcIstEnd(toYmd(monthEndDate));
      const dayStart = toUtcIstStart(refDate);
      const dayEnd = toUtcIstEnd(refDate);

      const usageTenantClause = tenantId ? ' AND tenant_id = ?' : '';
      const usageTenantParams = tenantId ? [tenantId] : [];

      const [dailyUsageRows] = await pool.query(
        `SELECT COUNT(*) AS used FROM clicks WHERE offer_id = ?${usageTenantClause} AND created_at >= ? AND created_at <= ?`,
        [internalId, ...usageTenantParams, dayStart, dayEnd]
      );
      const [monthlyUsageRows] = await pool.query(
        `SELECT COUNT(*) AS used FROM clicks WHERE offer_id = ?${usageTenantClause} AND created_at >= ? AND created_at <= ?`,
        [internalId, ...usageTenantParams, monthStart, monthEnd]
      );
      const [totalUsageRows] = await pool.query(
        `SELECT COUNT(*) AS used FROM clicks WHERE offer_id = ?${usageTenantClause}`,
        [internalId, ...usageTenantParams]
      );

      return {
        total_clicks: parseInt(clickStats.total_clicks || 0),
        unique_clicks: parseInt(clickStats.unique_clicks || 0),
        unique_publishers: parseInt(clickStats.unique_publishers || 0),
        total_impressions: parseInt(impressionsStats.total_impressions || 0),
        total_conversions: parseInt(conversionStats.total_conversions || 0),
        approved_conversions: parseInt(conversionStats.approved_conversions || 0),
        pending_conversions: parseInt(conversionStats.pending_conversions || 0),
        rejected_conversions: parseInt(conversionStats.rejected_conversions || 0),
        click_expired_conversions: parseInt(conversionStats.click_expired_conversions || 0),
        click_expired: parseInt(conversionStats.click_expired_conversions || 0),
        total_revenue: totalRevenue,
        approved_revenue: parseFloat(conversionStats.approved_revenue || 0),
        pending_revenue: parseFloat(conversionStats.pending_revenue || 0),
        total_payout: parseFloat(conversionStats.total_payout || 0),
        approved_payout: approvedPayout,
        pending_payout: parseFloat(conversionStats.pending_payout || 0),
        total_profit: totalProfit,
        conversion_rate: parseFloat(conversionRate.toFixed(2)),
        cap_usage: {
          daily_cap: parseInt(offer.daily_cap || 0),
          daily_used: parseInt((Array.isArray(dailyUsageRows) ? dailyUsageRows[0]?.used : dailyUsageRows?.used) || 0),
          monthly_cap: parseInt(offer.monthly_cap || 0),
          monthly_used: parseInt((Array.isArray(monthlyUsageRows) ? monthlyUsageRows[0]?.used : monthlyUsageRows?.used) || 0),
          total_cap: parseInt(offer.total_cap || 0),
          total_used: parseInt((Array.isArray(totalUsageRows) ? totalUsageRows[0]?.used : totalUsageRows?.used) || 0),
        },
      };
    } catch (error) {
      logger.error('OfferService.getOfferStats error:', error);
      throw error;
    }
  }

  async getOfferRecentClicks(id, tenantId = null) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      let query = `SELECT 
                c.id, c.offer_id, c.publisher_id, c.tenant_id, c.publisher_offer_id, c.ip, c.user_agent, c.referrer, c.click_uuid, c.country, c.region, c.city, c.isp, c.location, c.domain, c.device_type, c.browser, c.os, c.os_version, c.device_brand, c.device_model, c.source_id, c.device_id, c.google_id, c.android_id, c.rcid, c.tid, c.timestamp, c.created_at, c.extra_params,
                p.email as publisher_email,
                p.company_name as publisher_company
         FROM clicks c
         LEFT JOIN publishers p ON c.publisher_id = p.id
         WHERE c.offer_id = ?`;
      const params = [internalId];

      if (tenantId) {
        query += ' AND c.tenant_id = ?';
        params.push(tenantId);
      }

      query += ' ORDER BY c.created_at DESC LIMIT 50';

      const [recentClicksRows] = await pool.query(query, params);
      return Array.isArray(recentClicksRows) ? recentClicksRows : [];
    } catch (error) {
      logger.error('OfferService.getOfferRecentClicks error:', error);
      throw error;
    }
  }

  async getOfferRecentConversions(id, tenantId = null) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      let query = `SELECT 
                conv.id, conv.conversion_uuid, conv.click_uuid, conv.offer_id, conv.publisher_id, conv.tenant_id, conv.publisher_offer_id, conv.rcid, conv.status, conv.amount, conv.payout, conv.ip, conv.timestamp, conv.postback_payload, conv.created_at, conv.updated_at, conv.extra_params, conv.is_test,
                p.email as publisher_email,
                p.company_name as publisher_company,
                c.click_uuid
         FROM conversions conv
         LEFT JOIN publishers p ON conv.publisher_id = p.id
         LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid
         WHERE conv.offer_id = ?`;
      const params = [internalId];

      if (tenantId) {
        query += ' AND conv.tenant_id = ?';
        params.push(tenantId);
      }

      query += ' ORDER BY conv.created_at DESC LIMIT 50';

      const [recentConversionsRows] = await pool.query(query, params);
      return Array.isArray(recentConversionsRows) ? recentConversionsRows : [];
    } catch (error) {
      logger.error('OfferService.getOfferRecentConversions error:', error);
      throw error;
    }
  }

  async getOfferPublisherStats(id, tenantId = null, filters = {}) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      const dateFrom = filters?.date_from || null;
      const dateTo = filters?.date_to || null;
      const toUtcIstStart = (ymd) => new Date(`${ymd}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const toUtcIstEnd = (ymd) => new Date(`${ymd}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const rs = normalizeMysqlUtcDatetime(filters?.range_start_utc);
      const re = normalizeMysqlUtcDatetime(filters?.range_end_utc);
      let rangeStart;
      let rangeEnd;
      if (rs && re) {
        rangeStart = rs;
        rangeEnd = re;
      } else {
        rangeStart = dateFrom ? toUtcIstStart(dateFrom) : null;
        rangeEnd = dateTo ? toUtcIstEnd(dateTo) : null;
      }

      // Assigned publishers for this offer + offer-scoped performance metrics (dashboard-style)
      let query = `SELECT 
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
          WHERE offer_id = ?`;
      const params = [internalId];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }
      if (rangeStart) {
        query += ' AND created_at >= ?';
        params.push(rangeStart);
      }
      if (rangeEnd) {
        query += ' AND created_at <= ?';
        params.push(rangeEnd);
      }

      query += `
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
          WHERE offer_id = ?`;
      params.push(internalId);

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }
      if (rangeStart) {
        query += ' AND created_at >= ?';
        params.push(rangeStart);
      }
      if (rangeEnd) {
        query += ' AND created_at <= ?';
        params.push(rangeEnd);
      }

      query += `
          GROUP BY publisher_id
        ) conv ON conv.publisher_id = p.id
        WHERE po.offer_id = ?`;
      params.push(internalId);

      if (tenantId) {
        query += ' AND po.tenant_id = ?';
        params.push(tenantId);
      }

      query += `
        GROUP BY p.id, p.public_publisher_id, p.company_name, p.first_name, p.email,
                 c.total_clicks, conv.total_conversions, conv.pending_conversions,
                 conv.approved_conversions, conv.approved_payout, conv.total_revenue
        ORDER BY conversions DESC, clicks DESC, publisher_name ASC`;

      const [publisherStatsRows] = await pool.query(query, params);
      return Array.isArray(publisherStatsRows) ? publisherStatsRows : [];
    } catch (error) {
      logger.error('OfferService.getOfferPublisherStats error:', error);
      throw error;
    }
  }

  async getOfferDailyStats(id, timezone = '+05:30', tenantId = null) {
    try {
      // 1. Resolve internal ID
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) return [];
      const internalId = offer.id;

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';

      // Robust timezone handling - use DATE_ADD/SUB for offsets to avoid CONVERT_TZ dependency on system tables
      let dateExpression;
      const isOffset = /^[+-]\d{2}:\d{2}$/.test(timezone);

      if (isOffset) {
        const sign = timezone.startsWith('+') ? '+' : '-';
        const time = timezone.substring(1);
        // Safe to inject as it's validated by regex
        dateExpression = `DATE_${sign === '+' ? 'ADD' : 'SUB'}(created_at, INTERVAL '${time}' HOUR_MINUTE)`;
      } else {
        // Fallback for named timezones (requires populated timezone tables)
        // Validate strictly to prevent injection
        if (!/^[a-zA-Z0-9_\/\+\-]+$/.test(timezone)) {
          timezone = '+00:00';
        }
        dateExpression = `CONVERT_TZ(created_at, '+00:00', '${timezone}')`;
      }

      // Params only for WHERE clause now
      const params = [internalId];
      if (tenantId) params.push(tenantId);

      const [dailyClicksRows] = await pool.query(
        `SELECT 
           CAST(DATE(${dateExpression}) AS CHAR) as date, 
           COUNT(*) as count
         FROM clicks 
         WHERE offer_id = ?${tenantFilter}
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
         GROUP BY date
         ORDER BY date DESC`,
        params
      );

      const [dailyConversionsRows] = await pool.query(
        `SELECT 
           CAST(DATE(${dateExpression}) AS CHAR) as date, 
           COUNT(*) as count
         FROM conversions 
         WHERE offer_id = ?${tenantFilter}
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
         GROUP BY date
         ORDER BY date DESC`,
        params
      );

      // Merge daily stats
      const dailyStatsMap = new Map();

      (Array.isArray(dailyClicksRows) ? dailyClicksRows : []).forEach(row => {
        const dateStr = row.date;
        if (!dailyStatsMap.has(dateStr)) {
          dailyStatsMap.set(dateStr, { date: dateStr, clicks: 0, conversions: 0 });
        }
        dailyStatsMap.get(dateStr).clicks = row.count;
      });

      (Array.isArray(dailyConversionsRows) ? dailyConversionsRows : []).forEach(row => {
        const dateStr = row.date;
        if (!dailyStatsMap.has(dateStr)) {
          dailyStatsMap.set(dateStr, { date: dateStr, clicks: 0, conversions: 0 });
        }
        dailyStatsMap.get(dateStr).conversions = row.count;
      });
      return Array.from(dailyStatsMap.values())
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      logger.error('OfferService.getOfferDailyStats error:', error);
      throw error;
    }
  }



  async listOffers(filters = {}, tenantId = null) {
    const conditions = [];
    const params = [];

    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    if (tenantId) {
      conditions.push('o.tenant_id = ?');
      params.push(tenantId);
    }

    if (filters.type) {
      conditions.push('o.status = ?');
      params.push(filters.type);
    }

    if (filters.advertiser_id) {
      conditions.push('o.advertiser_id = ?');
      params.push(filters.advertiser_id);
    }

    if (filters.category) {
      conditions.push('o.category = ?');
      params.push(filters.category);
    }

    if (filters.offer_visibility) {
      conditions.push('o.offer_visibility = ?');
      params.push(filters.offer_visibility);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push('(o.name LIKE ? OR o.description LIKE ? OR CAST(o.public_offer_id AS CHAR) LIKE ?)');
      params.push(term, term, term);
    }

    const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const listSql = `
      SELECT o.*,
      a.name as advertiser_name,
      a.public_advertiser_id,
      (SELECT COUNT(*) FROM offers o2 WHERE o2.tenant_id = o.tenant_id AND o2.id <= o.id) as display_id
      FROM offers o
      LEFT JOIN advertisers a ON o.advertiser_id = a.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(listSql, [...params, limit, offset]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM offers o
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

  async searchOffers(filters = {}, tenantId = null) {
    const term = (filters.q || '').trim();
    if (!term || term.length < 3) {
      return [];
    }

    const limit = Number(filters.limit) > 0 ? Math.min(Number(filters.limit), 50) : 10;
    const wildcardTerm = `%${term}%`;

    const conditions = [];
    const params = [];

    if (tenantId) {
      conditions.push('o.tenant_id = ?');
      params.push(tenantId);
    }

    conditions.push('(o.name LIKE ? OR o.description LIKE ? OR CAST(o.public_offer_id AS CHAR) LIKE ?)');
    params.push(wildcardTerm, wildcardTerm, wildcardTerm);

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

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

    const startsWithTerm = `${term}%`;
    const [rows] = await pool.query(sql, [...params, startsWithTerm, limit]);
    return Array.isArray(rows) ? rows : [];
  }

  async deleteOffer(id, tenantId = null) {
    try {
      // 🔥 CHANGED: Archive instead of delete to preserve tracking URLs
      // Offers are NEVER deleted, only archived
      logger.warn(`Archiving offer ${id} instead of deleting (preserves tracking URL integrity)`);

      // First verify offer exists and belongs to tenant
      const offer = await this.getOfferById(id, tenantId);
      if (!offer) {
        return null;
      }
      const internalId = offer.id;

      // Archive the offer
      let query = 'UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?';
      const params = ['archived', internalId];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [result] = await pool.query(query, params);
      if (!result.affectedRows) {
        return null;
      }
      // Layer 2: invalidate both cache entries so a fresh /click sees archived status
      await cacheService.invalidateOffer(internalId, tenantId);
      await cacheService.invalidateOfferByPublicId(offer.public_offer_id, tenantId);
      return { id: internalId, public_id: offer.public_offer_id, deleted: true };
    } catch (error) {
      logger.error('OfferService.deleteOffer error:', error);
      throw error;
    }
  }

  async changeStatus(id, status, tenantId = null) {
    try {
      // Get existing offer for validation (with tenant isolation)
      const existingOffer = await this.getOfferById(id, tenantId);
      if (!existingOffer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
      }
      const internalId = existingOffer.id;

      // ✅ CRITICAL: Verify offer belongs to tenant
      if (tenantId && existingOffer.tenant_id !== tenantId) {
        const err = new Error('Offer does not belong to this tenant');
        err.statusCode = 403;
        throw err;
      }

      // Validate if trying to set status to 'live' but offer has expired
      if (status === 'live') {
        const validation = this.validateOfferDatesAndStatus({ status: 'live' }, existingOffer);
        if (!validation.valid) {
          const err = new Error(validation.message);
          err.statusCode = 400;
          throw err;
        }
      }

      // ✅ CRITICAL: Add tenant_id to WHERE clause for tenant isolation
      let query = 'UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?';
      const params = [status, internalId];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [result] = await pool.query(query, params);
      if (!result.affectedRows) {
        return null;
      }
      return this.getOfferById(internalId, tenantId);
    } catch (error) {
      logger.error('OfferService.changeStatus error:', error);
      throw error;
    }
  }

  async updateAssignment(assignmentId, data) {
    try {
      // First check if assignment exists
      const [existingRows] = await pool.query(
        'SELECT id FROM publisher_offers WHERE id = ?',
        [assignmentId]
      );
      if (!existingRows || existingRows.length === 0) {
        return null;
      }

      const fields = [];
      const params = [];

      const updatable = [
        'payout_override',
        'cap_override',
        'conversion_approval_percentage',
        'capping_budget_duration',
        'capping_budget_amount',
        'capping_conversions_duration',
        'capping_conversions_amount',
        'callback_url',
        'offer_url',
        'status',
        'notes',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(data[key] ?? null);
        }
      });

      if (!fields.length) {
        return this.getAssignmentById(assignmentId);
      }

      params.push(assignmentId);

      const sql = `UPDATE publisher_offers SET ${fields.join(', ')} WHERE id = ?`;
      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return null;
      }

      return this.getAssignmentById(assignmentId);
    } catch (error) {
      logger.error('OfferService.updateAssignment error:', error);
      throw error;
    }
  }

  async getAssignmentById(assignmentId) {
    const [rows] = await pool.query(
      `SELECT po.*,
              p.id as publisher_id,
              p.email as publisher_email,
              p.first_name as publisher_first_name,
              p.company_name as publisher_company,
              p.country as publisher_country,
              p.status as publisher_status,
              o.id as offer_id,
              o.name as offer_name,
              o.status as offer_status
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.id = ?
       LIMIT 1`,
      [assignmentId]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const assignment = rows[0];
    return {
      id: assignment.id,
      publisher_id: assignment.publisher_id,
      publisher_email: assignment.publisher_email,
      publisher_first_name: assignment.publisher_first_name,
      publisher_company: assignment.publisher_company,
      publisher_country: assignment.publisher_country,
      publisher_status: assignment.publisher_status,
      offer_id: assignment.offer_id,
      offer_name: assignment.offer_name,
      offer_status: assignment.offer_status,
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
      offer_url: assignment.offer_url,
      status: assignment.status,
      notes: assignment.notes,
      assigned_at: assignment.assigned_at,
    };
  }
  async geteditOffer(id, tenantId = null) {
    return this.getOfferById(id, tenantId);
  }
}

export default new OfferService();
