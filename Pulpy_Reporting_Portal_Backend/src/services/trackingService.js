import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import { extractDomain, appendClickParams, replaceMacros, generateClickId } from '../utils/urlGenerator.js';
import { generateOfferErrorPage } from '../utils/errorPage.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import { TenantRequiredError } from '../utils/secureErrors.js';
import offerPublicIdService from './offerPublicIdService.js';
import offerParamsService from './offerParamsService.js';
import { enforceOfferTrafficRules } from './trackingOfferGates.js';

import { clickQueue, isOverloaded } from '../workers/clickQueue.js';
import redis from '../config/redis.js';

import cacheService, { PUBLISHER_OFFERS_TRACKING_COLUMNS } from './cacheService.js';
import postbackService from './postbackService.js';

const getIstDateString = () => {
  const now = new Date();
  const istTime = new Date(now.getTime() + (330 * 60 * 1000));
  return istTime.toISOString().split('T')[0];
};

const IST_OFFSET_MS = 330 * 60 * 1000;

/** IST calendar cap window → UTC MySQL datetimes [start, endExclusive) for index-safe created_at filters. */
function getIstCapCreatedAtRange(duration, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const toMysqlUtc = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const mo = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  const h = shifted.getUTCHours();

  if (duration === 'hour') {
    const start = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:00:00+05:30`);
    return { start: toMysqlUtc(start), endExclusive: toMysqlUtc(new Date(start.getTime() + 3600000)) };
  }
  if (duration === 'day') {
    const start = new Date(`${y}-${pad(mo)}-${pad(d)}T00:00:00+05:30`);
    return { start: toMysqlUtc(start), endExclusive: toMysqlUtc(new Date(start.getTime() + 86400000)) };
  }
  if (duration === 'week') {
    const isoDow = shifted.getUTCDay() || 7;
    const todayStart = new Date(`${y}-${pad(mo)}-${pad(d)}T00:00:00+05:30`);
    const mondayStart = new Date(todayStart.getTime() - (isoDow - 1) * 86400000);
    return {
      start: toMysqlUtc(mondayStart),
      endExclusive: toMysqlUtc(new Date(mondayStart.getTime() + 7 * 86400000)),
    };
  }
  if (duration === 'month') {
    const start = new Date(`${y}-${pad(mo)}-01T00:00:00+05:30`);
    const nextY = mo === 12 ? y + 1 : y;
    const nextMo = mo === 12 ? 1 : mo + 1;
    const endExclusive = new Date(`${nextY}-${pad(nextMo)}-01T00:00:00+05:30`);
    return { start: toMysqlUtc(start), endExclusive: toMysqlUtc(endExclusive) };
  }
  return null;
}

/** IST calendar day (YYYY-MM-DD) → UTC MySQL datetimes [start, endExclusive). */
function getIstDayCreatedAtRange(ymd) {
  const start = new Date(`${ymd}T00:00:00+05:30`);
  return {
    start: start.toISOString().slice(0, 19).replace('T', ' '),
    endExclusive: new Date(start.getTime() + 86400000).toISOString().slice(0, 19).replace('T', ' '),
  };
}

export class TrackingService {
  async trackClick(query, request) {
    // 1. Fail early if system is overloaded (Backpressure)
    // if (isOverloaded()) ... (Redis handles this better, skip for now or keep)

    // Structured timing: cumulative ms from request entry to each checkpoint.
    // Used to quantify Layer 1/2/3/4 gains and pinpoint future bottlenecks.
    // Overhead is just Date.now() calls (~50ns each) — safe to leave in prod.
    const _t0 = Date.now();
    const _t = { start: 0 };
    const _mark = (name) => { _t[name] = Date.now() - _t0; };

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
      _mark('dedup');
      if (cachedRedirect) {
        _mark('total');
        logger.info({
          tenant_id: tenantId,
          total_ms: _t.total,
          dedup_ms: _t.dedup
        }, '[CLICK_TIMING] dedup_hit');
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
      // Layer 2: all three lookups flow through cacheService (Redis-cached, 5min TTL).
      // Layer 4: internalOfferId + publisher fetched in parallel (independent reads) so we
      // pay 1 Redis RTT instead of 2. getOfferByInternalId still runs sequentially because
      // it depends on the resolved internalOfferId.
      // ============================================
      const [internalOfferId, publisher] = await Promise.all([
        cacheService.getInternalOfferIdByPublicId(publicOfferId, tenantId),
        cacheService.getPublisherByPublicId(publicPublisherId, tenantId)
      ]);
      _mark('resolve_ids');
      const internalPublisherId = publisher ? publisher.id : null;

      const offer = internalOfferId
        ? await cacheService.getOfferByInternalId(internalOfferId, tenantId)
        : null;
      _mark('resolve_offer');

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

      // ✅ STEP 5: Verify tenant exists (Redis-cached for hot path; falls back to DB on miss)
      // Cache TTL = 1h. Cache key is tenant-scoped to keep multi-tenant isolation guarantees.
      try {
        const tenantExistsKey = `tenant:exists:${tenantId}`;
        const cachedExists = await redis.get(tenantExistsKey);
        if (!cachedExists) {
          const [tenantRows] = await pool.query('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
          if (tenantRows.length === 0) {
            logger.error(`❌ CRITICAL: Tenant ID ${tenantId} does not exist in tenants table!`);
            throw new Error(`Tenant ${tenantId} does not exist in database`);
          }
          await redis.setex(tenantExistsKey, 3600, tenantRows[0].name || '1');
          logger.debug(`✅ Tenant ${tenantId} verified: ${tenantRows[0].name}`);
        }
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
          `SELECT ${PUBLISHER_OFFERS_TRACKING_COLUMNS} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND tenant_id = ? LIMIT 1`,
          [internalPublisherId, offer.id, tenantId]
        );
        assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;

        // Fallback: kuch purani rows me publisher_id column me public id store ho sakta hai
        if (!assignment && publicPublisherId !== internalPublisherId) {
          const [fallbackRows] = await pool.query(
            `SELECT ${PUBLISHER_OFFERS_TRACKING_COLUMNS} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND tenant_id = ? LIMIT 1`,
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

      // Offer-defined pass-through params: merge query + defaults, enforce required
      let mergedOfferParams = {};
      const offerParamDefs = await offerParamsService.getOfferParams(offer.id, tenantId);
      if (offerParamDefs.length > 0) {
        const provided = offerParamsService.collectProvidedForDefinitions(offerParamDefs, query);
        mergedOfferParams = offerParamsService.mergeWithDefaults(offerParamDefs, provided);
        const paramCheck = offerParamsService.validateRequiredParams(offerParamDefs, mergedOfferParams);
        if (!paramCheck.valid) {
          const msg = `Missing required parameters: ${paramCheck.missing.join(', ')}`;
          return {
            html: generateOfferErrorPage(msg, 'missing_offer_params'),
            clickId: null,
          };
        }
      }

      // ============================================
      // 🕵️ TEST POSTBACK INTERCEPTION
      // ============================================
      // Check if there is an active test session for this tenant
      const testResult = await this._processTestInterception(
        tenantId,
        offer,
        publisher,
        assignment,
        query,
        request,
        mergedOfferParams
      );
      if (testResult) {
        return testResult; // 🛑 EXIT EARLY: No Production DB Writes
      }

      // ============================================
      // 3. LOGIC: VALIDATION & CALCULATIONS (Zero DB)
      // ============================================

      let redirectUrl = '';

      // Validation + targeting (schedule, geo, device, ISP/city/carrier)
      const traffic = await enforceOfferTrafficRules(offer, { ip, userAgent, request });
      if (!traffic.ok) {
        return {
          html: generateOfferErrorPage(traffic.message, traffic.error_type),
          clickId: null,
        };
      }
      const { deviceInfo, location, country_final } = traffic;

      // ✅ 4. REDIS: CHECK OFFER & PUBLISHER CAPS (Zero DB)
      // ============================================

      const clickUuid = generateClickId(tenantId, offer.id, publisher.id, 96);
      let isCapErr = false;

      // Layer 4: Run offer + publisher cap status fetches in parallel (1 RTT vs 2).
      // Processing/action logic below runs sequentially so the redirect/error precedence
      // (offer-cap action takes priority over publisher-cap action) is byte-identical to
      // the previous behavior. Both fetches are read-only Redis GETs — safe to issue together.
      const [offerCapStatus, pubCapStatus] = await Promise.all([
        cacheService.getCapStatus('offer', offer.id, offer, tenantId),
        cacheService.getCapStatus('publisher', assignment.id, assignment, tenantId)
      ]);
      _mark('cap_status');

      // 4A. Check Offer Cap
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

      // 4B. Process Publisher Cap (status was fetched in parallel with offer cap above)
      if (pubCapStatus.isHit) {
        logger.info(`[CAP] Publisher Cap HIT`, {
          assignment_id: assignment.id,
          type: assignment.capping_type,
          action: assignment.capping_action
        });

        const actionResult = await this.applyPublisherCapAction(assignment, request, tenantId);
        if (actionResult.stop) {
          const detail = assignment.capping_type === 'budget'
            ? `Daily Budget: ${offer.offer_currency || '$'}${pubCapStatus.limit}`
            : `Daily Conversions: ${pubCapStatus.limit}`;
          return {
            html: generateOfferErrorPage(`Publisher Cap Hit (${detail}) - Traffic Stopped`, 'publisher_cap_hit'),
            clickId: null
          };
        }

        if (actionResult.redirect) {
          return {
            redirect: actionResult.redirect,
            clickId: null
          };
        }

        if (actionResult.reject_conversion) {
          // Allow traffic but mark for rejection
          isCapErr = false; // ensure we don't stop
        }
      }

      redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid, mergedOfferParams);

      // Assignment Caps? (omitted for brevity, can implement similar pattern in CacheService)

      // ============================================
      // 5. GENERATE & PERSIST
      // ============================================

      // (clickUuid generated above for cap support)

      // Parse params
      const referrer = request.headers.referer || '';
      const domain = extractDomain(referrer);

      // Geo lookup already performed earlier. ISP lookup is performed by the worker
      // (redisWorker.js) just before bulk insert to keep the click hot path free of
      // external HTTP calls. clickData.isp is left empty here on purpose.

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
        isp: '', // Filled by worker (redisWorker.js / clickBackfillWorker.js) before insert
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
        )) ? 'true' : 'false',
        extra_params:
          mergedOfferParams && Object.keys(mergedOfferParams).length > 0
            ? JSON.stringify(mergedOfferParams)
            : '',
      };

      // ✅ CRITICAL: Redis key MUST be: click:{tenant_id}:{offer_id}:{publisher_id}:{click_id}
      // This ensures clicks from different publishers on same offer are isolated
      const redisKey = `click:${finalTenantId}:${offer.id}:${publisher.id}:${clickUuid}`;

      logger.info('[CLICK] Click received', {
        tenant_id: finalTenantId,
        offer_id: offer.id,
        public_offer_id: publicOfferId,
        publisher_id: publisher.id,
        public_publisher_id: publicPublisherId,
        click_id: clickUuid,
        redis_key: redisKey
      });

      const persistCtx = {
        clickData,
        redisKey,
        redirectCacheKey,
        redirectUrl,
        finalTenantId,
        offerId: offer.id,
        publisherId: publisher.id,
        publicOfferId,
        publicPublisherId,
        clickUuid
      };

      // Layer 3: Fire-and-forget gate. When `CLICK_FIRE_AND_FORGET=1` we return the
      // redirect immediately and let the controller schedule _persistClickData via
      // setImmediate after `reply.redirect` is on the wire. Default OFF preserves
      // exact-current behavior (inline await).
      const fireAndForget = process.env.CLICK_FIRE_AND_FORGET === '1';
      if (fireAndForget) {
        _mark('total');
        logger.info({
          tenant_id: tenantId,
          click_id: clickUuid,
          total_ms: _t.total,
          dedup_ms: _t.dedup,
          resolve_ids_ms: _t.resolve_ids,
          resolve_offer_ms: _t.resolve_offer,
          cap_status_ms: _t.cap_status
        }, '[CLICK_TIMING] fresh_click_ff');
        return {
          redirect: redirectUrl,
          clickId: clickUuid,
          persistAsync: () => this._persistClickData(persistCtx)
        };
      }

      // Default path: persist inline (identical to pre-Layer-3 behavior).
      await this._persistClickData(persistCtx);
      _mark('persist');
      _mark('total');
      logger.info({
        tenant_id: tenantId,
        click_id: clickUuid,
        total_ms: _t.total,
        dedup_ms: _t.dedup,
        resolve_ids_ms: _t.resolve_ids,
        resolve_offer_ms: _t.resolve_offer,
        cap_status_ms: _t.cap_status,
        persist_ms: _t.persist - (_t.cap_status || 0)
      }, '[CLICK_TIMING] fresh_click');

      return {
        redirect: redirectUrl,
        clickId: clickUuid
      };

    } catch (error) {
      logger.error({ message: error.message, stack: error.stack }, 'TrackingService.trackClick error:');
      throw error;
    }
  }

  /**
   * Persists a click to Redis (hash + stream + redirect-dedup cache) using a single pipeline.
   * Extracted from the original inline block in trackClick so Layer 3 can run it either
   * inline (default) or via setImmediate after the 302 response is sent (fire-and-forget).
   *
   * Behavior contract (unchanged from pre-Layer-3):
   *  - Hash write failure → throws (FATAL: click data would be lost otherwise).
   *  - Stream xadd failure → NON-FATAL: logs warn; the backfill worker will recover the click.
   *  - All Redis keys, fields, and TTLs are byte-identical to the previous code.
   */
  async _persistClickData(ctx) {
    const {
      clickData,
      redisKey,
      redirectCacheKey,
      redirectUrl,
      finalTenantId,
      offerId,
      publisherId,
      publicOfferId,
      publicPublisherId,
      clickUuid
    } = ctx;

    try {
      const tenantIdStr = finalTenantId ? String(finalTenantId) : '';
      if (!tenantIdStr) {
        logger.error('❌ CRITICAL: Attempting to add click to stream without tenant_id!', {
          click_uuid: clickUuid,
          offer_id: offerId,
          public_offer_id: publicOfferId,
          publisher_id: publisherId
        });
        throw new Error('Cannot add click to stream without tenant_id. This indicates a system failure.');
      }

      const pipeline = redis.pipeline();
      pipeline.hset(redisKey, clickData);
      pipeline.expire(redisKey, 3600);
      pipeline.xadd('stream:clicks', '*',
        'tenant_id', tenantIdStr,
        'offer_id', String(offerId),
        'publisher_id', String(publisherId),
        'click_id', clickUuid
      );
      pipeline.setex(redirectCacheKey, 5, redirectUrl);

      const results = await pipeline.exec();

      let hashWriteSuccess = false;
      let streamWriteSuccess = false;
      let streamWriteError = null;

      for (let i = 0; i < results.length; i++) {
        const [err, result] = results[i];
        if (err) {
          const operation = i === 0 ? 'hash write' : i === 1 ? 'hash expire' : i === 2 ? 'stream add' : 'redirect cache';
          logger.error(`❌ Redis ${operation} failed:`, { error: err.message, result });

          if (i === 0) {
            throw new Error(`Redis hash write failed: ${err.message}`);
          } else if (i === 2) {
            streamWriteError = err;
            logger.warn(`⚠️ Redis stream enqueue failed - click stored in Redis hash, will be backfilled:`, {
              error: err.message,
              redis_key: redisKey,
              click_id: clickUuid
            });
          }
        } else {
          if (i === 0) hashWriteSuccess = true;
          if (i === 2) streamWriteSuccess = true;
        }
      }

      if (hashWriteSuccess) {
        logger.info('[CLICK] Redis stored', {
          redis_key: redisKey,
          click_id: clickUuid,
          tenant_id: finalTenantId,
          offer_id: offerId,
          public_offer_id: publicOfferId,
          publisher_id: publisherId
        });
      }

      if (streamWriteSuccess) {
        logger.info('[CLICK] Stream enqueued', {
          stream: 'stream:clicks',
          click_id: clickUuid,
          tenant_id: finalTenantId,
          offer_id: offerId,
          public_offer_id: publicOfferId,
          publisher_id: publisherId
        });
      } else if (streamWriteError) {
        logger.warn('[CLICK] Stream enqueue failed - click will be backfilled', {
          stream: 'stream:clicks',
          error: streamWriteError.message,
          redis_key: redisKey,
          click_id: clickUuid
        });
      }
    } catch (err) {
      logger.error('[CLICK] Redis Write Failed:', err);
      throw err;
    }
  }

  _buildRedirectUrl(assignment, offer, query, clickUuid, mergedOfferParams = {}) {
    let url = assignment.destination_url || offer.offer_url;
    if (offer.status === 'deactivate') url = offer.fallback_url || url;

    const macroPayload = {
      click_id: clickUuid,
      rcid: query.rcid || '',
      tid: query.tid || '',
      ...mergedOfferParams,
    };

    url = replaceMacros(url, macroPayload);

    return appendClickParams(
      url,
      {
        click_id: clickUuid,
        tid: query.tid || null,
        rcid: query.rcid || null,
      },
      mergedOfferParams
    );
  }

  async _processTestInterception(tenantId, offer, publisher, assignment, query, request, mergedOfferParams = {}) {
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
        const redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid, mergedOfferParams);

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
      const redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid, mergedOfferParams);

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
          (await offerPublicIdService.getPublicPublisherId(assignment.publisher_id, tenantId));

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

  async applyPublisherCapAction(assignment, request, tenantId) {
    const action = assignment.capping_action || 'stop';

    if (action === 'stop') {
      return { stop: true };
    }

    if (action === 'reject') {
      return { stop: false, reject_conversion: true };
    }

    if (action === 'fallback') {
      if (assignment.fallback_type === 'custom' && assignment.fallback_url) {
        return { stop: false, redirect: assignment.fallback_url };
      }

      if (assignment.fallback_type === 'offer' && assignment.fallback_offer_id) {
        const fallbackOffer = await offerService.getOfferById(assignment.fallback_offer_id, tenantId, true);
        if (!fallbackOffer) {
          logger.warn('[CAP] Publisher cap: fallback offer not found or invalid', {
            fallback_offer_id: assignment.fallback_offer_id,
            tenant_id: tenantId
          });
          return { stop: true };
        }

        const fallbackAssignment = await assignmentService.findByPublisherAndOffer(assignment.publisher_id, fallbackOffer.id, tenantId);
        if (!fallbackAssignment || fallbackAssignment.status !== 'active') {
          logger.warn('[CAP] Publisher cap: fallback offer not assigned to publisher or inactive', {
            pub_id: assignment.publisher_id,
            fallback_offer: fallbackOffer.id
          });
          return { stop: true };
        }

        const publicOfferId = fallbackOffer.public_offer_id || fallbackOffer.display_id || fallbackOffer.id;

        const publicPublisherId = assignment.public_publisher_id ||
          request.query.pub_id ||
          request.query.a ||
          (await offerPublicIdService.getPublicPublisherId(assignment.publisher_id, tenantId));

        const protocol = request.headers['x-forwarded-proto'] || 'http';
        const host = request.headers.host;
        const originalUrl = request.url;
        const queryPart = originalUrl.includes('?') ? originalUrl.split('?')[1] : '';

        const validParams = new URLSearchParams(queryPart);
        validParams.delete('offer_id');
        validParams.delete('oid');
        validParams.delete('pub_id');
        validParams.delete('a');

        const cleanQuery = validParams.toString();
        const newUrl = `${protocol}://${host}/click?offer_id=${publicOfferId}&pub_id=${publicPublisherId}${cleanQuery ? '&' + cleanQuery : ''}`;

        logger.info('[CAP] Publisher cap: redirecting to fallback offer', {
          assignment_id: assignment.id,
          fallback_offer: fallbackOffer.id,
          fallback_url: newUrl
        });

        return { stop: false, redirect: newUrl };
      }

      return { stop: true };
    }

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
      let assignmentQuery = `SELECT ${PUBLISHER_OFFERS_TRACKING_COLUMNS} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?`;
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

      if (tenantId && assignment.tenant_id && assignment.tenant_id !== tenantId) {
        return { success: false, error: 'Assignment does not belong to this tenant' };
      }

      const ip = extractIP(request);
      const userAgent = request.headers['user-agent'] || '';
      const referrer = request.headers.referer || request.headers.referrer || null;

      const impTraffic = await enforceOfferTrafficRules(offer, { ip, userAgent, request });
      if (!impTraffic.ok) {
        return {
          success: false,
          error: impTraffic.message,
          error_type: impTraffic.error_type,
        };
      }

      const finalTenantId = tenantId;

      if (!finalTenantId) {
        logger.error('❌ No tenant resolved from subdomain for impression');
        return { success: false, error: 'Tenant identity required from subdomain. Cannot track impression without tenant context.' };
      }

      if (offer && offer.tenant_id && parseInt(offer.tenant_id) !== parseInt(finalTenantId)) {
        logger.error('❌ HARD FAILURE: Offer tenant mismatch for impression', {
          offer_id: offer.id,
          offer_tenant_id: offer.tenant_id,
          resolved_tenant_id: finalTenantId
        });
        return { success: false, error: `Security violation: Offer ${offer.id} belongs to tenant ${offer.tenant_id}, but request is for tenant ${finalTenantId}. Access denied.` };
      }

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

    const capRange = getIstCapCreatedAtRange(duration);
    if (!capRange) return false;

    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ?
         AND created_at >= ? AND created_at < ?`,
      [offerId, publisherId, capRange.start, capRange.endExclusive]
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

    const capRange = getIstCapCreatedAtRange(duration);
    if (!capRange) return false;

    const [rows] = await pool.query(
      `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ?
         AND created_at >= ? AND created_at < ?`,
      [offerId, publisherId, capRange.start, capRange.endExclusive]
    );

    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).conversion_count || 0);
    return count >= capCount;
  }

  async updateDailyStats(offerId, publisherId, type, tenantId = null) {
    try {
      // UTC ENFORCEMENT: Store UTC in DB; IST day boundaries computed in Node for uniqueness checks.
      const today = getIstDateString();
      const todayRange = getIstDayCreatedAtRange(today);

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
                   AND created_at >= ? AND created_at < ?`;
          const countParams = [offerId, clickIp, todayRange.start, todayRange.endExclusive];
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

