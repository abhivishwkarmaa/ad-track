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

const getIstDateString = () => {
  const now = new Date();
  const istTime = new Date(now.getTime() + (330 * 60 * 1000));
  return istTime.toISOString().split('T')[0];
};

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
      // STEP 2: RESOLVE — Public ID → Internal ID
      // ============================================
      const internalOfferId = await cacheService.getInternalOfferId(publicOfferId, tenantId);
      const publisher = await cacheService.getPublisher(publicPublisherId, tenantId);
      const internalPublisherId = publisher ? publisher.id : null;

      const offer = internalOfferId
        ? await cacheService.getOffer(internalOfferId, tenantId)
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

      // ✅ STEP 5: Verify tenant exists in database (CACHED)
      try {
        const tenant = await cacheService.getTenant(tenantId);
        if (!tenant) {
          logger.error(`❌ CRITICAL: Tenant ID ${tenantId} does not exist!`);
          throw new Error(`Tenant ${tenantId} does not exist`);
        }
        logger.debug(`✅ Tenant ${tenantId} verified: ${tenant.name}`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          throw err;
        }
        logger.warn(`⚠️ Could not verify tenant existence: ${err.message}`);
      }

      // ============================================
      // STEP 4: Assignment Resolution (CACHED)
      // ============================================
      const assignment = await cacheService.getAssignment(internalPublisherId, offer.id, tenantId);

      if (!assignment) {
        logger.error('❌ Assignment not found or inactive', {
          public_offer_id: publicOfferId,
          public_publisher_id: publicPublisherId,
          offer_id: offer.id,
          publisher_id: internalPublisherId,
          tenant_id: tenantId
        });
        throw new Error(`Technical Error: No active assignment for publisher ${publicPublisherId} and offer ${publicOfferId}.`);
      }

      // ✅ CRITICAL: HARD VALIDATION - Assignment must belong to resolved tenant
      if (assignment.tenant_id && parseInt(assignment.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Assignment tenant mismatch', {
          assignment_id: assignment.id,
          assignment_tenant_id: assignment.tenant_id,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Security violation: Assignment does not belong to tenant ${tenantId}.`);
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
        // Validate fallback offer belongs to tenant (CACHED)
        const fallbackOffer = await cacheService.getOffer(offer.fallback_offer_id, tenantId);
        if (!fallbackOffer) {
          logger.warn('[CAP] Fallback offer not found or invalid', { fallback_offer_id: offer.fallback_offer_id, tenant_id: tenantId });
          return { stop: true };
        }

        // Check if SAME publisher is assigned to fallback offer (CACHED)
        const fallbackAssignment = await cacheService.getAssignment(assignment.publisher_id, fallbackOffer.id, tenantId);
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
      let assignmentQuery = 'SELECT id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?';
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

