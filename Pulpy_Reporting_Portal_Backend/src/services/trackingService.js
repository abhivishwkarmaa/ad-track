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
import postbackService from './postbackService.js';
import dailyAggregateService from './dailyAggregateService.js';

const getIstDateString = () => {
  const now = new Date();
  const istTime = new Date(now.getTime() + (330 * 60 * 1000));
  return istTime.toISOString().split('T')[0];
};

const normalizeEventName = (value) =>
  String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_');

const parseMetadata = (metadata) => {
  if (metadata === null || metadata === undefined || metadata === '') return null;
  if (typeof metadata === 'object') return metadata;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return { raw: metadata };
    }
  }
  return null;
};
let dailyEventStatsColumnsMissingLogged = false;
let eventAnalyticsTableMissingLogged = false;

export class TrackingService {
  async trackClick(query, request) {
    // 1. Fail early if system is overloaded (Backpressure)
    // if (isOverloaded()) ... (Redis handles this better, skip for now or keep)

    try {
      // ============================================
      // STEP 1: PARSE — UI se public ids aate hain (offer_id, pub_id)
      // ============================================
      const publicOfferId = parseInt(query.offer_id || query.oid);
      const publicPublisherId = parseInt(query.pub_id || query.a);

      // ============================================
      // 1. TENANT RESOLUTION (NO DEDUPLICATION)
      // ============================================
      // ✅ CRITICAL: Get tenant_id from subdomain (Host header) - EXCLUSIVE source of truth
      // ❌ REMOVED: Redis-based deduplication that blocks clicks
      // ✅ REQUIREMENT: Redis must not decide whether a click is valid or should be dropped
      // ✅ REQUIREMENT: Never check Redis for existing clicks
      // ✅ REQUIREMENT: Every valid incoming click must be counted
      const tenantId = getTenantIdFromRequest(request);

      // 🔒 STRICT: Reject if no tenant from subdomain
      if (!tenantId) {
        logger.error('❌ CRITICAL: No tenant resolved from subdomain - REJECTED', {
          host: request.headers.host,
          url: request.url,
          public_offer_id: publicOfferId,
          public_publisher_id: publicPublisherId
        });
        // ✅ Use secure error class - error handler will create minimal response
        const { TenantRequiredError } = await import('../utils/secureErrors.js');
        throw new TenantRequiredError('Tenant required');
      }



      // ✅ OPTIONAL: Create fingerprint ONLY for redirect URL caching (not for blocking)
      // This is a performance optimization - does NOT block clicks
      const userAgent = request.headers['user-agent'] || '';
      const ip = extractIP(request);
      const redirectCacheKey = `redirect:${tenantId}:${ip}:${publicOfferId}:${userAgent.substring(0, 50)}`;

      // ============================================
      // 2. STRICT MULTI-TENANT: TENANT RESOLUTION
      // ============================================

      // ✅ QUICK DEDUPLICATION CHECK
      // If we saw this exact same User+IP+Offer+Tenant in the last 5 seconds, 
      // return the cached redirect immediately without recording a new click.
      const cachedRedirect = await redis.get(redirectCacheKey);
      if (cachedRedirect) {
        logger.info('[CLICK] Duplicate click detected - returning cached redirect', {
          tenant_id: tenantId,
          public_offer_id: publicOfferId,
          ip,
          cache_key: redirectCacheKey
        });
        return {
          redirect: cachedRedirect,
          clickId: 'duplicate'
        };
      }
      // ✅ NOTE: Tenant already resolved above
      // Tenant identity MUST come from subdomain (Host header)
      // Business identifiers (offer_id, pub_id) are NEVER used for tenant resolution
      // Tenant identity must be determined BEFORE any database lookup

      logger.info('[CLICK] Tenant resolved from subdomain', {
        host: request.headers.host,
        tenant_id: tenantId,
        public_offer_id: publicOfferId,
        public_publisher_id: publicPublisherId
      });

      // ============================================
      // STEP 2: RESOLVE — Public ID → Internal ID (sirf iske baad DB me internal id use karo)
      // ============================================
      const internalOfferId = await offerService.getInternalOfferIdByPublicId(publicOfferId, tenantId);
      const offerPublicIdService = (await import('./offerPublicIdService.js')).default;
      const publisher = await offerPublicIdService.getPublisherByPublicId(publicPublisherId, tenantId);
      const internalPublisherId = publisher ? publisher.id : null;

      const offer = internalOfferId
        ? await offerService.getOfferById(internalOfferId, tenantId, true)
        : null;

      // ============================================
      // STEP 3: Validate — Offer & publisher mile, tenant match kare
      // ============================================
      if (!offer) {
        logger.error('❌ Offer not found or does not belong to tenant', {
          public_offer_id: publicOfferId,
          tenant_id: tenantId
        });
        return {
          html: generateOfferErrorPage(`Offer with public ID ${publicOfferId} not found or does not belong to tenant`, 'offer_not_found'),
          clickId: null
        };
      }

      if (!publisher) {
        logger.error('❌ Publisher not found or does not belong to tenant', {
          public_publisher_id: publicPublisherId,
          tenant_id: tenantId
        });
        return {
          html: generateOfferErrorPage(`Publisher ${publicPublisherId} not found or does not belong to tenant`, 'offer_not_found'),
          clickId: null
        };
      }

      logger.info('[CLICK] Resolved entities', {
        offer_id: offer?.id,
        offer_public_id: offer?.public_offer_id,
        publisher_id: publisher?.id,
        publisher_public_id: publisher?.public_publisher_id,
        tenant_id: tenantId
      });

      if (publisher.status !== 'active') {
        return {
          html: generateOfferErrorPage('Publisher is not active', 'offer_not_live'),
          clickId: null
        };
      }

      // ✅ STEP 4: HARD VALIDATION - Ensure business data belongs to resolved tenant
      // This is a security check to prevent any cross-tenant access

      // Check if offer has tenant_id set (should always be set in multi-tenant system)
      if (offer.tenant_id === null || offer.tenant_id === undefined) {
        logger.error('❌ CRITICAL: Offer has no tenant_id - data integrity issue', {
          offer_id: offer.id,
          public_offer_id: publicOfferId,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Data integrity error: Offer ${offer.id} has no tenant_id assigned. All offers must belong to a tenant.`);
      }

      if (parseInt(offer.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Offer tenant mismatch', {
          offer_id: offer.id,
          public_offer_id: publicOfferId,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: tenantId,
          host: request.headers.host
        });
        throw new Error(`Security violation: Offer ${offer.id} belongs to tenant ${offer.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
      }

      if (publisher.tenant_id === null || publisher.tenant_id === undefined) {
        logger.error('❌ CRITICAL: Publisher has no tenant_id - data integrity issue', {
          publisher_id: publisher.id,
          public_publisher_id: publicPublisherId,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Data integrity error: Publisher ${publisher.id} has no tenant_id assigned. All publishers must belong to a tenant.`);
      }

      if (parseInt(publisher.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Publisher tenant mismatch', {
          internal_publisher_id: publisher.id,
          public_publisher_id: publicPublisherId,
          publisher_tenant_id: publisher.tenant_id,
          resolved_tenant_id: tenantId,
          host: request.headers.host
        });
        throw new Error(`Security violation: Publisher ${publisher.id} belongs to tenant ${publisher.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
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

      // ============================================
      // STEP 4: Assignment nikalna — pehle internal ids, na mile to public publisher_id (legacy fallback)
      // ============================================
      let assignment = await cacheService.getAssignment(internalPublisherId, offer.id, tenantId);
      if (!assignment) {
        let [assignmentRows] = await pool.query(
          'SELECT id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND tenant_id = ? LIMIT 1',
          [internalPublisherId, offer.id, tenantId]
        );
        assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;

        // Fallback: kuch purani rows me publisher_id column me public id store ho sakta hai
        if (!assignment && publicPublisherId !== internalPublisherId) {
          const [fallbackRows] = await pool.query(
            'SELECT id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND tenant_id = ? LIMIT 1',
            [publicPublisherId, offer.id, tenantId]
          );
          assignment = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows;
          if (assignment) {
            logger.warn('⚠️ Assignment found by public publisher_id (legacy row). Prefer storing internal publisher_id in publisher_offers.', {
              public_publisher_id: publicPublisherId,
              internal_offer_id: offer.id,
              tenant_id: tenantId
            });
          }
        }

        logger.info('[CLICK] Assignment resolved', {
          assignment_id: assignment?.id,
          status: assignment?.status
        });

        if (assignment && assignment.tenant_id && parseInt(assignment.tenant_id) !== parseInt(tenantId)) {
          logger.error('❌ HARD FAILURE: Assignment tenant mismatch', {
            assignment_id: assignment.id,
            assignment_tenant_id: assignment.tenant_id,
            resolved_tenant_id: tenantId
          });
          throw new Error(`Security violation: Assignment belongs to tenant ${assignment.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
        }

        if (assignment && assignment.status !== 'active') {
          logger.error('❌ Assignment exists but is not active', {
            assignment_id: assignment.id,
            status: assignment.status,
            internal_publisher_id: internalPublisherId,
            internal_offer_id: offer.id,
            public_offer_id: publicOfferId,
            public_publisher_id: publicPublisherId,
            tenant_id: tenantId
          });
          throw new Error(`Assignment exists but status is '${assignment.status}'. Set it to 'active' to accept clicks.`);
        }
      }

      if (!assignment) {
        logger.error('❌ Assignment not found (no row in publisher_offers)', {
          public_offer_id: publicOfferId,
          public_publisher_id: publicPublisherId,
          internal_offer_id: offer.id,
          internal_publisher_id: internalPublisherId,
          tenant_id: tenantId
        });
        throw new Error(`Assignment not found for publisher ${publicPublisherId} (internal ${internalPublisherId}) and offer ${publicOfferId} (internal ${offer.id}) in tenant ${tenantId}. Create the assignment on the offer detail page.`);
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
      // 🕵️ TEST POSTBACK INTERCEPTION
      // ============================================
      // Check if there is an active test session for this tenant
      const testResult = await this._processTestInterception(tenantId, offer, publisher, assignment, query, request);
      if (testResult) {
        return testResult; // 🛑 EXIT EARLY: No Production DB Writes
      }

      // ============================================
      // 3. LOGIC: VALIDATION & CALCULATIONS (Zero DB)
      // ============================================

      let redirectUrl = '';

      // Validation
      const offerValidation = offerService.checkOfferValidity(offer);
      if (!offerValidation.valid) {
        return {
          html: generateOfferErrorPage(offerValidation.message, offerValidation.error_type),
          clickId: null
        };
      }

      // 3.1 TARGETING VALIDATION
      const deviceInfo = parseDevice(userAgent);
      const offerIpAction = offer.ip_action ? offer.ip_action.toLowerCase() : null;
      if (offerIpAction && offer.ip_list) {
        const ipList = offer.ip_list.split(',').map(i => i.trim()).filter(Boolean);
        const isIpMatch = ipList.includes(ip);
        if (offerIpAction === 'allow' && !isIpMatch) {
          return { html: generateOfferErrorPage('IP not allowed', 'ip_blocked'), clickId: null };
        } else if (offerIpAction === 'block' && isIpMatch) {
          return { html: generateOfferErrorPage('IP blocked', 'ip_blocked'), clickId: null };
        }
      }

      const location = getLocationFromIP(ip); // { country, region, city }
      const country_final = location.country || getCountryFromHeaders(request) || '';

      const offerCountryAction = offer.country_action ? offer.country_action.toLowerCase() : null;
      if (offerCountryAction && offer.country_list) {
        const countryList = offer.country_list.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
        const isCountryMatch = countryList.includes(country_final.toLowerCase());
        if (offerCountryAction === 'allow' && !isCountryMatch) {
          return { html: generateOfferErrorPage('Country not allowed', 'country_blocked'), clickId: null };
        } else if (offerCountryAction === 'block' && isCountryMatch) {
          return { html: generateOfferErrorPage('Country blocked', 'country_blocked'), clickId: null };
        }
      }

      const offerDeviceAction = offer.device_action ? offer.device_action.toLowerCase() : null;
      if (offerDeviceAction && offer.device_targeting_json) {
        try {
          const dt = typeof offer.device_targeting_json === 'string' ? JSON.parse(offer.device_targeting_json) : offer.device_targeting_json;
          const allowedDevices = Array.isArray(dt) ? dt : (dt?.device || dt?.devices || []);
          if (allowedDevices.length > 0 && !allowedDevices.includes('All')) {
            const isMatch = allowedDevices.includes(deviceInfo.deviceType) || allowedDevices.map(d => d.toLowerCase()).includes(deviceInfo.deviceType.toLowerCase());
            if (offerDeviceAction === 'allow' && !isMatch) {
              return { html: generateOfferErrorPage('Device not allowed', 'device_blocked'), clickId: null };
            } else if (offerDeviceAction === 'block' && isMatch) {
              return { html: generateOfferErrorPage('Device blocked', 'device_blocked'), clickId: null };
            }
          }
        } catch (e) {
          logger.warn('Parsing device_targeting_json failed', e);
        }
      }

      const offerBrowserAction = offer.browser_action ? offer.browser_action.toLowerCase() : null;
      if (offerBrowserAction && offer.browser_targeting_json) {
        try {
          const bt = typeof offer.browser_targeting_json === 'string' ? JSON.parse(offer.browser_targeting_json) : offer.browser_targeting_json;
          const allowedBrowsers = Array.isArray(bt) ? bt : (bt?.browser || bt?.browsers || []);
          if (allowedBrowsers.length > 0 && !allowedBrowsers.includes('All')) {
            const isMatch = allowedBrowsers.includes(deviceInfo.browser) || allowedBrowsers.map(b => b.toLowerCase()).includes(deviceInfo.browser.toLowerCase());
            if (offerBrowserAction === 'allow' && !isMatch) {
              return { html: generateOfferErrorPage('Browser not allowed', 'browser_blocked'), clickId: null };
            } else if (offerBrowserAction === 'block' && isMatch) {
              return { html: generateOfferErrorPage('Browser blocked', 'browser_blocked'), clickId: null };
            }
          }
        } catch (e) {
          logger.warn('Parsing browser_targeting_json failed', e);
        }
      }

      const offerOsAction = offer.os_action ? offer.os_action.toLowerCase() : null;
      if (offerOsAction && offer.os_targeting_json) {
        try {
          const ot = typeof offer.os_targeting_json === 'string' ? JSON.parse(offer.os_targeting_json) : offer.os_targeting_json;
          const allowedOs = Array.isArray(ot) ? ot : (ot?.os || []);
          if (allowedOs.length > 0 && !allowedOs.includes('All')) {
            const isMatch = allowedOs.includes(deviceInfo.os) || allowedOs.map(o => o.toLowerCase()).includes(deviceInfo.os.toLowerCase());
            if (offerOsAction === 'allow' && !isMatch) {
              return { html: generateOfferErrorPage('OS not allowed', 'os_blocked'), clickId: null };
            } else if (offerOsAction === 'block' && isMatch) {
              return { html: generateOfferErrorPage('OS blocked', 'os_blocked'), clickId: null };
            }
          }
        } catch (e) {
          logger.warn('Parsing os_targeting_json failed', e);
        }
      }



      // ✅ 4. REDIS: CHECK OFFER & PUBLISHER CAPS (Zero DB)
      // ============================================

      const clickUuid = generateClickId(tenantId, offer.id, publisher.id, 96);
      let isCapErr = false;

      // 4A. Check Offer Cap
      const offerCapStatus = await cacheService.getCapStatus('offer', offer.id, offer, tenantId);
      if (offerCapStatus.isHit) {
        logger.info(`[CAP] Offer Cap HIT`, {
          offer_id: offer.id,
          type: offer.capping_type,
          action: offer.capping_action,
          limit: offerCapStatus.limit
        });

        const actionResult = await this.applyOfferCapAction(offer, assignment, request, tenantId);

        if (actionResult.stop) {
          isCapErr = true;
          // Fall through to error
        } else if (actionResult.redirect) {
          // Fallback (Offer or Custom URL)
          // Return redirect immediately - DO NOT persist this click for the primary offer
          return {
            redirect: actionResult.redirect,
            clickId: null
          };
        }
        // If REJECT: Continue normally.
      }

      if (isCapErr) {
        const detail = offer.capping_type === 'budget'
          ? `Budget: ${offer.offer_currency || '$'}${offerCapStatus.limit}`
          : `Conversions: ${offerCapStatus.limit}`;
        return {
          html: generateOfferErrorPage(`Offer Cap Hit (${detail}) - Traffic Stopped`, 'offer_cap_hit'),
          clickId: null
        };
      }

      // 4B. Check Publisher Cap
      // 4B. Check Publisher Cap
      const pubCapStatus = await cacheService.getCapStatus('publisher', assignment.id, assignment, tenantId);
      if (pubCapStatus.isHit) {
        logger.info(`[CAP] Publisher Cap HIT`, {
          assignment_id: assignment.id,
          type: assignment.capping_type,
          action: assignment.capping_action
        });

        const actionResult = await this.applyPublisherCapAction(assignment);
        if (actionResult.stop) {
          const detail = assignment.capping_type === 'budget'
            ? `Daily Budget: ${offer.offer_currency || '$'}${pubCapStatus.limit}`
            : `Daily Conversions: ${pubCapStatus.limit}`;
          return {
            html: generateOfferErrorPage(`Publisher Cap Hit (${detail}) - Traffic Stopped`, 'publisher_cap_hit'),
            clickId: null
          };
        }

        if (actionResult.reject_conversion) {
          // Allow traffic but mark for rejection
          isCapErr = false; // ensure we don't stop
        }
      }

      redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid);

      // Assignment Caps? (omitted for brevity, can implement similar pattern in CacheService)

      // ============================================
      // 5. GENERATE & PERSIST
      // ============================================

      // (clickUuid generated above for cap support)

      // Parse params
      const referrer = request.headers.referer || '';
      const domain = extractDomain(referrer);

      // Geo & ISP Lookup (already performed country lookup earlier)

      // Async ISP lookup (with timeout protection)
      let isp = null;
      try {
        isp = await getISP(ip);
      } catch (e) { /* ignore */ }

      // redirectUrl is already set above based on cap checks

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
        offer_id: offer.id,
        public_offer_id: publicOfferId,
        tenant_id: finalTenantId,
        from_request: !!tenantId,
        from_offer: !!offer.tenant_id,
        from_publisher: !!publisher.tenant_id
      });

      // Persist to Redis (include tenant_id for database insertion later)
      // ✅ CRITICAL: Store all values as strings (Redis hash values are strings)
      // ✅ CRITICAL: Add flushed flag to track if click has been inserted into DB
      // 🔥 NEW: Store public_offer_id for tracking URL stability
      const clickData = {
        click_uuid: clickUuid,
        offer_id: String(offer.id),
        public_offer_id: String(publicOfferId),
        publisher_id: String(publisher.id), // 🔥 Use Internal ID
        public_publisher_id: String(publicPublisherId), // 🔥 Store Public ID (from URL) for reference
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
        timestamp: new Date().toISOString(), // UTC ENFORCEMENT: Store UTC timestamp only
        flushed: 'false', // ✅ CRITICAL: Track if click has been inserted into DB
        force_reject: (isCapErr === false && (
          (offerCapStatus.isHit && offer.capping_action === 'reject') ||
          (pubCapStatus.isHit && assignment.capping_action === 'reject')
        )) ? 'true' : 'false'
      };

      // DEBUG: Dump clickData to file to verify content
      const fsDebug = await import('fs');
      fsDebug.appendFileSync('debug_click_data.log', JSON.stringify({
        time: new Date().toISOString(),
        uuid: clickUuid,
        clickData: clickData
      }, null, 2) + '\n---\n');

      try {
        // ✅ CRITICAL: Redis key MUST be: click:{tenant_id}:{offer_id}:{publisher_id}:{click_id}
        // This ensures clicks from different publishers on same offer are isolated
        // 🔥 CHANGED: Use offer.id and publisher.id (internal DB IDs) for Redis key
        const redisKey = `click:${finalTenantId}:${offer.id}:${publisher.id}:${clickUuid}`;

        // ✅ CRITICAL: Log click received
        logger.info('[CLICK] Click received', {
          tenant_id: finalTenantId,
          offer_id: offer.id,
          public_offer_id: publicOfferId,
          publisher_id: publisher.id,
          public_publisher_id: publicPublisherId,
          click_id: clickUuid,
          redis_key: redisKey
        });

        // ✅ CRITICAL: Write click data ONLY ONCE to Redis HASH
        // Use pipeline for atomicity - ensure hash is written before stream entry
        const pipeline = redis.pipeline();
        pipeline.hset(redisKey, clickData);
        pipeline.expire(redisKey, 3600); // 1 hours TTL

        // ✅ CRITICAL: tenant_id should always be set in strict multi-tenant system
        const tenantIdStr = finalTenantId ? String(finalTenantId) : '';
        if (!tenantIdStr) {
          logger.error('❌ CRITICAL: Attempting to add click to stream without tenant_id!', {
            click_uuid: clickUuid,
            offer_id: offer.id,
            public_offer_id: publicOfferId,
            publisher_id: publisher.id
          });
          throw new Error('Cannot add click to stream without tenant_id. This indicates a system failure.');
        }

        // 🔥 CHANGED: Use offer.id and publisher.id (internal DB IDs) for stream
        pipeline.xadd('stream:clicks', '*',
          'tenant_id', tenantIdStr,
          'offer_id', String(offer.id),
          'publisher_id', String(publisher.id),
          'click_id', clickUuid
        );

        // ✅ OPTIONAL: Cache redirect URL for quick lookup (performance optimization, not blocking)
        // This cache does NOT affect click counting or DB insertion
        pipeline.setex(redirectCacheKey, 5, redirectUrl);

        const results = await pipeline.exec();

        // ✅ CRITICAL: Verify hash write succeeded (MANDATORY)
        // Stream write failure is NON-FATAL - click is still in Redis hash and can be backfilled
        let hashWriteSuccess = false;
        let streamWriteSuccess = false;
        let hashWriteError = null;
        let streamWriteError = null;

        for (let i = 0; i < results.length; i++) {
          const [err, result] = results[i];
          if (err) {
            const operation = i === 0 ? 'hash write' : i === 1 ? 'hash expire' : i === 2 ? 'stream add' : 'redirect cache';
            logger.error(`❌ Redis ${operation} failed:`, { error: err.message, result });

            if (i === 0) {
              // Hash write failure is FATAL - click data is lost
              hashWriteError = err;
              throw new Error(`Redis hash write failed: ${err.message}`);
            } else if (i === 2) {
              // Stream write failure is NON-FATAL - click is still in Redis hash
              streamWriteError = err;
              logger.warn(`⚠️ Redis stream enqueue failed - click stored in Redis hash, will be backfilled:`, {
                error: err.message,
                redis_key: redisKey,
                click_id: clickUuid
              });
            }
          } else {
            if (i === 0) hashWriteSuccess = true; // Hash write
            if (i === 2) streamWriteSuccess = true; // Stream add
          }
        }

        // ✅ CRITICAL: Log Redis stored
        if (hashWriteSuccess) {
          logger.info('[CLICK] Redis stored', {
            redis_key: redisKey,
            click_id: clickUuid,
            tenant_id: finalTenantId,
            offer_id: offer.id,
            public_offer_id: publicOfferId,
            publisher_id: publisher.id
          });
        }

        // ✅ CRITICAL: Log stream enqueued (or failed)
        if (streamWriteSuccess) {
          logger.info('[CLICK] Stream enqueued', {
            stream: 'stream:clicks',
            click_id: clickUuid,
            tenant_id: finalTenantId,
            offer_id: offer.id,
            public_offer_id: publicOfferId,
            publisher_id: publisher.id
          });
        } else if (streamWriteError) {
          logger.warn('[CLICK] Stream enqueue failed - click will be backfilled', {
            stream: 'stream:clicks',
            error: streamWriteError.message,
            redis_key: redisKey,
            click_id: clickUuid
          });
        }

        // Verify the hash was actually written (with retry in case of timing issue)
        // redisKey already defined above
        let hashCheck = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          hashCheck = await redis.hget(redisKey, 'offer_id');
          if (hashCheck) break;
          if (attempt < 2) await new Promise(r => setTimeout(r, 100)); // Wait 100ms before retry
        }

        if (hashCheck) {
          logger.info(`✅ Verified click hash exists: ${redisKey} (offer_id: ${hashCheck})`);
        } else {
          logger.error(`❌ CRITICAL: Click hash was NOT written or was deleted! ${redisKey}`);
          logger.error('   This will cause the worker to fail when processing this click.');
          // Try to write it again as a fallback
          try {
            await redis.hset(redisKey, clickData);
            await redis.expire(redisKey, 86400);
            logger.info(`✅ Fallback: Re-wrote click hash: ${redisKey}`);
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

      // ✅ CRITICAL: Log that click was stored in Redis (already logged above, but keeping for compatibility)

      return {
        redirect: redirectUrl,
        clickId: clickUuid
      };

    } catch (error) {
      logger.error({ message: error.message, stack: error.stack }, 'TrackingService.trackClick error:');
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

  _getConfiguredAllowedEvents() {
    const configured = String(process.env.TRACKING_ALLOWED_EVENTS || '')
      .split(',')
      .map((item) => normalizeEventName(item))
      .filter(Boolean);

    if (configured.length > 0) return new Set(configured);

    return new Set([
      'click',
      'view',
      'impression',
      'landing',
      'page_view',
      'session_start',
      'signup',
      'login',
      'lead',
      'install',
      'add_to_cart',
      'initiate_checkout',
      'add_payment_info',
      'purchase',
      'conversion',
      'subscribe',
      'trial_start',
      'kyc_submitted',
      'kyc_approved',
      'first_deposit'
    ]);
  }

  async _updateDailyEventStats({ offerId, tenantId, isPayable }) {
    const today = getIstDateString();
    const payableInc = isPayable ? 1 : 0;
    const nonPayableInc = isPayable ? 0 : 1;

    try {
      await pool.query(
        `INSERT INTO daily_offer_stats (
           offer_id, tenant_id, day, events, payable_events, non_payable_events, created_at, updated_at
         )
         VALUES (?, ?, ?, 1, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           events = COALESCE(daily_offer_stats.events, 0) + 1,
           payable_events = COALESCE(daily_offer_stats.payable_events, 0) + VALUES(payable_events),
           non_payable_events = COALESCE(daily_offer_stats.non_payable_events, 0) + VALUES(non_payable_events),
           updated_at = UTC_TIMESTAMP()`,
        [offerId, tenantId, today, payableInc, nonPayableInc]
      );
    } catch (statsErr) {
      if (statsErr.code === 'ER_BAD_FIELD_ERROR') {
        if (!dailyEventStatsColumnsMissingLogged) {
          logger.warn('daily_offer_stats event columns missing. Run migration to add events/payable_events/non_payable_events');
          dailyEventStatsColumnsMissingLogged = true;
        }
        return;
      }
      throw statsErr;
    }
  }

  async _insertEventAnalyticsFact(payload) {
    try {
      await pool.query(
        `INSERT INTO event_analytics (
           tenant_id, event_at, event_day, event_hour, click_uuid, offer_id, publisher_id, publisher_offer_id,
           event_name, event_id, event_value, is_known_event, is_payable_event, payout_event,
           conversion_status, conversion_amount, conversion_payout, conversion_already_exists,
           approval_percentage, payout_override, metadata, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [
          payload.tenant_id,
          payload.event_at,
          payload.event_day,
          payload.event_hour,
          payload.click_uuid,
          payload.offer_id,
          payload.publisher_id,
          payload.publisher_offer_id,
          payload.event_name,
          payload.event_id || null,
          payload.event_value,
          payload.is_known_event ? 1 : 0,
          payload.is_payable_event ? 1 : 0,
          payload.payout_event,
          payload.conversion_status || null,
          payload.conversion_amount ?? null,
          payload.conversion_payout ?? null,
          payload.conversion_already_exists ? 1 : 0,
          payload.approval_percentage ?? null,
          payload.payout_override ?? null,
          payload.metadata ? JSON.stringify(payload.metadata) : null,
        ]
      );
    } catch (statsErr) {
      if (statsErr.code === 'ER_NO_SUCH_TABLE') {
        if (!eventAnalyticsTableMissingLogged) {
          logger.warn('event_analytics table missing. Run migration create_event_analytics.sql');
          eventAnalyticsTableMissingLogged = true;
        }
        return;
      }
      throw statsErr;
    }
  }

  async trackEvent(payload, request) {
    const tenantId = getTenantIdFromRequest(request);
    if (!tenantId) {
      return { success: false, message: 'Tenant identity required from subdomain' };
    }

    const clickId = String(payload.click_id || '').trim();
    if (!clickId) {
      return { success: false, message: 'click_id is required' };
    }

    const eventName = normalizeEventName(payload.event || 'purchase');
    if (!eventName) {
      return { success: false, message: 'event is required' };
    }

    const allowedEvents = this._getConfiguredAllowedEvents();
    const isKnownEvent = allowedEvents.has(eventName);
    const strictAllowedEvents = String(process.env.TRACKING_STRICT_ALLOWED_EVENTS || 'false').toLowerCase() === 'true';
    if (strictAllowedEvents && !isKnownEvent) {
      return { success: false, message: `Unsupported event: ${eventName}` };
    }
    if (!isKnownEvent) {
      logger.warn('TrackingService.trackEvent received non-standard event', {
        event_name: eventName,
        tenant_id: tenantId,
        click_id: clickId,
      });
    }

    const eventIdRaw = payload.event_id ? String(payload.event_id).trim() : null;
    const metadata = parseMetadata(payload.metadata);
    const amountFromPayload = Number(payload.amount);
    const eventAt = new Date();
    const eventDay = getIstDateString();
    const eventHour = parseInt(new Date(eventAt.getTime() + (330 * 60 * 1000)).toISOString().split('T')[1].slice(0, 2), 10);

    let click = null;
    const clickCacheKey = `event:clickctx:${tenantId}:${clickId}`;
    try {
      const cachedClick = await redis.get(clickCacheKey);
      if (cachedClick) {
        click = JSON.parse(cachedClick);
      }
    } catch (cacheErr) {
      logger.debug('trackEvent click cache read failed', { error: cacheErr.message });
    }

    if (!click) {
      const [clickRows] = await pool.query(
        `SELECT click_uuid, offer_id, publisher_id, publisher_offer_id, rcid, tid
         FROM clicks
         WHERE click_uuid = ? AND tenant_id = ?
         LIMIT 1`,
        [clickId, tenantId]
      );

      if (!Array.isArray(clickRows) || clickRows.length === 0) {
        return { success: false, message: 'Invalid click_id' };
      }

      click = clickRows[0];
      try {
        await redis.setex(clickCacheKey, 300, JSON.stringify(click));
      } catch (cacheErr) {
        logger.debug('trackEvent click cache write failed', { error: cacheErr.message });
      }
    }

    let offer = null;
    const offerCacheKey = `event:offerctx:${tenantId}:${click.offer_id}`;
    try {
      const cachedOffer = await redis.get(offerCacheKey);
      if (cachedOffer) {
        offer = JSON.parse(cachedOffer);
      }
    } catch (cacheErr) {
      logger.debug('trackEvent offer cache read failed', { error: cacheErr.message });
    }

    if (!offer) {
      const [offerRows] = await pool.query(
        `SELECT id, payout_event, advertiser_amount, affiliate_amount
         FROM offers
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`,
        [click.offer_id, tenantId]
      );

      if (!Array.isArray(offerRows) || offerRows.length === 0) {
        return {
          success: true,
          duplicate_event: false,
          conversion_created: false,
          message: 'Event tracked but offer no longer exists'
        };
      }

      offer = offerRows[0];
      try {
        await redis.setex(offerCacheKey, 300, JSON.stringify(offer));
      } catch (cacheErr) {
        logger.debug('trackEvent offer cache write failed', { error: cacheErr.message });
      }
    }
    const payoutEvent = normalizeEventName(offer.payout_event || 'purchase') || 'purchase';
    const isPayableEvent = eventName === payoutEvent;
    // For the payable event, enforce "only once per click" regardless of retries with different event_id values.
    const eventId = isPayableEvent ? null : eventIdRaw;
    const fallbackOfferAmount = Number(offer.advertiser_amount || 0);
    const eventValue = Number.isFinite(amountFromPayload) && amountFromPayload > 0
      ? amountFromPayload
      : (isPayableEvent && Number.isFinite(fallbackOfferAmount) && fallbackOfferAmount > 0 ? fallbackOfferAmount : 0);

    const asyncEventEnabled = String(process.env.TRACKING_EVENT_ASYNC || 'true').toLowerCase() !== 'false';
    if (asyncEventEnabled) {
      try {
        const requestIp = extractIP(request);
        await redis.xadd(
          'stream:events',
          '*',
          'tenant_id',
          String(tenantId),
          'click_uuid',
          click.click_uuid,
          'offer_id',
          String(click.offer_id),
          'publisher_id',
          String(click.publisher_id),
          'publisher_offer_id',
          click.publisher_offer_id ? String(click.publisher_offer_id) : '',
          'event_name',
          eventName,
          'event_id',
          eventId || '',
          'event_value',
          String(eventValue),
          'metadata',
          metadata ? JSON.stringify(metadata) : '',
          'payout_event',
          payoutEvent,
          'is_payable',
          isPayableEvent ? '1' : '0',
          'is_known_event',
          isKnownEvent ? '1' : '0',
          'advertiser_amount',
          String(Number(offer.advertiser_amount || 0)),
          'affiliate_amount',
          String(Number(offer.affiliate_amount || 0)),
          'rcid',
          click.rcid || '',
          'tid',
          click.tid || '',
          'request_ip',
          requestIp || '',
          'timestamp',
          new Date().toISOString()
        );

        return {
          success: true,
          duplicate_event: false,
          conversion_created: false,
          conversion_already_exists: false,
          conversion_queued: !!isPayableEvent,
          non_standard_event: !isKnownEvent,
          event_name: eventName,
          payout_event: payoutEvent,
          event_value: eventValue,
          click_id: click.click_uuid,
          processing_mode: 'async'
        };
      } catch (queueErr) {
        logger.error('TrackingService.trackEvent async queue failed, falling back to sync', {
          error: queueErr.message,
          click_id: click.click_uuid,
          tenant_id: tenantId
        });
      }
    }

    const [eventInsert] = await pool.query(
      `INSERT INTO events (
         click_uuid, event_name, event_id, offer_id, publisher_id, tenant_id, event_value, metadata, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE id = id`,
      [
        click.click_uuid,
        eventName,
        eventId || null,
        click.offer_id,
        click.publisher_id,
        tenantId,
        eventValue,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    const duplicateEvent = eventInsert.affectedRows !== 1;
    if (!duplicateEvent) {
      await this._updateDailyEventStats({
        offerId: click.offer_id,
        tenantId,
        isPayable: isPayableEvent
      });
    }
    let assignment = null;
    let callbackUrl = null;
    let approvalPercentage = null;

    if (click.publisher_offer_id) {
      const [assignmentRows] = await pool.query(
        `SELECT po.id as assignment_id, po.payout_override, po.conversion_approval_percentage, po.callback_url, p.global_postback_url
         FROM publisher_offers po
         LEFT JOIN publishers p ON p.id = po.publisher_id
         WHERE po.id = ? AND po.tenant_id = ?
         LIMIT 1`,
        [click.publisher_offer_id, tenantId]
      );
      assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : null;
      callbackUrl = assignment?.callback_url || assignment?.global_postback_url || null;
      approvalPercentage = assignment?.conversion_approval_percentage;
    } else {
      const [publisherRows] = await pool.query(
        `SELECT global_postback_url
         FROM publishers
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`,
        [click.publisher_id, tenantId]
      );
      const publisher = Array.isArray(publisherRows) ? publisherRows[0] : null;
      callbackUrl = publisher?.global_postback_url || null;
    }

    if (!duplicateEvent && callbackUrl) {
      await postbackService.sendPublisherEventPostback(
        callbackUrl,
        {
          tenant_id: tenantId,
          publisher_id: click.publisher_id,
          rcid: click.rcid || null,
          status: 'approved',
          amount: Number(eventValue || 0),
          payout: 0,
        },
        {
          tid: click.tid || '',
          publisher_id: click.publisher_id,
        },
        {
          event_name: eventName,
          event_id: eventId || null,
          event_value: Number(eventValue || 0),
        }
      );
    }

    if (!isPayableEvent) {
      await this._insertEventAnalyticsFact({
        tenant_id: tenantId,
        event_at: eventAt.toISOString().slice(0, 19).replace('T', ' '),
        event_day: eventDay,
        event_hour: Number.isFinite(eventHour) ? eventHour : 0,
        click_uuid: click.click_uuid,
        offer_id: click.offer_id,
        publisher_id: click.publisher_id,
        publisher_offer_id: click.publisher_offer_id || null,
        event_name: eventName,
        event_id: eventId || null,
        event_value: Number(eventValue || 0),
        is_known_event: isKnownEvent,
        is_payable_event: false,
        payout_event: payoutEvent,
        conversion_status: null,
        conversion_amount: null,
        conversion_payout: null,
        conversion_already_exists: false,
        approval_percentage: approvalPercentage != null ? Number(approvalPercentage) : null,
        payout_override: assignment?.payout_override != null ? Number(assignment.payout_override) : null,
        metadata,
      });
      await dailyAggregateService.upsertWithRollup({
        tenantId,
        day: eventDay,
        offerId: click.offer_id,
        publisherId: click.publisher_id,
        eventName,
        events: duplicateEvent ? 0 : 1,
        payableEvents: 0,
        nonPayableEvents: duplicateEvent ? 0 : 1,
      });
      return {
        success: true,
        duplicate_event: duplicateEvent,
        conversion_created: false,
        non_standard_event: !isKnownEvent,
        event_name: eventName,
        payout_event: payoutEvent
      };
    }

    const conversionAmount = eventValue > 0 ? eventValue : Number(offer.advertiser_amount || 0);
    const conversionPayout = Number(assignment?.payout_override || offer.affiliate_amount || 0);
    const conversionRcid = click.rcid || uuidv4();
    let finalStatus = 'approved';
    if (
      assignment?.assignment_id &&
      approvalPercentage !== null &&
      approvalPercentage !== undefined
    ) {
      finalStatus = await postbackService.determineDeterministicApprovalStatus({
        tenantId,
        offerId: click.offer_id,
        publisherId: click.publisher_id,
        assignmentId: assignment.assignment_id,
        decisionKey: conversionRcid || click.click_uuid || click.tid,
        approvalPercentage: Number(approvalPercentage),
        fallbackStatus: 'approved',
      });
    }

    const [existingConversionRows] = await pool.query(
      `SELECT id
       FROM conversions
       WHERE click_uuid = ? AND tenant_id = ?
       LIMIT 1`,
      [click.click_uuid, tenantId]
    );
    const hasExistingConversion = Array.isArray(existingConversionRows) && existingConversionRows.length > 0;
    if (hasExistingConversion) {
      await this._insertEventAnalyticsFact({
        tenant_id: tenantId,
        event_at: eventAt.toISOString().slice(0, 19).replace('T', ' '),
        event_day: eventDay,
        event_hour: Number.isFinite(eventHour) ? eventHour : 0,
        click_uuid: click.click_uuid,
        offer_id: click.offer_id,
        publisher_id: click.publisher_id,
        publisher_offer_id: click.publisher_offer_id || null,
        event_name: eventName,
        event_id: eventId || null,
        event_value: Number(eventValue || 0),
        is_known_event: isKnownEvent,
        is_payable_event: true,
        payout_event: payoutEvent,
        conversion_status: 'already_exists',
        conversion_amount: conversionAmount,
        conversion_payout: finalStatus === 'approved' ? conversionPayout : 0,
        conversion_already_exists: true,
        approval_percentage: approvalPercentage != null ? Number(approvalPercentage) : null,
        payout_override: assignment?.payout_override != null ? Number(assignment.payout_override) : null,
        metadata,
      });
      await dailyAggregateService.upsertWithRollup({
        tenantId,
        day: eventDay,
        offerId: click.offer_id,
        publisherId: click.publisher_id,
        eventName,
        events: duplicateEvent ? 0 : 1,
        payableEvents: duplicateEvent ? 0 : 1,
        nonPayableEvents: 0,
      });
      return {
        success: true,
        duplicate_event: duplicateEvent,
        conversion_created: false,
        conversion_already_exists: true,
        conversion_queued: false,
        non_standard_event: !isKnownEvent,
        event_name: eventName,
        payout_event: payoutEvent,
        event_value: eventValue,
        click_id: click.click_uuid
      };
    }

    const conversionData = {
      click_uuid: click.click_uuid,
      offer_id: click.offer_id,
      publisher_id: click.publisher_id,
      publisher_offer_id: click.publisher_offer_id || null,
      tenant_id: tenantId,
      rcid: conversionRcid,
      status: finalStatus,
      amount: conversionAmount,
      payout: finalStatus === 'approved' ? conversionPayout : 0,
      ip: extractIP(request),
      timestamp: new Date().toISOString(),
      postback_payload: JSON.stringify({
        source: 'event_api',
        event_name: eventName,
        event_id: eventId || null,
        metadata
      }),
      callback_url: callbackUrl,
      tid: click.tid || '',
      force_reject: false
    };

    try {
      await redis.setex(`conversion:${click.click_uuid}`, 900, JSON.stringify(conversionData));
      await redis.xadd(
        'stream:conversions',
        '*',
        'click_uuid',
        click.click_uuid,
        'timestamp',
        new Date().toISOString()
      );
    } catch (queueErr) {
      logger.error('TrackingService.trackEvent queueing failed, using DB fallback', {
        error: queueErr.message,
        click_id: click.click_uuid,
        tenant_id: tenantId
      });

      const fallbackConversionUuid = generateClickId(tenantId || 0, click.offer_id || 0, click.publisher_id || 0, 96);
      const [conversionInsert] = await pool.query(
        `INSERT INTO conversions (
           conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
           rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE id = id`,
        [
          fallbackConversionUuid,
          click.click_uuid,
          click.offer_id,
          click.publisher_id,
          click.publisher_offer_id || null,
          tenantId,
          conversionRcid,
          finalStatus,
          conversionAmount,
          finalStatus === 'approved' ? conversionPayout : 0,
          extractIP(request),
          conversionData.postback_payload
        ]
      );

      const conversionCreated = conversionInsert.affectedRows === 1;
      await this._insertEventAnalyticsFact({
        tenant_id: tenantId,
        event_at: eventAt.toISOString().slice(0, 19).replace('T', ' '),
        event_day: eventDay,
        event_hour: Number.isFinite(eventHour) ? eventHour : 0,
        click_uuid: click.click_uuid,
        offer_id: click.offer_id,
        publisher_id: click.publisher_id,
        publisher_offer_id: click.publisher_offer_id || null,
        event_name: eventName,
        event_id: eventId || null,
        event_value: Number(eventValue || 0),
        is_known_event: isKnownEvent,
        is_payable_event: true,
        payout_event: payoutEvent,
        conversion_status: conversionCreated ? finalStatus : 'already_exists',
        conversion_amount: conversionAmount,
        conversion_payout: finalStatus === 'approved' ? conversionPayout : 0,
        conversion_already_exists: !conversionCreated,
        approval_percentage: approvalPercentage != null ? Number(approvalPercentage) : null,
        payout_override: assignment?.payout_override != null ? Number(assignment.payout_override) : null,
        metadata,
      });
      await dailyAggregateService.upsertWithRollup({
        tenantId,
        day: eventDay,
        offerId: click.offer_id,
        publisherId: click.publisher_id,
        eventName,
        events: duplicateEvent ? 0 : 1,
        payableEvents: duplicateEvent ? 0 : 1,
        nonPayableEvents: 0,
        conversions: conversionCreated ? 1 : 0,
        approvedConversions: conversionCreated && finalStatus === 'approved' ? 1 : 0,
        pendingConversions: conversionCreated && finalStatus === 'pending' ? 1 : 0,
        rejectedConversions: conversionCreated && finalStatus !== 'approved' && finalStatus !== 'pending' ? 1 : 0,
        revenue: conversionCreated ? conversionAmount : 0,
        payout: conversionCreated && finalStatus === 'approved' ? conversionPayout : 0,
      });
      return {
        success: true,
        duplicate_event: duplicateEvent,
        conversion_created: conversionCreated,
        conversion_already_exists: !conversionCreated,
        conversion_queued: false,
        non_standard_event: !isKnownEvent,
        event_name: eventName,
        payout_event: payoutEvent,
        event_value: eventValue,
        click_id: click.click_uuid
      };
    }

    await this._insertEventAnalyticsFact({
      tenant_id: tenantId,
      event_at: eventAt.toISOString().slice(0, 19).replace('T', ' '),
      event_day: eventDay,
      event_hour: Number.isFinite(eventHour) ? eventHour : 0,
      click_uuid: click.click_uuid,
      offer_id: click.offer_id,
      publisher_id: click.publisher_id,
      publisher_offer_id: click.publisher_offer_id || null,
      event_name: eventName,
      event_id: eventId || null,
      event_value: Number(eventValue || 0),
      is_known_event: isKnownEvent,
      is_payable_event: true,
      payout_event: payoutEvent,
      conversion_status: 'queued',
      conversion_amount: conversionAmount,
      conversion_payout: finalStatus === 'approved' ? conversionPayout : 0,
      conversion_already_exists: false,
      approval_percentage: approvalPercentage != null ? Number(approvalPercentage) : null,
      payout_override: assignment?.payout_override != null ? Number(assignment.payout_override) : null,
      metadata,
    });
    await dailyAggregateService.upsertWithRollup({
      tenantId,
      day: eventDay,
      offerId: click.offer_id,
      publisherId: click.publisher_id,
      eventName,
      events: duplicateEvent ? 0 : 1,
      payableEvents: duplicateEvent ? 0 : 1,
      nonPayableEvents: 0,
    });

    return {
      success: true,
      duplicate_event: duplicateEvent,
      conversion_created: false,
      conversion_already_exists: false,
      conversion_queued: true,
      non_standard_event: !isKnownEvent,
      event_name: eventName,
      payout_event: payoutEvent,
      event_value: eventValue,
      click_id: click.click_uuid
    };
  }

  async _processTestInterception(tenantId, offer, publisher, assignment, query, request) {
    try {
      // ✅ Key Pattern: test:postback:{tenant_id}:{publisher_id}:{offer_id}
      const key = `test:postback:${tenantId}:${publisher.id}:${offer.id}`;
      const sessionRaw = await redis.get(key);

      // 🚦 NO TEST SESSION = NORMAL PRODUCTION FLOW
      if (!sessionRaw) return null;

      const session = JSON.parse(sessionRaw);

      // ✅ Strict Safety: Only process if status is 'pending' AND no click captured yet
      if (session.status !== 'pending' || session.affiliate_click_id) {
        logger.debug('[TEST] Session already processed or not pending', {
          status: session.status,
          has_click_id: !!session.affiliate_click_id
        });
        return null;
      }

      logger.info('[TEST] 🧪 TEST MODE ACTIVATED - Intercepting click for test postback', {
        tenantId,
        publisherId: publisher.id,
        offerId: offer.id,
        key
      });

      // 🔍 Extract Affiliate's Click ID from URL
      const affiliateClickId = query.click_id || query.tid || null;

      // 🚨 CRITICAL: If no click_id, mark as FAILED and continue redirect
      if (!affiliateClickId) {
        logger.warn('[TEST] ❌ No click_id/tid in URL - marking test as FAILED', {
          query,
          available_params: Object.keys(query)
        });

        // Update Redis: Mark as failed
        session.status = 'failed';
        session.completed_at = Date.now();
        await redis.set(key, JSON.stringify(session), 'KEEPTTL');

        // Continue redirect normally (no postback fired)
        const clickUuid = generateClickId(tenantId, offer.id, publisher.id, 96);
        const redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid);

        return {
          redirect: redirectUrl,
          clickId: clickUuid
        };
      }

      // ✅ Click ID found - proceed with test
      logger.info('[TEST] ✓ Affiliate click_id extracted', {
        affiliate_click_id: affiliateClickId
      });

      // Update Redis Session -> Click Received
      session.affiliate_click_id = affiliateClickId;
      session.status = 'click_received';
      await redis.set(key, JSON.stringify(session), 'KEEPTTL');

      // 🔥 Fire Global Postback Immediately
      const callbackUrl = session.postback_url;
      let postbackResult = null;

      if (callbackUrl) {
        const mockConversion = {
          conversion_uuid: 'TEST-' + uuidv4(),
          click_uuid: 'TEST-CLICK-' + uuidv4(),
          offer_id: offer.id,
          publisher_id: publisher.id,
          tenant_id: tenantId,
          status: 'approved',
          amount: 0,
          payout: 0,
          is_test: true
        };
        const mockClick = { tid: affiliateClickId };

        logger.info('[TEST] 🚀 Firing Postback', {
          url: callbackUrl,
          click_id: affiliateClickId
        });

        try {
          // Fire postback and capture response
          postbackResult = await postbackService.sendPublisherPostback(
            callbackUrl,
            mockConversion,
            mockClick
          );

          session.postback_fired = true;
          session.postback_response = {
            status: postbackResult?.status || 200,
            response: postbackResult?.response || 'OK',
            latency_ms: postbackResult?.latency_ms || 0,
            fired_at: Date.now()
          };

          logger.info('[TEST] ✅ Postback fired successfully', {
            status: postbackResult?.status,
            latency: postbackResult?.latency_ms
          });

        } catch (postbackErr) {
          logger.error('[TEST] ❌ Postback firing failed', {
            error: postbackErr.message,
            url: callbackUrl
          });

          session.postback_fired = false;
          session.postback_response = {
            error: postbackErr.message,
            fired_at: Date.now()
          };
        }
      } else {
        logger.warn('[TEST] ⚠️ No postback URL configured for publisher', {
          publisher_id: publisher.id
        });
      }

      // Update Redis Session -> Completed
      session.status = 'completed';
      session.completed_at = Date.now();
      await redis.set(key, JSON.stringify(session), 'KEEPTTL');

      logger.info('[TEST] ✅ Test completed successfully', {
        affiliate_click_id: affiliateClickId,
        postback_fired: session.postback_fired
      });

      // 🚨 ABSOLUTE RULE: Return Redirect WITHOUT Any DB Writes
      // ❌ NO clicks table insert
      // ❌ NO conversions table insert
      // ❌ NO postback_logs table insert
      const clickUuid = generateClickId(tenantId, offer.id, publisher.id, 96);
      const redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid);

      logger.info('[TEST] 🔄 Returning redirect (ZERO DB WRITES)', {
        redirect_url: redirectUrl.substring(0, 100) + '...'
      });

      return {
        redirect: redirectUrl,
        clickId: clickUuid
      };

    } catch (err) {
      logger.error('[TEST] ❌ Test interception failed catastrophically', {
        error: err.message,
        stack: err.stack
      });

      // If test logic fails, return null to fall back to normal production flow
      // This ensures production traffic is never blocked by test failures
      return null;
    }
  }



  async applyOfferCapAction(offer, assignment, request, tenantId) {
    const action = offer.capping_action || 'stop';

    if (action === 'stop') {
      return { stop: true };
    }

    if (action === 'reject') {
      // Allow click (REJECT means don't count for cap, but allow traffic - usually used for testing or specific rules)
      return { stop: false, reject_conversion: true };
    }

    if (action === 'fallback') {
      // Custom URL Fallback
      if (offer.fallback_type === 'custom' && offer.fallback_url) {
        return { stop: false, redirect: offer.fallback_url };
      }

      // Offer Fallback
      if (offer.fallback_type === 'offer' && offer.fallback_offer_id) {
        // Validate fallback offer belongs to tenant
        const fallbackOffer = await offerService.getOfferById(offer.fallback_offer_id, tenantId, true);
        if (!fallbackOffer) {
          logger.warn('[CAP] Fallback offer not found or invalid', { fallback_offer_id: offer.fallback_offer_id, tenant_id: tenantId });
          return { stop: true };
        }

        // Check if SAME publisher is assigned to fallback offer
        const fallbackAssignment = await assignmentService.findByPublisherAndOffer(assignment.publisher_id, fallbackOffer.id, tenantId);
        if (!fallbackAssignment || fallbackAssignment.status !== 'active') {
          logger.warn('[CAP] Fallback offer not assigned to publisher or inactive', {
            pub_id: assignment.publisher_id,
            fallback_offer: fallbackOffer.id
          });
          return { stop: true };
        }

        // Construct Redirect URL to the fallback offer
        // Get public IDs for the URL
        const publicOfferId = fallbackOffer.public_offer_id || fallbackOffer.display_id || fallbackOffer.id;

        // Resolve public publisher ID (if not in assignment, try from request or publisher service)
        const publicPublisherId = assignment.public_publisher_id ||
          request.query.pub_id ||
          request.query.a ||
          (await (await import('./offerPublicIdService.js')).default.getPublicPublisherId(assignment.publisher_id, tenantId));

        const protocol = request.headers['x-forwarded-proto'] || 'http';
        const host = request.headers.host;
        const originalUrl = request.url;
        const queryPart = originalUrl.includes('?') ? originalUrl.split('?')[1] : '';

        // Rebuild query params with new offer_id
        // We clean the query part to remove old offer_id/pub_id if they might conflict, 
        // but typically just appending works if the endpoint prioritizes the first ones.
        // Safer: construct clean URL.
        const validParams = new URLSearchParams(queryPart);
        validParams.delete('offer_id');
        validParams.delete('oid');
        validParams.delete('pub_id');
        validParams.delete('a');

        const cleanQuery = validParams.toString();
        const newUrl = `${protocol}://${host}/click?offer_id=${publicOfferId}&pub_id=${publicPublisherId}${cleanQuery ? '&' + cleanQuery : ''}`;

        logger.info('[CAP] Redirecting to fallback offer', {
          original_offer: offer.id,
          fallback_offer: fallbackOffer.id,
          fallback_url: newUrl
        });

        return { stop: false, redirect: newUrl };
      }

      return { stop: true }; // Fallback configured but missing details
    }

    return { stop: true }; // Default safe
  }

  async applyPublisherCapAction(assignment) {
    const action = assignment.capping_action || 'stop';
    if (action === 'stop') return { stop: true };
    if (action === 'reject') return { stop: false, reject_conversion: true };
    return { stop: true };
  }

  async trackImpression(query, request) {
    try {
      const publicOfferId = parseInt(query.offer_id);
      const publicPublisherId = parseInt(query.pub_id);

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
          offer_id: publicOfferId,
          pub_id: publicPublisherId
        });
        return {
          success: false,
          error: 'Tenant identity required. Access via tenant subdomain (e.g., tenant1.localhost:5001/imp for local testing). Business identifiers cannot be used for tenant resolution.'
        };
      }

      logger.info('[IMP] Tenant resolved from subdomain', {
        host: request.headers.host,
        tenant_id: tenantId,
        public_offer_id: publicOfferId,
        public_publisher_id: publicPublisherId
      });

      // ✅ STEP 2: Resolve Public IDs to Internal IDs (consistency with trackClick)
      const internalOfferId = await offerService.getInternalOfferIdByPublicId(publicOfferId, tenantId);
      const offerPublicIdService = (await import('./offerPublicIdService.js')).default;
      const publisher = await offerPublicIdService.getPublisherByPublicId(publicPublisherId, tenantId);
      const internalPublisherId = publisher ? publisher.id : null;

      const offer = internalOfferId
        ? await offerService.getOfferById(internalOfferId, tenantId, true)
        : null;

      // ✅ STEP 3: Validate business data exists and belongs to resolved tenant
      if (!offer) {
        logger.error('❌ Offer not found or does not belong to tenant', {
          public_offer_id: publicOfferId,
          tenant_id: tenantId
        });
        return { success: false, error: `Offer ${publicOfferId} not found or does not belong to tenant ${tenantId}` };
      }

      if (!publisher) {
        logger.error('❌ Publisher not found or does not belong to tenant', {
          public_publisher_id: publicPublisherId,
          tenant_id: tenantId
        });
        return { success: false, error: `Publisher ${publicPublisherId} not found or does not belong to tenant ${tenantId}` };
      }

      // ✅ STEP 4: Verify ownership (defense in depth)
      if (offer.tenant_id && parseInt(offer.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ Tenant mismatch: Offer does not belong to tenant', {
          offer_id: offer.id,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: tenantId
        });
        return { success: false, error: 'Offer does not belong to this tenant' };
      }
      if (publisher.tenant_id && parseInt(publisher.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ Tenant mismatch: Publisher does not belong to tenant', {
          publisher_id: publisher.id,
          publisher_tenant_id: publisher.tenant_id,
          resolved_tenant_id: tenantId
        });
        return { success: false, error: 'Publisher does not belong to this tenant' };
      }

      if (publisher.status !== 'active') {
        return { success: false, error: 'Publisher is not active' };
      }

      // ✅ CRITICAL: Check assignment exists (with tenant_id if available)
      let assignmentQuery = 'SELECT id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?';
      const assignmentParams = [internalPublisherId, internalOfferId, 'active'];

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
      if (tenantId && assignment.tenant_id && parseInt(assignment.tenant_id) !== parseInt(tenantId)) {
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

      // ✅ Validate offer belongs to resolved tenant (redundant but safe)
      if (offer && offer.tenant_id && parseInt(offer.tenant_id) !== parseInt(finalTenantId)) {
        logger.error('❌ HARD FAILURE: Offer tenant mismatch for impression', {
          offer_id: offer.id,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: finalTenantId
        });
        return { success: false, error: `Security violation: Offer ${offer.id} belongs to tenant ${offer.tenant_id}, but request is for tenant ${finalTenantId}. Access denied.` };
      }

      // ✅ CRITICAL: Insert impression with resolved tenant_id
      const impUuid = uuidv4();
      await pool.query(
        `INSERT INTO impressions (
          imp_uuid, offer_id, publisher_id, tenant_id, ip, user_agent, referrer, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [impUuid, internalOfferId, internalPublisherId, finalTenantId, ip, userAgent, referrer]
      );

      // Update daily stats
      await this.updateDailyStats(internalOfferId, internalPublisherId, 'impression', finalTenantId);

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
      const today = getIstDateString();

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
          let countQuery = `SELECT COUNT(*) as cnt FROM clicks
                 WHERE offer_id = ?
                   AND ip = ?
                   AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = ?`;
          const countParams = [offerId, clickIp, today];
          if (tenantId) {
            countQuery += ' AND tenant_id = ?';
            countParams.push(tenantId);
          }
          const [countRows] = await pool.query(countQuery, countParams);
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

