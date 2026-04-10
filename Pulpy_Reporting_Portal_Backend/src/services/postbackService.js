import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import { replaceMacros, generateClickId } from '../utils/urlGenerator.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import https from 'https';
import http from 'http';
import crypto from 'crypto';

import redis from '../config/redis.js';
import { AppError } from '../utils/AppError.js';

// ---------- End module-level helpers (now class methods below) ----------

const CLICK_EXPIRY_WINDOW_MS = 1 * 60 * 60 * 1000;
const CLICK_EXPIRED_STATUS = 'click_expired';
const APPROVAL_ELIGIBLE_STATUSES = new Set(['approved', 'pending']);
const DETERMINISTIC_APPROVAL_VERSION = 'v2';
const BOOTSTRAP_APPROVAL_TTL_SECONDS = 8 * 24 * 60 * 60;
const APPROVAL_CONTROL_TTL_SECONDS = 8 * 24 * 60 * 60;
const APPROVAL_TOLERANCE_PERCENT = Number(process.env.APPROVAL_TOLERANCE_PERCENT || 2);

const APPROVAL_CONTROL_LUA = `
local totalKey = KEYS[1]
local approvedKey = KEYS[2]
local percentageKey = KEYS[3]

local percentageArg = ARGV[1]
local toleranceArg = ARGV[2]
local bucketArg = ARGV[3]
local ttlArg = ARGV[4]

if not percentageArg then
  return redis.error_reply('percentage argument required')
end
if not toleranceArg then
  return redis.error_reply('tolerance argument required')
end
if not bucketArg then
  return redis.error_reply('bucket argument required')
end
if not ttlArg then
  return redis.error_reply('ttl argument required')
end

local percentage = tonumber(percentageArg)
local tolerance = tonumber(toleranceArg)
local bucket = tonumber(bucketArg)
local ttl = tonumber(ttlArg)

if not percentage then
  return redis.error_reply('percentage must be numeric')
end
if not tolerance then
  return redis.error_reply('tolerance must be numeric')
end
if not bucket then
  return redis.error_reply('bucket must be numeric')
end
if not ttl then
  return redis.error_reply('ttl must be numeric')
end

if percentage < 0 then percentage = 0 end
if percentage > 100 then percentage = 100 end
if tolerance < 0 then tolerance = 0 end
if bucket < 0 then bucket = 0 end
if bucket > 9999 then bucket = 9999 end

local storedPercentage = redis.call('GET', percentageKey)
if (not storedPercentage) or storedPercentage ~= percentageArg then
  redis.call('DEL', totalKey)
  redis.call('DEL', approvedKey)
  redis.call('SET', percentageKey, percentageArg, 'EX', ttl)
end

local total = redis.call('INCR', totalKey)
redis.call('EXPIRE', totalKey, ttl)
redis.call('EXPIRE', approvedKey, ttl)
redis.call('EXPIRE', percentageKey, ttl)

local approvedRaw = redis.call('GET', approvedKey)
local approved = 0
if approvedRaw then
  approved = tonumber(approvedRaw) or 0
end

local targetApproved = math.floor((percentage * total) / 100)
local maxPercent = percentage + tolerance
if maxPercent > 100 then maxPercent = 100 end
local maxAllowed = math.ceil((maxPercent * total) / 100)

local status = 'pending'
if percentage >= 100 then
  if approved < maxAllowed then
    approved = redis.call('INCR', approvedKey)
    status = 'approved'
  end
elseif percentage > 0 then
  if approved >= maxAllowed then
    status = 'pending'
  elseif approved < targetApproved then
    approved = redis.call('INCR', approvedKey)
    status = 'approved'
  else
    local threshold = math.floor((percentage * 100) + 0.5)
    if bucket < threshold and (approved + 1) <= maxAllowed then
      approved = redis.call('INCR', approvedKey)
      status = 'approved'
    end
  end
end

redis.call('EXPIRE', approvedKey, ttl)

return {
  status,
  tostring(total),
  tostring(approved),
  tostring(targetApproved),
  tostring(maxAllowed),
  tostring(percentage),
  tostring(tolerance)
}
`;

if (typeof redis.approvalControl !== 'function') {
  redis.defineCommand('approvalControl', {
    numberOfKeys: 3,
    lua: APPROVAL_CONTROL_LUA,
  });
}

const generateConversionUuid = (tenantId, offerId, publisherId) => {
  return generateClickId(tenantId || 0, offerId || 0, publisherId || 0, 96);
};

const isClickOlderThan1Hour = (clickTimeValue) => {
  if (!clickTimeValue) return false;
  const clickTime = new Date(clickTimeValue).getTime();
  if (!Number.isFinite(clickTime)) return false;
  return (Date.now() - clickTime) >= CLICK_EXPIRY_WINDOW_MS;
};

const resolveExpiredRevenueAmount = async ({ amount, offerId, tenantId }) => {
  const parsedAmount = Number(amount);
  if (Number.isFinite(parsedAmount) && parsedAmount > 0) return parsedAmount;

  try {
    const offer = await this._getOfferByInternalId(offerId, tenantId);
    const advertiserAmount = Number(offer?.advertiser_amount);
    if (Number.isFinite(advertiserAmount) && advertiserAmount > 0) return advertiserAmount;
  } catch (error) {
    logger.warn('Failed to resolve expired conversion amount from offer; defaulting to 0', {
      offerId,
      tenantId,
      error: error.message
    });
  }

  return 0;
};

const normalizeConversionStatus = (rawStatus) => {
  const normalized = String(rawStatus || 'approved').trim().toLowerCase();
  if (normalized === 'expired') return CLICK_EXPIRED_STATUS;
  if (normalized === CLICK_EXPIRED_STATUS) return CLICK_EXPIRED_STATUS;
  if (normalized === 'approved' || normalized === 'pending' || normalized === 'rejected' || normalized === 'rejected_cap') {
    return normalized;
  }
  return 'approved';
};

const buildDeterministicApprovalSeed = ({ tenantId, offerId, publisherId, assignmentId, decisionKey }) => {
  const normalizedDecisionKey = String(decisionKey || '').trim();
  if (!normalizedDecisionKey) {
    throw new Error('Missing decision key for deterministic approval');
  }

  return [
    DETERMINISTIC_APPROVAL_VERSION,
    String(tenantId ?? ''),
    String(offerId ?? ''),
    String(publisherId ?? ''),
    String(assignmentId ?? ''),
    normalizedDecisionKey
  ].join(':');
};

const getDeterministicApprovalStatusFromSeed = (seed, percentage) => {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const bucketBase = parseInt(hash.slice(0, 8), 16);
  const bucket = bucketBase % 10000; // 0..9999
  const threshold = Math.round(percentage * 100); // 0.01% granularity
  return bucket < threshold ? 'approved' : 'pending';
};

const getDeterministicBucketFromSeed = (seed) => {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const bucketBase = parseInt(hash.slice(0, 8), 16);
  return bucketBase % 10000;
};

const getIstDateKey = () => {
  const now = new Date();
  const istTime = new Date(now.getTime() + (330 * 60 * 1000));
  return istTime.toISOString().slice(0, 10);
};

const buildBootstrapApprovalKey = ({ tenantId, offerId, publisherId, assignmentId, dateKey }) => {
  return [
    'approval_bootstrap',
    DETERMINISTIC_APPROVAL_VERSION,
    String(tenantId ?? ''),
    String(offerId ?? ''),
    String(publisherId ?? ''),
    String(assignmentId ?? ''),
    dateKey
  ].join(':');
};

const buildApprovalControlKeys = ({ tenantId, offerId, publisherId, assignmentId, dateKey }) => {
  const base = [
    'approval_control',
    DETERMINISTIC_APPROVAL_VERSION,
    String(tenantId ?? ''),
    String(offerId ?? ''),
    String(publisherId ?? ''),
    String(assignmentId ?? ''),
    dateKey
  ].join(':');

  return {
    totalKey: `${base}:total`,
    approvedKey: `${base}:approved`,
    percentageKey: `${base}:percentage`,
  };
};

