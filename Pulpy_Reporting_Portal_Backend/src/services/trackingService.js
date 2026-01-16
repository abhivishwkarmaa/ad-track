import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import { parseDevice } from '../utils/deviceParser.js';
import { getLocationFromIP, getCountryFromHeaders } from '../utils/countryLookup.js';
import { getISP } from '../utils/ispLookup.js';
import { extractDomain, appendClickParams, replaceMacros, generateClickId } from '../utils/urlGenerator.js';
import { generateOfferErrorPage } from '../utils/errorPage.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

import { clickQueue, isOverloaded } from '../workers/clickQueue.js';
import redis from '../config/redis.js';

import cacheService from './cacheService.js';

export class TrackingService {
  async trackClick(query, request) {
    // 1. Fail early if system is overloaded (Backpressure)
    // if (isOverloaded()) ... (Redis handles this better, skip for now or keep)

    try {
      const offerId = parseInt(query.offer_id || query.oid);
      const publisherId = parseInt(query.pub_id || query.a);

      // ============================================
      // 1. REDIS: DEDUPLICATION (First Line of Defense)
      // ============================================
      // ✅ CRITICAL: Get tenant_id FIRST for deduplication fingerprint
      // Tenant identity MUST come from subdomain (Host header) - EXCLUSIVE source of truth
      const tenantId = getTenantIdFromRequest(request);
      
      // 🔒 STRICT: Reject if no tenant from subdomain
      if (!tenantId) {
        logger.error('❌ CRITICAL: No tenant resolved from subdomain - REJECTED', {
          host: request.headers.host,
          url: request.url,
          offer_id: offerId,
          pub_id: publisherId
        });
        // ✅ Use secure error class - error handler will create minimal response
        const { TenantRequiredError } = await import('../utils/secureErrors.js');
        throw new TenantRequiredError('Tenant required');
      }

      // Fingerprint: TenantID + IP + UserAgent + OfferID
      // ✅ CRITICAL: Include tenant_id in fingerprint to prevent cross-tenant collisions
      const userAgent = request.headers['user-agent'] || '';
      const ip = extractIP(request);
      const dedupeFingerprint = `${tenantId}:${ip}:${offerId}:${userAgent.substring(0, 50)}`; // Include tenant_id

      // isDuplicateClick uses SET NX EX 5. Returns TRUE if duplicate (key existed).
      // Increased TTL from 3s to 5s for better duplicate prevention
      const isDuplicate = await cacheService.isDuplicateClick(dedupeFingerprint);

      if (isDuplicate) {
        // It's a duplicate! Try to return cached redirect URL
        const cachedRedirect = await cacheService.getDedupeRedirect(dedupeFingerprint);
        if (cachedRedirect) {
          logger.info('Duplicate Click Suppressed (Redis)', { finger: dedupeFingerprint });
          return { redirect: cachedRedirect, clickId: null, duplicate: true };
        }
        // If no cached redirect (rare race), proceed or error? Proceed to be safe.
      }

      // ============================================
      // 2. STRICT MULTI-TENANT: TENANT RESOLUTION
      // ============================================
      // ✅ NOTE: Tenant already resolved above for deduplication
      // Tenant identity MUST come from subdomain (Host header)
      // Business identifiers (offer_id, pub_id) are NEVER used for tenant resolution
      // Tenant identity must be determined BEFORE any database lookup

      logger.info('[CLICK] Tenant resolved from subdomain', {
        host: request.headers.host,
        tenant_id: tenantId,
        offer_id: offerId,
        pub_id: publisherId
      });

      // ✅ STEP 2: Fetch offer and publisher WITH tenant filtering
      // Business data is validated AFTER tenant resolution
      const [offer, publisher] = await Promise.all([
        cacheService.getOffer(offerId, tenantId), // ✅ Filter by resolved tenant_id
        cacheService.getPublisher(publisherId, tenantId) // ✅ Filter by resolved tenant_id
      ]);

      // ✅ STEP 3: Validate business data exists and belongs to resolved tenant
      if (!offer) {
        logger.error('❌ Offer not found or does not belong to tenant', {
          offer_id: offerId,
          tenant_id: tenantId
        });
        throw new Error(`Offer ${offerId} not found or does not belong to tenant ${tenantId}`);
      }

      if (!publisher) {
        logger.error('❌ Publisher not found or does not belong to tenant', {
          publisher_id: publisherId,
          tenant_id: tenantId
        });
        throw new Error(`Publisher ${publisherId} not found or does not belong to tenant ${tenantId}`);
      }

      if (publisher.status !== 'active') {
        throw new Error('Publisher is not active');
      }

      // ✅ STEP 4: HARD VALIDATION - Ensure business data belongs to resolved tenant
      // This is a security check to prevent any cross-tenant access
      
      // Check if offer has tenant_id set (should always be set in multi-tenant system)
      if (offer.tenant_id === null || offer.tenant_id === undefined) {
        logger.error('❌ CRITICAL: Offer has no tenant_id - data integrity issue', {
          offer_id: offerId,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Data integrity error: Offer ${offerId} has no tenant_id assigned. All offers must belong to a tenant.`);
      }
      
      if (parseInt(offer.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Offer tenant mismatch', {
          offer_id: offerId,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: tenantId,
          host: request.headers.host
        });
        throw new Error(`Security violation: Offer ${offerId} belongs to tenant ${offer.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
      }

      // Check if publisher has tenant_id set
      if (publisher.tenant_id === null || publisher.tenant_id === undefined) {
        logger.error('❌ CRITICAL: Publisher has no tenant_id - data integrity issue', {
          publisher_id: publisherId,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Data integrity error: Publisher ${publisherId} has no tenant_id assigned. All publishers must belong to a tenant.`);
      }
      
      if (parseInt(publisher.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Publisher tenant mismatch', {
          publisher_id: publisherId,
          publisher_tenant_id: publisher.tenant_id,
          resolved_tenant_id: tenantId,
          host: request.headers.host
        });
        throw new Error(`Security violation: Publisher ${publisherId} belongs to tenant ${publisher.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
      }

      // ✅ STEP 5: Verify tenant exists in database (for foreign key integrity)
      try {
        const [tenantRows] = await pool.query('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
        if (tenantRows.length === 0) {
          logger.error(`❌ CRITICAL: Tenant ID ${tenantId} does not exist in tenants table!`);
          throw new Error(`Tenant ${tenantId} does not exist in database`);
        }
        logger.debug(`✅ Tenant ${tenantId} verified: ${tenantRows[0].name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          throw err; // Re-throw tenant not found error
        }
        logger.warn(`⚠️ Could not verify tenant existence: ${err.message}`);
      }

      // ✅ CRITICAL: Get assignment WITH tenant filtering (tenant already resolved)
      let assignment = await cacheService.getAssignment(publisherId, offerId, tenantId);

      // If assignment not found in cache, try direct DB query with tenant_id
      if (!assignment) {
        try {
          const [assignmentRows] = await pool.query(
            'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ? AND tenant_id = ? LIMIT 1',
            [publisherId, offerId, 'active', tenantId]
          );
          assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;
          
          // ✅ Validate assignment belongs to resolved tenant
          if (assignment && assignment.tenant_id && parseInt(assignment.tenant_id) !== parseInt(tenantId)) {
            logger.error('❌ HARD FAILURE: Assignment tenant mismatch', {
              assignment_id: assignment.id,
              assignment_tenant_id: assignment.tenant_id,
              resolved_tenant_id: tenantId
            });
            throw new Error(`Security violation: Assignment belongs to tenant ${assignment.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
          }
        } catch (e) {
          // If query fails, fall through to error
        }
      }

      if (!assignment) {
        logger.error('❌ Assignment not found', {
          publisher_id: publisherId,
          offer_id: offerId,
          tenant_id: tenantId
        });
        throw new Error(`Assignment not found for publisher ${publisherId} and offer ${offerId} in tenant ${tenantId}`);
      }

      // ✅ CRITICAL: HARD VALIDATION - Assignment must belong to resolved tenant
      if (assignment.tenant_id && parseInt(assignment.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Assignment tenant mismatch', {
          assignment_id: assignment.id,
          assignment_tenant_id: assignment.tenant_id,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Security violation: Assignment belongs to tenant ${assignment.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
      }

      // ============================================
      // 3. LOGIC: VALIDATION & CALCULATIONS (Zero DB)
      // ============================================

      // Fallback Logic
      let fallbackRedirect = await this.getFallbackRedirect(offer, request);
      if (!fallbackRedirect) fallbackRedirect = '/error?message=offer_unavailable';

      // Validation
      const offerValidation = offerService.checkOfferValidity(offer);
      if (!offerValidation.valid) {
        return {
          html: generateOfferErrorPage(offerValidation.message, offerValidation.error_type),
          clickId: null
        };
      }

      // ============================================
      // 4. REDIS: CHECK CAPS (Zero DB)
      // ============================================
      // Check Global Offer Caps (Daily/Total Conversions)
      // We READ the current counter from Redis. We do NOT increment here (only on conversion).

      // ✅ CRITICAL: Check caps with tenant_id filtering
      const isDailyCapHit = offer.daily_cap > 0 && !(await cacheService.checkAndIncrementCap(offerId, 'daily', offer.daily_cap, false, tenantId));
      const isTotalCapHit = offer.total_cap > 0 && !(await cacheService.checkAndIncrementCap(offerId, 'total', offer.total_cap, false, tenantId));

      if (isDailyCapHit || isTotalCapHit) {
        return await this.applyCapAction(offer, fallbackRedirect);
      }

      // Assignment Caps? (omitted for brevity, can implement similar pattern in CacheService)

      // ============================================
      // 5. GENERATE & PERSIST
      // ============================================

      const clickUuid = generateClickId(36);

      // Parse params
      const deviceInfo = parseDevice(userAgent);
      const referrer = request.headers.referer || '';
      const domain = extractDomain(referrer);

      // Geo & ISP Lookup
      const location = getLocationFromIP(ip); // { country, region, city }
      // Fallback country from headers if GeoIP missed (e.g. Cloudflare)
      const country_final = location.country || getCountryFromHeaders(request) || '';

      // Async ISP lookup (with timeout protection)
      let isp = null;
      try {
        isp = await getISP(ip);
      } catch (e) { /* ignore */ }

      const redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid);

      // ✅ CRITICAL: Use resolved tenant_id (from subdomain) - NO FALLBACKS
      // Tenant identity was already resolved from subdomain and validated
      // Business identifiers (offer_id, pub_id) are NEVER used for tenant resolution
      const finalTenantId = tenantId;
      
      if (!finalTenantId) {
        logger.error('❌ CRITICAL: No tenant_id available - this should never happen after validation');
        throw new Error('Tenant identity required. This error indicates a system failure.');
      }

      // ✅ CRITICAL: Log final tenant_id for debugging
      logger.info('[CLICK] Final tenant_id', {
        click_uuid: clickUuid,
        offer_id: offerId,
        tenant_id: finalTenantId,
        from_request: !!tenantId,
        from_offer: !!offer.tenant_id,
        from_publisher: !!publisher.tenant_id
      });

      // Persist to Redis (include tenant_id for database insertion later)
      // ✅ CRITICAL: Store all values as strings (Redis hash values are strings)
      const clickData = {
        click_uuid: clickUuid,
        offer_id: String(offerId),
        publisher_id: String(publisherId),
        publisher_offer_id: assignment.id ? String(assignment.id) : '',
        tenant_id: finalTenantId ? String(finalTenantId) : '', // ✅ CRITICAL: Store as string (should never be empty in strict multi-tenant)
        ip: ip || '',
        user_agent: userAgent || '',
        referrer: referrer || '',
        country: country_final || '',
        region: location.region || '',
        city: location.city || '',
        location: JSON.stringify({
          city: location.city,
          region: location.region,
          country: country_final
        }) || '', // Store as JSON string
        isp: isp || '',
        domain: domain || '',
        device_type: deviceInfo.deviceType || '',
        browser: deviceInfo.browser || '',
        os: deviceInfo.os || '',
        os_version: deviceInfo.osVersion || '', // Corrected to snake_case for DB consistency
        device_brand: deviceInfo.deviceBrand || '',
        device_model: deviceInfo.deviceModel || '',
        tid: query.tid || query.click_id || '', // Affiliate ID
        rcid: query.rcid || '',
        timestamp: new Date().toISOString() // UTC ENFORCEMENT: Store UTC timestamp only
      };

      // DEBUG: Dump clickData to file to verify content
      const fsDebug = await import('fs');
      fsDebug.appendFileSync('debug_click_data.log', JSON.stringify({
        time: new Date().toISOString(),
        uuid: clickUuid,
        clickData: clickData
      }, null, 2) + '\n---\n');

      try {
        // Use pipeline for atomicity - ensure hash is written before stream entry
        const pipeline = redis.pipeline();
        pipeline.hset(`click:${clickUuid}`, clickData);
        pipeline.expire(`click:${clickUuid}`, 86400); // 24 hours TTL
        
        // ✅ CRITICAL: tenant_id should always be set in strict multi-tenant system
        const tenantIdStr = finalTenantId ? String(finalTenantId) : '';
        if (!tenantIdStr) {
          logger.error('❌ CRITICAL: Attempting to add click to stream without tenant_id!', {
            click_uuid: clickUuid,
            offer_id: offerId,
            publisher_id: publisherId
          });
          throw new Error('Cannot add click to stream without tenant_id. This indicates a system failure.');
        }
        pipeline.xadd('stream:clicks', '*', 'id', clickUuid, 'tenant_id', tenantIdStr);
        
        // ✅ Increased TTL from 3s to 5s to match dedupe key TTL
        pipeline.setex(`dedupe:redirect:${dedupeFingerprint}`, 5, redirectUrl);
        
        const results = await pipeline.exec();
        
        // Verify all operations succeeded (pipeline results are [error, result] tuples)
        let hashWriteSuccess = false;
        let streamWriteSuccess = false;
        
        for (let i = 0; i < results.length; i++) {
          const [err, result] = results[i];
          if (err) {
            const operation = i === 0 ? 'hash write' : i === 1 ? 'hash expire' : i === 2 ? 'stream add' : 'dedupe set';
            logger.error(`❌ Redis ${operation} failed:`, { error: err.message, result });
            throw new Error(`Redis ${operation} failed: ${err.message}`);
          } else {
            if (i === 0) hashWriteSuccess = true; // Hash write
            if (i === 2) streamWriteSuccess = true; // Stream add
          }
        }

        logger.info('[CLICK] Persisted to Redis successfully', { 
          uuid: clickUuid,
          operations: results.length,
          tenant_id: finalTenantId,
          offer_id: offerId,
          publisher_id: publisherId,
          stream_entry_id: results[2]?.[1] || 'unknown',
          hash_key: `click:${clickUuid}`,
          hash_write_success: hashWriteSuccess,
          stream_write_success: streamWriteSuccess
        });
        
        // Verify the hash was actually written (with retry in case of timing issue)
        let hashCheck = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          hashCheck = await redis.hget(`click:${clickUuid}`, 'offer_id');
          if (hashCheck) break;
          if (attempt < 2) await new Promise(r => setTimeout(r, 100)); // Wait 100ms before retry
        }
        
        if (hashCheck) {
          logger.info(`✅ Verified click hash exists: click:${clickUuid} (offer_id: ${hashCheck})`);
        } else {
          logger.error(`❌ CRITICAL: Click hash was NOT written or was deleted! click:${clickUuid}`);
          logger.error('   This will cause the worker to fail when processing this click.');
          // Try to write it again as a fallback
          try {
            await redis.hset(`click:${clickUuid}`, clickData);
            await redis.expire(`click:${clickUuid}`, 86400);
            logger.info(`✅ Fallback: Re-wrote click hash: click:${clickUuid}`);
          } catch (fallbackErr) {
            logger.error(`❌ Fallback hash write also failed: ${fallbackErr.message}`);
          }
        }
      } catch (err) {
        logger.error('[CLICK] Redis Write Failed:', err);
        throw err;
      }

      // DEBUG LOG TO FILE
      const fs = await import('fs');
      fs.appendFileSync('debug_clicks.log', JSON.stringify({
        time: new Date().toISOString(),
        uuid: clickUuid,
        tenant: finalTenantId
      }, null, 2) + '\n---\n');

      // ✅ CRITICAL: Log that click was stored in Redis
      logger.info('[CLICK] Stored in Redis', {
        click_uuid: clickUuid,
        offer_id: offerId,
        publisher_id: publisherId,
        tenant_id: finalTenantId,
        stream: 'stream:clicks',
        hash: `click:${clickUuid}`
      });

      return {
        redirect: redirectUrl,
        clickId: clickUuid
      };

    } catch (error) {
      logger.error('TrackingService.trackClick error:', error);
      throw error;
    }
  }

  _buildRedirectUrl(assignment, offer, query, clickUuid) {
    let url = assignment.destination_url || offer.offer_url;
    if (offer.status === 'deactivate') url = offer.fallback_url || url;

    url = replaceMacros(url, {
      click_id: clickUuid,
      rcid: query.rcid || '',
      tid: query.tid || '',
    });

    return appendClickParams(url, {
      click_id: clickUuid,
      tid: query.tid || null,
      rcid: query.rcid || null
    });
  }



  async isTotalCapHit(offer, tenantId) {
    if (!offer.total_cap || offer.total_cap <= 0) return false;

    // Handle tenant_id gracefully (may be null or column may not exist)
    let query = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?';
    const params = [offer.id];

    if (tenantId) {
      try {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      } catch (e) {
        // tenant_id column doesn't exist, use query without it
        if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }

    const [rows] = await pool.query(query, params);
    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
    return count >= offer.total_cap;
  }

  async isCappingTypeHit(offer, tenantId) {
    const capType = offer.capping_type || 'none';
    if (capType === 'none') return false;

    // Use IST (UTC+05:30) for timezone conversions
    const tz = '+05:30';

    let sql = '';
    const params = [offer.id];

    // Add tenant_id to query if available
    if (tenantId) {
      params.push(tenantId);
    }

    if (capType === 'daily' && offer.daily_cap != null && offer.daily_cap > 0) {
      // Build query with or without tenant_id
      if (tenantId) {
        sql = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND tenant_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      } else {
        sql = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      }
      const [rows] = await pool.query(sql, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      return count >= offer.daily_cap;
    }

    if (capType === 'monthly' && offer.monthly_cap != null && offer.monthly_cap > 0) {
      if (tenantId) {
        sql = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND tenant_id = ? AND YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      } else {
        sql = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      }
      const [rows] = await pool.query(sql, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      return count >= offer.monthly_cap;
    }

    if (capType === 'weekly' && offer.total_cap != null && offer.total_cap > 0) {
      if (tenantId) {
        sql = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND tenant_id = ? AND YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
      } else {
        sql = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
      }
      const [rows] = await pool.query(sql, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      return count >= offer.total_cap;
    }

    return false;
  }

  async applyCapAction(offer, fallbackRedirect) {
    const action = offer.cap_action || 'fallback';
    if (action === 'pause') {
      await pool.query('UPDATE offers SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', ['paused', offer.id]);
    }
    return {
      redirect: fallbackRedirect,
      clickId: null,
    };
  }

  async getFallbackRedirect(offer, request) {
    // Never return offer.offer_url as fallback - only return actual fallback URLs
    if (offer.fallback_url) return offer.fallback_url;
    if (offer.fallback_offer_id) {
      // 🔒 STRICT: Tenant must come from subdomain - NO FALLBACKS
      const tenantId = request ? getTenantIdFromRequest(request) : null;
      
      if (!tenantId) {
        logger.warn('Cannot get fallback offer: no tenant context from subdomain');
        return null;
      }
      
      // ✅ Validate fallback offer belongs to resolved tenant
      // (This will be validated when fetching the fallback offer)

      if (tenantId) {
        try {
          const [rows] = await pool.query(
            'SELECT offer_url FROM offers WHERE id = ? AND tenant_id = ? LIMIT 1',
            [offer.fallback_offer_id, tenantId]
          );
          const fb = Array.isArray(rows) ? rows[0] : rows;
          if (fb?.offer_url) return fb.offer_url;
        } catch (e) {
          // If tenant_id column doesn't exist, fall through to non-tenant query
          if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
      }

      // Fallback to non-tenant-scoped query (works before migration or if tenant_id not set)
      const [rows] = await pool.query(
        'SELECT offer_url FROM offers WHERE id = ? LIMIT 1',
        [offer.fallback_offer_id]
      );
      const fb = Array.isArray(rows) ? rows[0] : rows;
      if (fb?.offer_url) return fb.offer_url;
    }
    // If no fallback is available, return null or a default error page
    // Never use the original offer URL as fallback
    return null;
  }

  async trackImpression(query, request) {
    try {
      const offerId = parseInt(query.offer_id);
      const publisherId = parseInt(query.pub_id);

      // ============================================
      // 🔒 STRICT MULTI-TENANT: TENANT RESOLUTION
      // ============================================
      // Tenant identity MUST come from subdomain (Host header) - EXCLUSIVE source of truth
      // Business identifiers (offer_id, pub_id) are NEVER used for tenant resolution
      // Tenant identity must be determined BEFORE any database lookup

      // ✅ STEP 1: Get tenant from subdomain (Host header) - EXCLUSIVE source of truth
      const tenantId = getTenantIdFromRequest(request);
      
      // 🔒 STRICT: Reject if no tenant from subdomain
      if (!tenantId) {
        logger.error('❌ CRITICAL: No tenant resolved from subdomain for impression - REJECTED', {
          host: request.headers.host,
          url: request.url,
          offer_id: offerId,
          pub_id: publisherId
        });
        return { 
          success: false, 
          error: 'Tenant identity required. Access via tenant subdomain (e.g., tenant1.localhost:5001/imp for local testing). Business identifiers cannot be used for tenant resolution.' 
        };
      }

      logger.info('[IMP] Tenant resolved from subdomain', {
        host: request.headers.host,
        tenant_id: tenantId,
        offer_id: offerId,
        pub_id: publisherId
      });

      // ✅ STEP 2: Fetch offer and publisher WITH tenant filtering
      // Business data is validated AFTER tenant resolution
      const [offer, publisher] = await Promise.all([
        offerService.getOfferById(offerId, tenantId), // ✅ Filter by resolved tenant_id
        publisherService.findById(publisherId, tenantId) // ✅ Filter by resolved tenant_id
      ]);

      // ✅ STEP 3: Validate business data exists and belongs to resolved tenant
      if (!offer) {
        logger.error('❌ Offer not found or does not belong to tenant', {
          offer_id: offerId,
          tenant_id: tenantId
        });
        return { success: false, error: `Offer ${offerId} not found or does not belong to tenant ${tenantId}` };
      }

      if (!publisher) {
        logger.error('❌ Publisher not found or does not belong to tenant', {
          publisher_id: publisherId,
          tenant_id: tenantId
        });
        return { success: false, error: `Publisher ${publisherId} not found or does not belong to tenant ${tenantId}` };
      }

      // ✅ STEP 4: Verify ownership (defense in depth)
      if (offer.tenant_id && offer.tenant_id !== tenantId) {
        logger.error('❌ Tenant mismatch: Offer does not belong to tenant', {
          offer_id: offerId,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: tenantId
        });
        return { success: false, error: 'Offer does not belong to this tenant' };
      }
      if (publisher.tenant_id && publisher.tenant_id !== tenantId) {
        logger.error('❌ Tenant mismatch: Publisher does not belong to tenant', {
          publisher_id: publisherId,
          publisher_tenant_id: publisher.tenant_id,
          resolved_tenant_id: tenantId
        });
        return { success: false, error: 'Publisher does not belong to this tenant' };
      }

      if (publisher.status !== 'active') {
        return { success: false, error: 'Publisher is not active' };
      }

      // ✅ CRITICAL: Check assignment exists (with tenant_id if available)
      let assignmentQuery = 'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?';
      const assignmentParams = [publisherId, offerId, 'active'];

      if (tenantId) {
        assignmentQuery += ' AND tenant_id = ?';
        assignmentParams.push(tenantId);
      }

      const [assignmentRows] = await pool.query(assignmentQuery, assignmentParams);
      const assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;

      if (!assignment) {
        return { success: false, error: 'Assignment not found or inactive' };
      }

      // ✅ Verify assignment belongs to tenant if tenant_id is set
      if (tenantId && assignment.tenant_id && assignment.tenant_id !== tenantId) {
        return { success: false, error: 'Assignment does not belong to this tenant' };
      }

      // Extract info
      const ip = extractIP(request);
      const userAgent = request.headers['user-agent'] || '';
      const referrer = request.headers.referer || request.headers.referrer || null;

      // 🔒 STRICT: Tenant must come from subdomain - NO FALLBACKS
      // Tenant identity was already resolved from subdomain
      const finalTenantId = tenantId;
      
      if (!finalTenantId) {
        logger.error('❌ No tenant resolved from subdomain for impression');
        return { success: false, error: 'Tenant identity required from subdomain. Cannot track impression without tenant context.' };
      }
      
      // ✅ Validate offer belongs to resolved tenant
      if (offer && offer.tenant_id && parseInt(offer.tenant_id) !== parseInt(finalTenantId)) {
        logger.error('❌ HARD FAILURE: Offer tenant mismatch for impression', {
          offer_id: offer.id,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: finalTenantId
        });
        return { success: false, error: `Security violation: Offer ${offer.id} belongs to tenant ${offer.tenant_id}, but request is for tenant ${finalTenantId}. Access denied.` };
      }

      // ✅ Verify ownership if tenant_id is set on offer/publisher
      if (offer.tenant_id && offer.tenant_id !== finalTenantId) {
        return { success: false, error: 'Offer does not belong to this tenant' };
      }
      if (publisher.tenant_id && publisher.tenant_id !== finalTenantId) {
        return { success: false, error: 'Publisher does not belong to this tenant' };
      }

      // ✅ CRITICAL: Insert impression with resolved tenant_id
      const impUuid = uuidv4();
      await pool.query(
        `INSERT INTO impressions (
          imp_uuid, offer_id, publisher_id, tenant_id, ip, user_agent, referrer, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [impUuid, offerId, publisherId, finalTenantId, ip, userAgent, referrer]
      );

      // Update daily stats
      await this.updateDailyStats(offerId, publisherId, 'impression', finalTenantId);

      return { success: true, impUuid };
    } catch (error) {
      logger.error('TrackingService.trackImpression error:', error);
      return { success: false, error: error.message };
    }
  }

  async isAssignmentBudgetCapHit(assignment, offerId, publisherId) {
    if (!assignment.capping_budget_duration || !assignment.capping_budget_amount) {
      return false;
    }

    const duration = assignment.capping_budget_duration;
    const capAmount = parseFloat(assignment.capping_budget_amount);
    if (capAmount <= 0) return false;

    // Use IST (UTC+05:30) for timezone conversions
    const tz = '+05:30';

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND HOUR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = HOUR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'day') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'week') {
      dateCondition = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
    } else if (duration === 'month') {
      dateCondition = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else {
      return false;
    }

    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`,
      [offerId, publisherId]
    );

    const totalRevenue = parseFloat((Array.isArray(rows) ? rows[0] : rows).total_revenue || 0);
    return totalRevenue >= capAmount;
  }

  async isAssignmentConversionCapHit(assignment, offerId, publisherId) {
    if (!assignment.capping_conversions_duration || !assignment.capping_conversions_amount) {
      return false;
    }

    const duration = assignment.capping_conversions_duration;
    const capCount = parseInt(assignment.capping_conversions_amount);
    if (capCount <= 0) return false;

    // Use IST (UTC+05:30) for timezone conversions
    const tz = '+05:30';

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND HOUR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = HOUR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'day') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'week') {
      dateCondition = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
    } else if (duration === 'month') {
      dateCondition = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else {
      return false;
    }

    const [rows] = await pool.query(
      `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`,
      [offerId, publisherId]
    );

    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).conversion_count || 0);
    return count >= capCount;
  }

  async updateDailyStats(offerId, publisherId, type, tenantId = null) {
    try {
      // UTC ENFORCEMENT: Store UTC date in DB. Business logic converts to IST only at query time.
      // Use CONVERT_TZ(created_at, '+00:00', '+05:30') in queries for IST display
      const today = new Date().toISOString().split('T')[0];

      // Upsert daily stats - UTC ENFORCEMENT: Date stored as UTC, uniqueness calculated using IST conversion
      if (type === 'click') {
        const [latestClickRows] = await pool.query(
          `SELECT ip FROM clicks
           WHERE offer_id = ? AND publisher_id = ?
           ORDER BY created_at DESC LIMIT 1`,
          [offerId, publisherId]
        );

        const latestClick = Array.isArray(latestClickRows) ? latestClickRows[0] : latestClickRows;
        const clickIp = latestClick?.ip || null;

        let isUnique = true;
        if (clickIp) {
          const [countRows] = await pool.query(
            `SELECT COUNT(*) as cnt FROM clicks
                 WHERE offer_id = ?
                   AND publisher_id = ?
                   AND ip = ?
                   AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = ?`,
            [offerId, publisherId, clickIp, today]
          );
          const cnt = (Array.isArray(countRows) ? countRows[0] : countRows).cnt;
          isUnique = (cnt === 1);
        }

        await pool.query(
          `INSERT INTO daily_offer_stats (offer_id, tenant_id, day, clicks, unique_clicks)
           VALUES (?, ?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             clicks = daily_offer_stats.clicks + 1,
             unique_clicks = daily_offer_stats.unique_clicks + (CASE WHEN ? = 1 THEN 1 ELSE 0 END),
             updated_at = UTC_TIMESTAMP()`,
          [offerId, tenantId, today, isUnique ? 1 : 0, isUnique ? 1 : 0]
        );
      } else if (type === 'impression') {
        await pool.query(
          `INSERT INTO daily_offer_stats (offer_id, tenant_id, day, impressions)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             impressions = daily_offer_stats.impressions + 1,
             updated_at = UTC_TIMESTAMP()`,
          [offerId, tenantId, today]
        );
      }
    } catch (error) {
      logger.error('TrackingService.updateDailyStats error:', error);
    }
  }
}

export default new TrackingService();