export class PostbackService {
  constructor(postbackRepository) {
    this.postbackRepository = postbackRepository;
  }

  // ---------- Private helper methods ----------
  async _getOfferByInternalId(offerId, tenantId) {
    return await this.postbackRepository.getOfferByInternalId({ offerId, tenantId });
  }

  async _getAssignmentByInternalId(id, tenantId) {
    return await this.postbackRepository.getAssignmentByInternalId({ id, tenantId });
  }

  async _getPublisherByInternalId(id, tenantId) {
    return await this.postbackRepository.getPublisherByInternalId({ id, tenantId });
  }

  _this._checkOfferValidity(offer) {
    if (!offer) return { valid: false, message: 'Offer not found', error_type: 'offer_not_found' };
    if (offer.status !== 'live') {
      return { valid: false, message: `Offer is not live. Current status: ${offer.status}.`, error_type: 'offer_not_live' };
    }
    const now = new Date();
    if (offer.end_date) {
      const endDate = new Date(offer.end_date);
      endDate.setHours(23, 59, 59, 999);
      if (now > endDate) return { valid: false, message: `Offer has expired.`, error_type: 'offer_expired' };
    }
    if (offer.start_date) {
      const startDate = new Date(offer.start_date);
      startDate.setHours(0, 0, 0, 0);
      if (now < startDate) return { valid: false, message: `Offer has not started yet.`, error_type: 'offer_not_started' };
    }
    return { valid: true, message: 'Offer is valid and active', error_type: null };
  }
  // ---------- End private helpers ----------
  async determineDeterministicApprovalStatus({
    tenantId,
    offerId,
    publisherId,
    assignmentId,
    decisionKey,
    approvalPercentage,
    fallbackStatus = 'pending'
  }) {
    if (approvalPercentage === null || approvalPercentage === undefined) {
      return fallbackStatus;
    }

    let numericPercentage = Number(approvalPercentage);
    if (!Number.isFinite(numericPercentage)) {
      logger.warn('Invalid approval percentage provided; falling back to pending', {
        tenantId,
        offerId,
        publisherId,
        assignmentId,
        approvalPercentage
      });
      return fallbackStatus;
    }

    if (numericPercentage < 0) numericPercentage = 0;
    if (numericPercentage > 100) numericPercentage = 100;
    if (numericPercentage <= 0) return 'pending';
    if (numericPercentage >= 100) return 'approved';

    try {
      // Bootstrap trust signal: first eligible conversion per assignment/day is approved.
      // Applies only when percentage is in mixed mode (0 < p < 100).
      const dateKey = getIstDateKey();
      const bootstrapKey = buildBootstrapApprovalKey({
        tenantId,
        offerId,
        publisherId,
        assignmentId,
        dateKey
      });

      const bootstrapClaim = await redis.set(bootstrapKey, '1', 'EX', BOOTSTRAP_APPROVAL_TTL_SECONDS, 'NX');
      if (bootstrapClaim === 'OK') {
        return 'approved';
      }

      const seed = buildDeterministicApprovalSeed({
        tenantId,
        offerId,
        publisherId,
        assignmentId,
        decisionKey
      });
      const bucket = getDeterministicBucketFromSeed(seed);
      const controlKeys = buildApprovalControlKeys({
        tenantId,
        offerId,
        publisherId,
        assignmentId,
        dateKey
      });

      const result = await redis.approvalControl(
        controlKeys.totalKey,
        controlKeys.approvedKey,
        controlKeys.percentageKey,
        numericPercentage.toString(),
        String(APPROVAL_TOLERANCE_PERCENT),
        String(bucket),
        String(APPROVAL_CONTROL_TTL_SECONDS)
      );

      if (!Array.isArray(result) || result.length < 1) {
        logger.warn('Unexpected approvalControl response; falling back to seed decision', {
          tenantId,
          offerId,
          publisherId,
          assignmentId,
          decisionKey,
          result
        });
        return getDeterministicApprovalStatusFromSeed(seed, numericPercentage);
      }

      return result[0] === 'approved' ? 'approved' : 'pending';
    } catch (error) {
      logger.error('Failed to evaluate deterministic approval status', {
        error: error.message,
        tenantId,
        offerId,
        publisherId,
        assignmentId,
        decisionKey
      });
      return fallbackStatus;
    }
  }

  async processPostback(query, request) {
    try {
      const { click_id, rcid, amount, status = 'approved' } = query;
      const normalizedIncomingStatus = normalizeConversionStatus(status);

      if (!click_id && !rcid) {
        throw new Error('Either click_id or rcid is required');
      }

      // ============================================
      // REDIS FIRST CHECK
      // ============================================
      // Check if click exists in Redis (pending DB insert)
      // ✅ CRITICAL: Try new key format first, then fallback to old format
      if (click_id) {
        let redisClick = null;
        let redisKey = null;

        // ✅ CRITICAL: Get tenant_id from request first (for new key format)
        const tenantId = getTenantIdFromRequest(request);

        // Strategy 1: If we have tenant_id, try to get click from DB first to get offer_id/publisher_id
        // ✅ FAST PATH: Use 2-second timeout for initial lookup to prevent blocking
        if (tenantId) {
          try {
            const dbClick = await this.postbackRepository.getClickByUuidOrTid({ clickId: click_id, tenantId });
            if (dbClick) {
              // Try new format: click:{tenant_id}:{offer_id}:{publisher_id}:{click_id}
              redisKey = `click:${dbClick.tenant_id}:${dbClick.offer_id}:${dbClick.publisher_id}:${click_id}`;
              redisClick = await redis.hgetall(redisKey);
            }
          } catch (dbErr) {
            // DB lookup failed - continue to Redis lookup
            logger.debug('Could not lookup click in DB, trying Redis directly');
          }
        }

        // Strategy 2: If click not found with new format, try old format (backwards compatibility)
        if (!redisClick || !redisClick.offer_id) {
          redisKey = `click:${click_id}`;
          redisClick = await redis.hgetall(redisKey);
        }

        // Strategy 3: If still not found and we have tenant_id, try pattern scan (last resort)
        if ((!redisClick || !redisClick.offer_id) && tenantId) {
          try {
            // Bound SCAN work to avoid controller-level timeout for old clicks.
            // Scan for pattern: click:*:*:*:${click_id}
            let cursor = 0;
            let found = false;
            let iterations = 0;
            const maxIterations = 5;
            const scanStart = Date.now();
            const maxScanDurationMs = 600;
            do {
              const [newCursor, keys] = await redis.scan(
                cursor,
                'MATCH', `click:*:*:*:${click_id}`,
                'COUNT', 100
              );
              cursor = parseInt(newCursor);
              iterations += 1;

              if (keys.length > 0) {
                // Try first matching key
                redisKey = keys[0];
                redisClick = await redis.hgetall(redisKey);
                if (redisClick && redisClick.offer_id) {
                  found = true;
                  break;
                }
              }
            } while (
              cursor !== 0 &&
              !found &&
              iterations < maxIterations &&
              (Date.now() - scanStart) < maxScanDurationMs
            );

            if (!found && cursor !== 0) {
              logger.debug('Redis SCAN bounded before completion; falling back to DB path', {
                click_id,
                iterations,
                elapsed_ms: Date.now() - scanStart
              });
            }
          } catch (scanErr) {
            // Scan failed - log but continue
            logger.debug('Redis SCAN failed, continuing with fallback', scanErr);
          }
        }

        if (redisClick && redisClick.offer_id) {
          // Click found in Redis! Process conversion in Redis.
          logger.info('[POSTBACK] Redis path: processing conversion', { click_id, rcid });

          // 1. Rehydrate click data object
          const clickData = {
            ...redisClick,
            offer_id: parseInt(redisClick.offer_id),
            publisher_id: parseInt(redisClick.publisher_id),
            publisher_offer_id: parseInt(redisClick.publisher_offer_id || 0)
          };

          // 🔒 STRICT: Get tenant_id from subdomain (Host header) - EXCLUSIVE source
          const tenantId = getTenantIdFromRequest(request);
          if (!tenantId) {
            logger.error('❌ Postback rejected: No tenant subdomain', {
              host: request.headers.host,
              click_id: click_id,
              rcid: rcid
            });
            throw new Error('Tenant identity required from subdomain. Access via tenant subdomain (e.g., tenant1.domain.com/postback).');
          }

          logger.info('[POSTBACK] Tenant resolved from subdomain', {
            tenant_id: tenantId,
            click_id: click_id,
            rcid: rcid
          });

          const redisClickTimestamp = redisClick.created_at || redisClick.timestamp;
          if (isClickOlderThan1Hour(redisClickTimestamp)) {
            const expiredAmount = await resolveExpiredRevenueAmount({
              amount,
              offerId: clickData.offer_id,
              tenantId
            });
            const expiredConversionData = {
              click_uuid: click_id,
              offer_id: clickData.offer_id,
              publisher_id: clickData.publisher_id,
              publisher_offer_id: clickData.publisher_offer_id,
              tenant_id: tenantId,
              rcid: rcid || redisClick.rcid || uuidv4(),
              status: CLICK_EXPIRED_STATUS,
              amount: expiredAmount,
              payout: 0,
              ip: extractIP(request),
              timestamp: new Date().toISOString(),
              postback_payload: JSON.stringify({ query, headers: request.headers }),
              callback_url: '',
              tid: redisClick.tid || '',
              force_reject: redisClick.force_reject
            };

            await redis.setex(`conversion:${click_id}`, 900, JSON.stringify(expiredConversionData));
            await redis.xadd('stream:conversions', '*',
              'click_uuid', click_id,
              'timestamp', new Date().toISOString()
            );

            logger.info('⏰ Conversion rejected: click expired (Redis path)', {
              click_id,
              tenantId,
              click_timestamp: redisClickTimestamp
            });

            return {
              success: true,
              message: 'Click expired (older than 1 hour)',
              error_type: 'click_expired',
              status: CLICK_EXPIRED_STATUS,
              duplicate: false
            };
          }

          // 2. Validate Offer / Fetch Payout (in-file lookup by internal id)
          const offer = await this._getOfferByInternalId(clickData.offer_id, tenantId);
          if (!offer) throw new Error('Offer not found (Redis path)');

          // ✅ CRITICAL: Verify tenant ownership
          if (offer.tenant_id !== tenantId) {
            throw new Error('Offer does not belong to this tenant');
          }

          const offerValidation = this._checkOfferValidity(offer);
          if (!offerValidation.valid) {
            return { success: false, message: offerValidation.message, duplicate: false };
          }

          // 3. Get Assignment & Payout (in-file lookup by internal id)
          let assignment = null;
          if (clickData.publisher_offer_id) {
            assignment = await this._getAssignmentByInternalId(clickData.publisher_offer_id, tenantId);
          }

          // Fetch Publisher (in-file lookup by internal id)
          const publisher = await this._getPublisherByInternalId(clickData.publisher_id, tenantId);
          let offerPayout = parseFloat(offer.advertiser_amount);
          let payout = parseFloat(offer.affiliate_amount);
          if (assignment?.payout_override) payout = parseFloat(assignment.payout_override);
          const conversionAmount = amount ? parseFloat(amount) : offerPayout;
          logger.info({
            path: 'redis',
            click_id,
            rcid,
            tenantId,
            amount,
            status,
            conversion_amount: conversionAmount,
            offer_payout: offerPayout,
            payout: payout,
            publisher_id: clickData.publisher_id,
            assignment_id: assignment?.id ?? assignment?.internal_id
          }, '[POSTBACK] Redis path – Payout debug');
          // 4. Status Determination
          let finalStatus = normalizedIncomingStatus;
          if (
            APPROVAL_ELIGIBLE_STATUSES.has(finalStatus) &&
            assignment?.conversion_approval_percentage !== null &&
            assignment?.conversion_approval_percentage !== undefined
          ) {
            finalStatus = await this.determineDeterministicApprovalStatus({
              tenantId,
              offerId: clickData.offer_id,
              publisherId: clickData.publisher_id,
              assignmentId: assignment.internal_id ?? assignment.id,
              decisionKey: rcid || click_id || redisClick.rcid || redisClick.tid,
              approvalPercentage: assignment.conversion_approval_percentage,
              fallbackStatus: finalStatus
            });
          }

          // Resolve Callback URL
          const callbackUrl = assignment?.callback_url || publisher?.global_postback_url;

          // 5. Store Conversion in Redis - UTC ENFORCEMENT: Store UTC timestamp only
          // ✅ CRITICAL: Include tenant_id in conversion data
          const finalAmount = conversionAmount;
          const finalPayout = finalStatus === CLICK_EXPIRED_STATUS ? 0 : payout;
          const conversionData = {
            click_uuid: click_id,
            offer_id: clickData.offer_id,
            publisher_id: clickData.publisher_id,
            publisher_offer_id: clickData.publisher_offer_id,
            tenant_id: tenantId, // ✅ CRITICAL: Include tenant_id
            rcid: rcid || redisClick.rcid || uuidv4(),
            status: finalStatus,
            amount: finalAmount,
            payout: finalPayout,
            ip: extractIP(request),
            timestamp: new Date().toISOString(),
            postback_payload: JSON.stringify({ query, headers: request.headers }),
            callback_url: callbackUrl, // Pass to worker

            tid: redisClick.tid || '',  // Pass affiliate click ID
            force_reject: redisClick.force_reject // Pass reject intent from click time
          };

          // Save to Redis (Worker will pick this up)
          // Short TTL logic: 15 mins. Worker should process it by then. 
          await redis.setex(`conversion:${click_id}`, 900, JSON.stringify(conversionData));

          // ✅ NEW ARCHITECTURE: Push to Conversion Stream
          // This decouples conversion processing from click flushing
          await redis.xadd('stream:conversions', '*',
            'click_uuid', click_id,
            'timestamp', new Date().toISOString()
          );

          logger.info(`✅ Conversion Queued [Stream]: ${click_id}`);

          return {
            success: true,
            message: 'Conversion queued for processing',
            duplicate: false,
            note: 'Handled via independent conversion pipeline'
          };
        }
      }

      // NO REDIS MATCH? FALLBACK TO DB LOGIC BELOW...

      // 🔒 STRICT: Get tenant_id from subdomain (Host header) - EXCLUSIVE source
      const tenantId = getTenantIdFromRequest(request);

      if (!tenantId) {
        logger.error('❌ Postback rejected: No tenant subdomain', {
          host: request.headers.host,
          click_id: click_id,
          rcid: rcid
        });
        throw new Error('Tenant identity required from subdomain. Access via tenant subdomain (e.g., tenant1.domain.com/postback).');
      }

      // Find click if click_id provided (WITH tenant filtering)
      let click = null;
      if (click_id) {
        // RETRY LOGIC: Handle async queue lag (race condition)
        // ✅ REDUCED: Only 2 attempts (400ms total) to prevent timeout
        // If click expired in Redis (4 hours), it should be in DB by now
        let attempts = 0;
        const maxAttempts = 2; // Reduced from 5 to 2
        const retryDelay = 200; // 200ms between retries

        while (attempts < maxAttempts) {
          try {
            click = await this.postbackRepository.getClickByUuidOrTid({ clickId: click_id, tenantId });
            if (click) {
              // ✅ Validate click belongs to resolved tenant
              if (click.tenant_id && parseInt(click.tenant_id) !== parseInt(tenantId)) {
                logger.error('❌ HARD FAILURE: Click tenant mismatch', {
                  click_id: click_id,
                  click_tenant_id: click.tenant_id,
                  resolved_tenant_id: tenantId
                });
                throw new AppError(`Security violation: Click ${click_id} belongs to tenant ${click.tenant_id}, but request is for tenant ${tenantId}. Access denied.`, 403);
              }
              break; // Found it!
            }
          } catch (queryError) {
            if (queryError instanceof AppError) throw queryError;
            // If query timeout or DB error, log and continue to retry
            if (queryError.message.includes('timeout') || queryError.code === 'ETIMEDOUT') {
              logger.warn('Click lookup query timeout', {
                click_id,
                attempt: attempts + 1,
                error: queryError.message
              });
            } else {
              throw queryError;
            }
          }

          // Wait before retry
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            logger.debug(`Retrying click lookup (${attempts}/${maxAttempts})`, { click_id });
          }
        }

        if (!click) {
          // ✅ Click not found after retries - log and throw clear error
          logger.warn('Click not found in database', {
            click_id,
            tenant_id: tenantId,
            attempts: maxAttempts,
            note: 'Click may have expired in Redis (4h TTL) and not yet flushed to DB, or click_id is invalid'
          });
          throw new Error('Click not found. The click may have expired or is invalid.');
        }
      }

      // Catch DB errors to failover to Redis buffer
      try {
        if (!tenantId) {
          logger.error('❌ CRITICAL: No tenant_id after validation - system error');
          throw new Error('Tenant identity required from subdomain. This error indicates a system failure.');
        }

        if (click && click.tenant_id && parseInt(click.tenant_id) !== parseInt(tenantId)) {
          // ... error handling ...
          throw new Error(`Security violation: Click belongs to tenant ${click.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
        }
      } catch (validationErr) {
        throw validationErr;
        // Structural/Validation errors should fail hard. 
        // Only connection/timeout errors should trigger buffer.
      }

      // ... continue normal flow ...

      // REVISION: The prompt says "If DB busy/unreachable: Store conversion temporarily in Redis".
      // This refers to the moment we try to FIND the click in DB or INSERT the conversion.
      // If valid click found (or not needed due to postback without click_id?), we try to insert conversion.

      // I will implement a `safeQuery` style or wrap the Insert.
      // The current code structure is linear.
      // I will add a `catch` block to the main `processPostback` but it's already there.
      // I need to intercept DB Connection Errors specifically.

      // Logic:
      // 1. Try to find click in DB. If DB unavailable -> Buffer?
      //    If we can't verify click in DB, we don't know offer_id/publisher_id. 
      //    We can only buffer if we trust the inputs (rcid/click_id) or if we can extract data.
      //    If 'click_id' is present, we blindly respect it? 
      //    Redis Buffer stores: click_uuid, offer_id, rcid, status, etc.
      //    If we don't have offer_id (because DB down), we can't populate Redis buffer fully?
      //    Wait, checking Redis for click first gave us offer_id. 
      //    If Redis missed, we hit DB. If DB fails, we don't know offer_id.
      //    So we CANNOT buffer fully if DB is down AND Redis miss, UNLESS we just store raw payload.
      //    Logic: "Store conversion temporarily in Redis... Worker must reconcile later".
      //    Valid approach: Store "pending_postback:{uuid}" with raw query/body.
      //    Worker retries processing it.

      // Let's implement this "Rough Buffer" in the catch block of processPostback.


      // If rcid provided, check for existing conversion (dedupe)
      if (rcid) {
        const existingConversion = await this.postbackRepository.getConversionByRcid({
          rcid,
          offerId: click ? click.offer_id : null,
          tenantId
        });

        if (existingConversion) {
          return {
            success: true,
            message: 'Conversion already exists (deduplicated)',
            conversion: existingConversion,
            duplicate: true,
          };
        }
      }

      if (!click && !rcid) {
        throw new Error('Cannot process postback without click_id or rcid');
      }

      if (click && isClickOlderThan1Hour(click.created_at || click.timestamp)) {
        const expiredOfferId = click.offer_id;
        const expiredPublisherId = click.publisher_id;
        const expiredPublisherOfferId = click.publisher_offer_id;
        const expiredConversionUuid = generateConversionUuid(tenantId, expiredOfferId, expiredPublisherId);
        const expiredConversionAmount = await resolveExpiredRevenueAmount({
          amount,
          offerId: expiredOfferId,
          tenantId
        });
        const expiredConversionPayout = 0;
        const expiredConversionRcid = rcid || click?.rcid || uuidv4();

        await this.postbackRepository.insertConversion({
          conversion_uuid: expiredConversionUuid,
          click_uuid: click.click_uuid,
          offer_id: expiredOfferId,
          publisher_id: expiredPublisherId,
          publisher_offer_id: expiredPublisherOfferId,
          tenant_id: tenantId,
          rcid: expiredConversionRcid,
          status: CLICK_EXPIRED_STATUS,
          amount: expiredConversionAmount,
          payout: expiredConversionPayout,
          ip: extractIP(request),
          postback_payload: {
            query,
            headers: request.headers,
            timestamp: new Date().toISOString(),
            rejection_reason: 'click_expired',
          },
        });

        try {
          const today = new Date().toISOString().split('T')[0];
          const statsPipe = redis.pipeline();
          const statsKeyOffer = `stats:offer:${expiredOfferId}:${tenantId || 0}:${today}`;
          const statsKeyPub = `stats:pub:${expiredPublisherId || 0}:${tenantId || 0}:${today}`;

          statsPipe.incr(`${statsKeyOffer}:conversions`);
          statsPipe.incr(`${statsKeyPub}:conversions`);
          statsPipe.incr(`${statsKeyOffer}:rejected_conversions`);
          statsPipe.incr(`${statsKeyPub}:rejected_conversions`);

          await statsPipe.exec();
        } catch (statsErr) {
          logger.error('Failed to update stats for click_expired conversion:', statsErr);
        }

        await this.updateDailyStats(expiredOfferId, expiredConversionAmount, expiredConversionPayout, CLICK_EXPIRED_STATUS);

        logger.info('⏰ Conversion rejected: click expired (DB path)', {
          click_id,
          click_uuid: click.click_uuid,
          tenantId,
          click_created_at: click.created_at || click.timestamp
        });

        return {
          success: true,
          message: 'Conversion rejected(click_expired)',
          error_type: 'click_expired',
          status: CLICK_EXPIRED_STATUS,
          conversion: null,
          duplicate: false,
        };
      }

      // Get offer and assignment
      let offerId = click ? click.offer_id : null;

      // If no offerId from click, try to find it from rcid (check previous conversion or click)
      if (!offerId && rcid) {
        // Try to find from existing conversion (scoped by tenant)
        const conv = await this.postbackRepository.getConversionByRcid({ rcid, offerId: null, tenantId });
        if (conv) {
          offerId = conv.offer_id;
        } else {
          // Try to find from click with this rcid (scoped by tenant)
          const clickWithRcid = await this.postbackRepository.getClickByUuidOrTid({ clickId: rcid, tenantId });
          if (clickWithRcid) {
            offerId = clickWithRcid.offer_id;
          }
        }
      }

      if (!offerId) {
        throw new Error('Offer ID not found. Cannot determine offer from click_id or rcid');
      }

      // ✅ CRITICAL: Use integer internal id – click/DB store internal id; avoid display_id/public_offer_id resolution
      const internalOfferId = parseInt(offerId, 10);
      if (Number.isNaN(internalOfferId)) {
        throw new Error('Invalid offer ID from click');
      }
      const offer = await this._getOfferByInternalId(internalOfferId, tenantId);
      if (!offer) {
        throw new Error('Offer not found or does not belong to this tenant');
      }
      // Use loaded offer's internal id for all downstream logic and inserts
      offerId = offer.id ?? internalOfferId;

      // ✅ CRITICAL: Verify tenant ownership
      if (offer.tenant_id !== tenantId) {
        throw new Error('Offer does not belong to this tenant');
      }

      // Validate offer is active and not expired (in-file check)
      const offerValidation = this._checkOfferValidity(offer);
      if (!offerValidation.valid) {
        return {
          success: false,
          message: offerValidation.message,
          error_type: offerValidation.error_type,
          conversion: null,
          duplicate: false,
        };
      }

      const publisherId = click ? click.publisher_id : null;
      const publisherOfferId = click ? click.publisher_offer_id : null;

      // Get assignment by internal id (in-file lookup)
      let assignment = null;
      if (publisherOfferId) {
        assignment = await this._getAssignmentByInternalId(publisherOfferId, tenantId);

        // ✅ CRITICAL: Verify assignment belongs to tenant
        // if (assignment && assignment.tenant_id !== tenantId) {
        //   throw new Error('Assignment does not belong to this tenant');
        // }
      }

      let offerPayout = parseFloat(offer.advertiser_amount);

      let payout = parseFloat(offer.affiliate_amount);
      if (assignment?.payout_override) payout = parseFloat(assignment.payout_override);
      const conversionAmount = amount ? parseFloat(amount) : offerPayout;

      logger.info({
        path: 'db',
        click_id,
        rcid,
        tenantId,
        amount,
        status,
        conversionAmount,
        offerPayout,
        payout,
        offerId,
        publisherId,
        assignment_id: assignment?.id ?? assignment?.internal_id
      }, '[POSTBACK] DB path – Payout debug');

      // Determine conversion status based on conversion_approval_percentage
      let finalStatus = normalizedIncomingStatus;
      if (
        APPROVAL_ELIGIBLE_STATUSES.has(finalStatus) &&
        assignment?.conversion_approval_percentage !== null &&
        assignment?.conversion_approval_percentage !== undefined
      ) {
        finalStatus = await this.determineDeterministicApprovalStatus({
          tenantId,
          offerId,
          publisherId,
          assignmentId: assignment.internal_id ?? assignment.id,
          decisionKey: rcid || click?.click_uuid || click_id || click?.tid,
          approvalPercentage: assignment.conversion_approval_percentage,
          fallbackStatus: finalStatus
        });
      }

      const finalAmount = conversionAmount;
      const finalPayout = finalStatus === CLICK_EXPIRED_STATUS ? 0 : payout;

      // Extract IP
      const ip = extractIP(request);

      // Store postback payload - UTC ENFORCEMENT: Store UTC timestamp only
      const postbackPayload = {
        query: query,
        headers: request.headers,
        timestamp: new Date().toISOString(),
      };

      // ✅ CRITICAL: Check assignment-level capping (budget) with tenant_id
      // ✅ CRITICAL: Check assignment-level capping (Unified Budget/Conversion)
      if (assignment) {
        const cacheService = (await import('./cacheService.js')).default;
        // Publisher Cap Check
        const pubCapStatus = await cacheService.getCapStatus('publisher', assignment.id, assignment, tenantId);

        if (pubCapStatus.isHit) {
          const conversionUuid = generateConversionUuid(tenantId, offerId, publisherId);

          await this.postbackRepository.insertConversion({
            conversion_uuid: conversionUuid,
            click_uuid: click ? click.click_uuid : null,
            offer_id: offerId,
            publisher_id: publisherId,
            publisher_offer_id: publisherOfferId,
            tenant_id: tenantId,
            rcid: rcid || click?.rcid || uuidv4(),
            status: 'rejected_cap',
            amount: conversionAmount, // ✅ Record Amount (Revenue)
            payout: 0,                // ❌ ZERO Payout
            ip,
            postback_payload,
          });

          // Update Stats for "rejected_cap"
          try {
            const today = new Date().toISOString().split('T')[0];
            const statsPipe = redis.pipeline();
            const statsKeyOffer = `stats:offer:${offerId}:${tenantId || 0}:${today}`;
            const statsKeyPub = `stats:pub:${publisherId || 0}:${tenantId || 0}:${today}`;

            statsPipe.incrbyfloat(`${statsKeyOffer}:revenue`, conversionAmount);
            statsPipe.incrbyfloat(`${statsKeyPub}:revenue`, conversionAmount);
            statsPipe.incr(`${statsKeyOffer}:rejected_conversions`);
            statsPipe.incr(`${statsKeyPub}:rejected_conversions`);

            await statsPipe.exec();
          } catch (redisErr) {
            logger.error('Failed to update stats for rejected_cap conversion:', redisErr);
          }

          await this.updateDailyStats(offerId, conversionAmount, 0, 'rejected_cap');

          return {
            success: false,
            message: `Conversion rejected due to publisher cap exceeded (${assignment.capping_type})`,
            conversion: null,
            duplicate: false,
          };
        }
      }

      // ✅ CRITICAL: Cap checks before inserting conversion (offer-level) with tenant_id
      const capExceeded = await this.isCapExceeded(offer, tenantId);
      if (capExceeded) {
        const conversionUuid = generateConversionUuid(tenantId, offerId, publisherId);
        // REJECTED_CAP: Record Revenue, 0 Payout
        await this.postbackRepository.insertConversion({
          conversion_uuid: conversionUuid,
          click_uuid: click ? click.click_uuid : null,
          offer_id: offerId,
          publisher_id: publisherId,
          publisher_offer_id: publisherOfferId,
          tenant_id: tenantId,
          rcid: rcid || click?.rcid || uuidv4(),
          status: 'rejected_cap',
          amount: conversionAmount, // ✅ Revenue
          payout: 0,                // ❌ Payout
          ip,
          postback_payload,
        });

        // Update Stats
        try {
          const today = new Date().toISOString().split('T')[0];
          const statsPipe = redis.pipeline();
          const statsKeyOffer = `stats:offer:${offerId}:${tenantId || 0}:${today}`;
          const statsKeyPub = `stats:pub:${publisherId || 0}:${tenantId || 0}:${today}`;
          statsPipe.incrbyfloat(`${statsKeyOffer}:revenue`, conversionAmount);
          statsPipe.incrbyfloat(`${statsKeyPub}:revenue`, conversionAmount);
          statsPipe.incr(`${statsKeyOffer}:rejected_conversions`);
          statsPipe.incr(`${statsKeyPub}:rejected_conversions`);
          await statsPipe.exec();
        } catch (e) { logger.error('Stats update failed for rejected cap', e); }

        await this.updateDailyStats(offerId, conversionAmount, 0, 'rejected_cap');

        return {
          success: false,
          message: 'Conversion rejected due to offer cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }

      // Insert conversion
      const conversionUuid = generateConversionUuid(tenantId, offerId, publisherId);
      const insertResult = await this.postbackRepository.insertConversion({
        conversion_uuid: conversionUuid,
        click_uuid: click ? click.click_uuid : null,
        offer_id: offerId,
        publisher_id: publisherId,
        publisher_offer_id: publisherOfferId,
        tenant_id: tenantId,
        rcid: rcid || click?.rcid || uuidv4(),
        status: finalStatus,
        amount: finalAmount,
        payout: finalPayout,
        ip,
        postback_payload,
      });

      const insertId = insertResult.insertId || insertResult[0]?.insertId;
      // ✅ CRITICAL: Fetch conversion with tenant_id filtering
      const conversion = await this.postbackRepository.findConversionById({ id: insertId, tenantId });

      // Update stats via Redis (consistent pipeline with conversionWorker)
      try {
        const tenantIdVal = tenantId || 0;
        const today = new Date().toISOString().split('T')[0];
        const statsPipe = redis.pipeline();
        const statsKeyOffer = `stats:offer:${offerId}:${tenantIdVal}:${today}`;
        const statsKeyPub = `stats:pub:${publisherId || 0}:${tenantIdVal}:${today}`;

        // Revenue: ALWAYS increment (Advertiser Revenue)
        statsPipe.incrbyfloat(`${statsKeyOffer}:revenue`, finalAmount);
        statsPipe.incrbyfloat(`${statsKeyPub}:revenue`, finalAmount);

        // Track conversions as total + per-status buckets.
        const normalizedStatus = (finalStatus || 'pending').toLowerCase();
        statsPipe.incr(`${statsKeyOffer}:conversions`);
        statsPipe.incr(`${statsKeyPub}:conversions`);

        if (normalizedStatus === 'approved') {
          statsPipe.incr(`${statsKeyOffer}:approved_conversions`);
          statsPipe.incr(`${statsKeyPub}:approved_conversions`);
          // Payout: ONLY Approved
          statsPipe.incrbyfloat(`${statsKeyOffer}:payout`, finalPayout);
          statsPipe.incrbyfloat(`${statsKeyPub}:payout`, finalPayout);
        } else if (normalizedStatus === 'pending') {
          statsPipe.incr(`${statsKeyOffer}:pending_conversions`);
          statsPipe.incr(`${statsKeyPub}:pending_conversions`);
        } else if (normalizedStatus === 'rejected' || normalizedStatus === 'rejected_cap' || normalizedStatus === CLICK_EXPIRED_STATUS) {
          statsPipe.incr(`${statsKeyOffer}:rejected_conversions`);
          statsPipe.incr(`${statsKeyPub}:rejected_conversions`);
        }

        await statsPipe.exec();
      } catch (err) {
        logger.error('Failed to update Redis stats for conversion (postback DB path):', err);
      }

      // ✅ Increment Unified Capping Counters (DB Path)
      try {
        const cacheService = (await import('./cacheService.js')).default;
        const normalizedStatus = (finalStatus || 'pending').toLowerCase();

        if (['approved', 'pending'].includes(normalizedStatus)) {
          // Publisher Cap
          if (assignment && assignment.id) {
            // Publisher budget uses payout
            await cacheService.incrementCap('publisher', assignment.id, assignment, finalPayout, tenantId);
          }
          // Offer Cap
          if (offer && offer.id) {
            // Offer budget uses revenue (amount)
            await cacheService.incrementCap('offer', offer.id, offer, finalAmount, tenantId);
          }
        }
      } catch (capErr) {
        logger.error('Failed to increment capping counters (DB path)', capErr);
      }

      // Get publisher by internal id (in-file lookup)
      let publisher = null;
      if (publisherId) {
        publisher = await this._getPublisherByInternalId(publisherId, tenantId);

        // ✅ CRITICAL: Verify publisher belongs to tenant
        if (publisher && publisher.tenant_id !== tenantId) {
          throw new Error('Publisher does not belong to this tenant');
        }
      }

      // Resolve callback URL: assignment.callback_url OR publisher.global_postback_url
      const callbackUrl = assignment?.callback_url || publisher?.global_postback_url;

      // BUSINESS RULE: Affiliate postback fires ONLY when conversion status = 'approved'.
      // Pending/rejected/rejected_cap → NO postback. Idempotency: only fire if not already fired.
      const mayFirePostback = conversion &&
        conversion.status === 'approved' &&
        !conversion.affiliate_postback_fired &&
        callbackUrl;

      let postbackResult = null;
      if (mayFirePostback) {
        postbackResult = await this.sendPublisherPostback(callbackUrl, conversion, click);
        if (postbackResult && postbackResult.success) {
          try {
            await this.postbackRepository.updateConversionPostbackStatus({
              id: conversion.id,
              tenantId,
              status: 1
            });
            conversion.affiliate_postback_fired = 1;
          } catch (updateErr) {
            if (updateErr.code === 'ER_BAD_FIELD_ERROR') {
              logger.warn('affiliate_postback_fired column missing - database schema update required');
            } else throw updateErr;
          }
        }
      } else {
        postbackResult = {
          success: false,
          executed: false,
          reason: !conversion
            ? 'No conversion created'
            : conversion.status !== 'approved'
              ? 'Affiliate postback only fires for approved conversions'
              : conversion.affiliate_postback_fired
                ? 'Postback already fired (idempotency)'
                : 'No callback URL configured'
        };
      }

      return {
        success: true,
        message: 'Conversion recorded successfully',
        conversion,
        duplicate: false,
        affiliate_postback: postbackResult
      };
    } catch (error) {
      // 1. Handle MySQL duplicate key violations
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.message && error.message.includes('uniq_click_uuid')) {
          return {
            success: false,
            message: 'This click has already generated a conversion. One click can only give one conversion.',
            duplicate: false,
            error_type: 'duplicate_click_conversion'
          };
        }
        if (error.message && error.message.includes('uniq_rcid_offer')) {
          return {
            success: true,
            message: 'Conversion already exists (deduplicated by rcid)',
            duplicate: true,
            error_type: 'duplicate_rcid_offer'
          };
        }
        return {
          success: false,
          message: 'Duplicate entry detected',
          duplicate: true,
          error_type: 'duplicate_entry'
        };
      }

      // 2. Handle specific DB Reference Errors
      if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
        throw new Error('Invalid reference: The specified offer, publisher, or assignment does not exist');
      }

      if (error.code === 'ER_DATA_TOO_LONG') {
        throw new Error('Data too long for one or more fields. Please check your input length.');
      }

      // 3. ✅ CRITICAL: DB CONNECTION / AVAILABILITY ERRORS -> BUFFER IN REDIS
      // If DB is down or too busy, we must NOT lose the postback.
      const isDbError = error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' ||
        error.code === 'PROTOCOL_CONNECTION_LOST' || error.message?.includes('connect') ||
        error.message?.includes('Query timeout') || // ✅ NEW: Handle query timeouts from high load
        (error.code && error.code.toString().startsWith('5')); // 5xx DB errors

      if (isDbError) {
        try {
          // Buffer raw request for retry
          const payload = {
            query,
            headers: request?.headers || {},
            timestamp: new Date().toISOString(),
            error: error.message,
            reason: error.message?.includes('Query timeout') ? 'high_load' : 'connection_error'
          };
          // Use a redis list for Raw Postback Retry
          await redis.lpush('queue:postbacks:retry', JSON.stringify(payload));

          const logMessage = error.message?.includes('Query timeout')
            ? '⚠️ DB Overloaded - Postback Buffered in Redis for Retry'
            : '⚠️ DB Unavailable - Postback Buffered in Redis for Retry';

          logger.warn(logMessage, {
            error: error.message,
            click_id: query.click_id,
            rcid: query.rcid,
            buffered_at: new Date().toISOString()
          });

          return {
            success: true,
            message: 'Conversion buffered (DB temporarily unavailable)',
            duplicate: false,
            note: 'Buffered for retry - will be processed when DB is available'
          };
        } catch (redisErr) {
          logger.error('❌ CRITICAL: Failed to buffer postback to Redis during DB failure!', redisErr);
          // Both DB and Redis failed - catastrophic.
        }
      }

      logger.error('PostbackService.processPostback error:', error);
      throw error;
    }
  }

  async updateDailyStats(offerId, revenue, payout, status) {
    try {
      // FINANCIAL SEPARATION RULES:
      // 1. Revenue = SUM(amount) (Advertiser Revenue) - ALWAYS counted, regardless of status (even rejected).
      // 2. Payout = SUM(payout) (Publisher Earnings) - ONLY counted when status = 'approved'.
      // 3. Profit = Revenue - Payout.

      // Revamped Logic:
      // - Revenue: Always add (even if rejected)
      // - Payout: Only add if approved
      // - Conversions: Increment for every conversion status
      // - Status buckets: approved/pending/rejected tracked separately

      const finalRevenue = revenue;
      const finalPayout = (status === 'approved') ? payout : 0;
      const conversionInc = 1;
      const approvedConversionInc = status === 'approved' ? 1 : 0;
      const pendingConversionInc = status === 'pending' ? 1 : 0;
      const rejectedConversionInc = (status === 'rejected' || status === 'rejected_cap' || status === CLICK_EXPIRED_STATUS) ? 1 : 0;

      // Profit
      const profit = finalRevenue - finalPayout;

      // UTC ENFORCEMENT: Store UTC date in DB. Business logic converts to IST only at query time.
      // Use CONVERT_TZ(created_at, '+00:00', '+00:00') in queries for IST display
      const today = new Date().toISOString().split('T')[0];

      await this.postbackRepository.updateDailyOfferStats({
        offerId,
        day: today,
        conversions: conversionInc,
        approved_conversions: approvedConversionInc,
        pending_conversions: pendingConversionInc,
        rejected_conversions: rejectedConversionInc,
        revenue: finalRevenue,
        payout: finalPayout,
        profit
      });
    } catch (error) {
      logger.error('PostbackService.updateDailyStats error:', error);
    }
  }

  async isAssignmentBudgetCapHit(assignment, offerId, publisherId, tenantId = null) {
    if (!assignment.capping_budget_duration || !assignment.capping_budget_amount) {
      return false;
    }

    const duration = assignment.capping_budget_duration;
    const capAmount = parseFloat(assignment.capping_budget_amount);
    if (capAmount <= 0) return false;

    // Use IST (UTC+00:00) for timezone conversions
    const tz = '+00:00';

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

    // ✅ CRITICAL: Add tenant_id filtering to cap check
    // ✅ CRITICAL: Exclude rejected conversions from cap
    const totalRevenue = await this.postbackRepository.getCapUsageSum({
      offerId,
      publisherId,
      tenantId,
      dateCondition,
      clickExpiredStatus: CLICK_EXPIRED_STATUS
    });
    return totalRevenue >= capAmount;
  }

  async isAssignmentConversionCapHit(assignment, offerId, publisherId, tenantId = null) {
    if (!assignment.capping_conversions_duration || !assignment.capping_conversions_amount) {
      return false;
    }

    const duration = assignment.capping_conversions_duration;
    const capCount = parseInt(assignment.capping_conversions_amount);
    if (capCount <= 0) return false;

    // Use IST (UTC+00:00) for timezone conversions
    const tz = '+00:00';

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

    // ✅ CRITICAL: Add tenant_id filtering to cap check
    // ✅ CRITICAL: Exclude rejected conversions from cap
    const count = await this.postbackRepository.getCapUsageCount({
      offerId,
      publisherId,
      tenantId,
      dateCondition,
      clickExpiredStatus: CLICK_EXPIRED_STATUS
    });
    return count >= capCount;
    return count >= capCount;
  }
  async sendPublisherPostback(callbackUrl, conversion, click) {
    const startTime = Date.now();
    let finalUrl = callbackUrl;
    let httpStatus = 0;
    let responseBody = '';
    let errorMessage = null;
    const normalizedStatus = (conversion?.status || '').toString().toLowerCase();

    // Hard safety gate: never fire publisher postback unless conversion is approved.
    if (normalizedStatus !== 'approved') {
      logger.info('Publisher postback skipped: conversion is not approved', {
        conversion_id: conversion?.id,
        conversion_uuid: conversion?.conversion_uuid,
        status: conversion?.status
      });
      return {
        success: false,
        executed: false,
        reason: 'Publisher postback only fires for approved conversions'
      };
    }

    if (!callbackUrl) {
      return {
        success: false,
        executed: false,
        reason: 'No callback URL configured'
      };
    }

    return new Promise((resolve) => {
      try {
        // Correct Macro Mapping:
        // {affiliate_click_id} -> click.tid (The ID affiliate provided)
        // {click_id} -> click.tid (Standard mapping for affiliates who expect their ID back in click_id param)
        const affiliateClickId = click?.tid || '';

        // Replace macros in callback URL using replaceMacros function
        const url = replaceMacros(callbackUrl, {
          click_id: affiliateClickId, // Map standard click_id macro to affiliate's ID
          affiliate_click_id: affiliateClickId, // Specific macro
          conversion_id: conversion.conversion_uuid || '',
          rcid: conversion.rcid || '',
          payout: conversion.payout?.toString() || '0',
          amount: conversion.amount?.toString() || '0',
          status: conversion.status || 'pending',
        });

        // Also replace additional macros that might be used manually
        finalUrl = url
          .replace(/{affiliate_click_id}/gi, affiliateClickId)
          .replace(/{conversion_id}/gi, conversion.conversion_uuid || '')
          .replace(/{CONVERSION_ID}/gi, conversion.conversion_uuid || '')
          .replace(/{payout}/gi, conversion.payout?.toString() || '0')
          .replace(/{PAYOUT}/gi, conversion.payout?.toString() || '0')
          .replace(/{amount}/gi, conversion.amount?.toString() || '0')
          .replace(/{AMOUNT}/gi, conversion.amount?.toString() || '0')
          .replace(/{status}/gi, conversion.status || 'pending')
          .replace(/{STATUS}/gi, conversion.status || 'pending');

        // Send GET request to publisher callback URL
        const urlObj = new URL(finalUrl);
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.get(finalUrl, { timeout: 5000 }, async (res) => {
          httpStatus = res.statusCode;

          // Consume response
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', async () => {
            responseBody = data.substring(0, 1000); // Truncate if too long
            logger.info(`Postback sent to publisher: ${finalUrl} - Status: ${res.statusCode}`);
            logger.info('Publisher Postback Function Success', { url: finalUrl, status: httpStatus });

            // Log success (Skip if test)
            if (!conversion.is_test) {
              await this.logPostbackAttempt({
                publisher_id: conversion.publisher_id || click?.publisher_id,
                conversion_id: conversion.id,
                affiliate_click_id: affiliateClickId,
                fired_url: finalUrl,
                http_status: httpStatus,
                response_body: responseBody,
                execution_time_ms: Date.now() - startTime,
                tenant_id: conversion.tenant_id
              });
            }

            resolve({
              success: httpStatus >= 200 && httpStatus < 300,
              fired_url: finalUrl,
              http_status: httpStatus,
              response_body: responseBody
            });
          });
        });

        req.on('error', async (err) => {
          errorMessage = err.message;
          logger.error(`PostbackService.sendPublisherPostback error for ${finalUrl}:`, err.message);
          logger.error('Publisher Postback Function Failed', { url: finalUrl, error: errorMessage });

          // Log error (Skip if test)
          if (!conversion.is_test) {
            await this.logPostbackAttempt({
              publisher_id: conversion.publisher_id || click?.publisher_id,
              conversion_id: conversion.id,
              affiliate_click_id: affiliateClickId,
              fired_url: finalUrl,
              http_status: 0,
              response_body: null,
              error_message: errorMessage,
              execution_time_ms: Date.now() - startTime,
              tenant_id: conversion.tenant_id
            });
          }

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: errorMessage
          });
        });

        req.on('timeout', () => {
          req.destroy();
          errorMessage = 'Timeout';
          logger.warn(`PostbackService.sendPublisherPostback timeout for ${finalUrl}`);
          logger.error('Publisher Postback Function Failed (Timeout)', { url: finalUrl });

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: 'Timeout'
          });
        });

        req.setTimeout(5000);
      } catch (error) {
        errorMessage = error.message;
        logger.error('PostbackService.sendPublisherPostback error:', error);
        logger.error('Publisher Postback Function Failed (Exception)', { url: finalUrl, error: errorMessage });

        // Use an IIFE to handle async logging in catch block
        (async () => {
          if (!conversion.is_test) {
            await this.logPostbackAttempt({
              publisher_id: conversion.publisher_id || click?.publisher_id,
              conversion_id: conversion.id,
              affiliate_click_id: affiliateClickId,
              fired_url: finalUrl,
              http_status: 0,
              response_body: null,
              error_message: errorMessage,
              execution_time_ms: Date.now() - startTime,
              tenant_id: conversion.tenant_id
            });
          }
        })();

        resolve({
          success: false,
          fired_url: finalUrl,
          http_status: 0,
          error: errorMessage
        });
      }
    });
  }

  async logPostbackAttempt(data) {
    try {
      await this.postbackRepository.logPostbackAttempt(data);
    } catch (err) {
      logger.error('Failed to write to affiliate_postback_logs:', err);
    }
  }

  async getPostbackLogs(filters = {}, tenantId = null) {
    try {
      return await this.postbackRepository.getPostbackLogs(filters, tenantId);
    } catch (error) {
      logger.error('PostbackService.getPostbackLogs error:', error);
      throw error;
    }
  }

  /**
   * Validate offer is active and not expired before processing conversion
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferForConversion(offer) {
    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not active. Current status: ${offer.status}. Only live offers can accept conversions.`,
        error_type: 'offer_not_active'
      };
    }

    // UTC ENFORCEMENT: Business logic validation uses IST conversion for time-based checks
    // Storage remains UTC, only business rules convert to IST
    const now = new Date();
    const istTime = new Date(now.getTime());
    const currentDate = istTime.toISOString().split('T')[0]; // YYYY-MM-DD in IST
    const currentTime = istTime.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS in IST

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date); // Assuming stored as YYYY-MM-DD
      // We interpret stored date as end of that day in IST
      endDate.setHours(23, 59, 59, 999);

      // Compare YYYY-MM-DD strings to avoid offset confusion
      if (currentDate > offer.end_date) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      // Compare YYYY-MM-DD strings
      if (currentDate < offer.start_date) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}`,
          error_type: 'offer_not_started'
        };
      }
    }

    // Check time restrictions if both start_time and end_time are set
    // Assuming start_time and end_time are stored as 'HH:MM:SS' strings
    if (offer.start_time && offer.end_time) {
      const startTime = offer.start_time;
      const endTime = offer.end_time;

      // Compare times (HH:MM:SS format)
      if (currentTime < startTime || currentTime > endTime) {
        return {
          valid: false,
          message: `Conversion outside allowed time window. Allowed: ${startTime} - ${endTime}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.start_time) {
      // Only start_time set
      if (currentTime < offer.start_time) {
        return {
          valid: false,
          message: `Conversion before allowed start time. Start time: ${offer.start_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.end_time) {
      // Only end_time set
      if (currentTime > offer.end_time) {
        return {
          valid: false,
          message: `Conversion after allowed end time. End time: ${offer.end_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    }

    return {
      valid: true,
      message: 'Offer is valid for conversion',
      error_type: null
    };
  }

  async isCapExceeded(offer, tenantId = null) {
    if (!offer) return false;

    const cacheService = (await import('./cacheService.js')).default;

    // ✅ 1. Legacy Total Cap Check
    if (offer.total_cap && offer.total_cap > 0) {
      const totalCount = await this.postbackRepository.getTotalConversionCount({
        offerId: offer.id,
        tenantId
      });
      if (totalCount >= offer.total_cap) return true;
    }

    // ✅ 2. New Unified Cap Check (Budget/Conversion + Daily/Weekly/Monthly)
    const capStatus = await cacheService.getCapStatus('offer', offer.id, offer, tenantId);

    if (capStatus.isHit) {
      logger.info(`[POSTBACK] Offer Capping Exceeded`, {
        offer_id: offer.id,
        type: offer.capping_type,
        duration: offer.capping_duration,
        limit: capStatus.limit,
        current: capStatus.current
      });
      return true;
    }

    return false;
  }

  /**
   * Manually approve a click (pending, expired, or not yet converted)
   * @param {string} clickUuid - Unique click ID
   * @param {number} tenantId - Tenant context
   * @returns {Promise<Object>} Result of approval
   */
  async manualApproveClick(clickUuid, tenantId) {
    try {
      if (!clickUuid || !tenantId) {
        throw new AppError('click_uuid and tenant_id are required', 400);
      }

      // 1. Fetch Click Data
      const click = await this.postbackRepository.getClickByUuidOrTid({ clickId: clickUuid, tenantId });
      if (!click) {
        throw new AppError('Click not found', 404);
      }

      // 2. Fetch Offer and Assignment for Payout
      const offer = await this._getOfferByInternalId(click.offer_id, tenantId);
      if (!offer) throw new AppError('Offer not found', 404);

      let assignment = null;
      if (click.publisher_offer_id) {
        assignment = await this._getAssignmentByInternalId(click.publisher_offer_id, tenantId);
      }

      const publisher = await this._getPublisherByInternalId(click.publisher_id, tenantId);

      // Payout Calculation
      let advertiserAmount = parseFloat(offer.advertiser_amount || 0);
      let payout = parseFloat(offer.affiliate_amount || 0);
      if (assignment?.payout_override) payout = parseFloat(assignment.payout_override);

      // 3. Check for existing conversion
      const existingConv = await this.postbackRepository.getConversionByRcid({
        rcid: click.rcid || clickUuid,
        offerId: click.offer_id,
        tenantId
      });

      let finalConversionId = null;
      let isNew = !existingConv;
      let statusChanged = false;
      let oldStatus = null;

      if (existingConv) {
        finalConversionId = existingConv.id;
        oldStatus = existingConv.status;
        if (existingConv.status === 'approved') {
          return { success: true, message: 'Conversion already approved', already_approved: true };
        }
        statusChanged = true;

        // Update existing conversion to approved
        await this.postbackRepository.updateConversionToApproved({
          id: existingConv.id,
          tenantId,
          payout,
          amount: advertiserAmount
        });
      } else {
        // Create new conversion as approved
        const conversionUuid = generateClickId(tenantId || 0, click.offer_id || 0, click.publisher_id || 0, 96);
        const result = await this.postbackRepository.insertConversion({
          conversion_uuid: conversionUuid,
          click_uuid: clickUuid,
          offer_id: click.offer_id,
          publisher_id: click.publisher_id,
          publisher_offer_id: click.publisher_offer_id,
          tenant_id: tenantId,
          rcid: click.rcid || uuidv4(),
          status: 'approved',
          amount: advertiserAmount,
          payout,
          ip: click.ip,
          postback_payload: { manual: true, approved_at: new Date().toISOString() },
        });
        finalConversionId = result.insertId;
      }

      // 4. Update Daily Offer Stats
      const todayIST = new Date().toISOString().split('T')[0];
      
      if (isNew) {
        await this.postbackRepository.updateDailyStatsManualNew({
          offerId: click.offer_id,
          tenantId,
          day: todayIST,
          advertiserAmount,
          payout,
          profit: (advertiserAmount - payout)
        });
      } else if (statusChanged) {
        let pendingDelta = oldStatus === 'pending' ? -1 : 0;
        let rejectedDelta = (oldStatus === 'rejected' || oldStatus === 'rejected_cap' || oldStatus === CLICK_EXPIRED_STATUS) ? -1 : 0;
        
        await this.postbackRepository.updateDailyStatsManualStatusChange({
          offerId: click.offer_id,
          tenantId,
          day: todayIST,
          pendingDelta,
          rejectedDelta,
          payout
        });
      }

      // 5. Fire Publisher Postback
      const updatedConv = await this.postbackRepository.findConversionById({ id: finalConversionId, tenantId });
      const callbackUrl = assignment?.callback_url || publisher?.global_postback_url;
      let postbackResult = { executed: false };
      if (callbackUrl) {
        postbackResult = await this.sendPublisherPostback(callbackUrl, updatedConv, click);
        if (postbackResult.success) {
          await this.postbackRepository.updateConversionPostbackStatus({
            id: finalConversionId,
            tenantId,
            status: 1
          });
        }
      }

      return {
        success: true,
        message: 'Click manually approved successfully',
        conversion_id: finalConversionId,
        postback: postbackResult
      };

    } catch (error) {
      logger.error('PostbackService.manualApproveClick error:', error);
      throw error;
    }
  }
}

// (no singleton export)
