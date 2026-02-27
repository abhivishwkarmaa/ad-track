import redis from '../config/redis.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';
import logger from '../utils/logger.js';
import pool from '../db/connection.js';

const TTL = {
    OFFER: 300,        // 5 Minutes (Reference data doesn't change often)
    PUBLISHER: 300,
    ASSIGNMENT: 300,
    CAP_COUNTERS: 14400, // 4 Hours
};

// --- LUA SCRIPTS ---
/**
 * Return codes:
 *  1: Success (Allowed & Incremented)
 *  0: Limit Reached (Blocked)
 * -1: Key Missing (Trigger Hydration)
 *  2: Already Processed (Idempotent success)
 */
const CAP_CHECK_SCRIPT = `
local key = KEYS[1]
local processedKey = KEYS[2]
local limit = tonumber(ARGV[1])
local amount = tonumber(ARGV[2])
local idempotencyTTL = tonumber(ARGV[3])

-- 1. Atomic Idempotency Guard
-- Try to set processedKey only if it doesn't exist
local isNew = redis.call('SET', processedKey, '1', 'NX', 'EX', idempotencyTTL)
if not isNew then
    return {2, redis.call('GET', key) or "0"}
end

-- 2. Existence Check (Fails-Safe/Closed)
if redis.call('EXISTS', key) == 0 then
    -- If key is missing, we must NOT increment. 
    -- Return -1 so caller can trigger hydration.
    return {-1, "0"}
end

-- 3. Safety Check
local current = tonumber(redis.call('GET', key) or "0")
if current >= limit then
    return {0, tostring(current)}
end

-- 4. Atomic Increment
local new_val = redis.call('INCRBYFLOAT', key, amount)
return {1, tostring(new_val)}
`;

if (typeof redis.atomicCapCheck !== 'function') {
    redis.defineCommand('atomicCapCheck', {
        numberOfKeys: 2,
        lua: CAP_CHECK_SCRIPT,
    });
}

export class CacheService {

    // --- Reference Data Lookups (Read-Through) ---

    async getOffer(offerId, tenantId = null) {
        // ✅ PRODUCTION GRADE: Split Static (Meta) vs Dynamic (Status)
        const metaKey = tenantId ? `ref:offer:meta:${tenantId}:${offerId}` : `ref:offer:meta:${offerId}`;
        const statusKey = tenantId ? `ref:offer:status:${tenantId}:${offerId}` : `ref:offer:status:${offerId}`;

        try {
            // MGET for performance
            const [cachedMeta, cachedStatus] = await Promise.all([
                redis.hgetall(metaKey),
                redis.get(statusKey)
            ]);

            if (cachedMeta && cachedMeta.id && cachedStatus) {
                const offer = this._deserialize(cachedMeta);
                offer.status = cachedStatus;
                return offer;
            }
        } catch (e) {
            logger.warn(`Redis getOffer error: ${e.message}`);
        }

        // ✅ DB Fallback
        const offer = await offerService.getOfferById(offerId, tenantId, true);
        if (offer) {
            const { status, ...meta } = offer;
            this._cacheObject(metaKey, meta, TTL.OFFER);
            redis.setex(statusKey, TTL.OFFER, status);
        }
        return offer;
    }

    async getTenant(tenantId) {
        const key = `ref:tenant:${tenantId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return cached;
        } catch (e) { }

        const [rows] = await pool.query('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
        const tenant = rows[0];
        if (tenant) this._cacheObject(key, tenant, 3600); // 1 hour
        return tenant;
    }

    async getInternalOfferId(publicId, tenantId) {
        const key = `ref:offer_id_map:${tenantId}:${publicId}`;
        try {
            const cached = await redis.get(key);
            if (cached) return parseInt(cached);
        } catch (e) { }

        const internalId = await offerService.getInternalOfferIdByPublicId(publicId, tenantId);
        if (internalId) await redis.setex(key, 3600, internalId);
        return internalId;
    }

    async getInternalPublisherId(publicId, tenantId) {
        const key = `ref:pub_id_map:${tenantId}:${publicId}`;
        try {
            const cached = await redis.get(key);
            if (cached) return parseInt(cached);
        } catch (e) { }

        const internalId = await publisherService.getInternalIdByPublicId(publicId, tenantId);
        if (internalId) await redis.setex(key, 3600, internalId);
        return internalId;
    }

    async getPublisher(publisherId, tenantId = null) {
        // ✅ CRITICAL: Include tenant_id in cache key for tenant isolation
        const key = tenantId
            ? `ref:publisher:${tenantId}:${publisherId}`
            : `ref:publisher:${publisherId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return this._deserialize(cached);
        } catch (e) { }

        // ✅ CRITICAL: DB Fallback with tenant_id filtering
        const publisher = await publisherService.findById(publisherId, tenantId);
        if (publisher) this._cacheObject(key, publisher, TTL.PUBLISHER);
        return publisher;
    }

    async getAssignment(publisherId, offerId, tenantId = null) {
        // ✅ CRITICAL: Include tenant_id in cache key for tenant isolation
        const key = tenantId
            ? `ref:assign:${tenantId}:${publisherId}:${offerId}`
            : `ref:assign:${publisherId}:${offerId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return this._deserialize(cached);
        } catch (e) { }

        // ✅ CRITICAL: Add tenant_id filtering to query
        let query = 'SELECT id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?';
        const params = [publisherId, offerId, 'active'];

        if (tenantId) {
            query += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        const [rows] = await pool.query(query, params);
        const assignment = Array.isArray(rows) ? rows[0] : rows;

        if (assignment) this._cacheObject(key, assignment, TTL.ASSIGNMENT);
        return assignment;
    }

    // --- Capping Logic (Redis Counters) ---

    /**
     * PRODUCTION GRADE: Atomic Check-and-Increment with Idempotency & Hydration
     */
    async checkAndIncrCap(entityType, entityId, obj, amount, tenantId, uuid = null) {
        const { key, limit, duration } = this._getCapConfig(entityType, entityId, obj, tenantId);
        if (!key || !limit || limit <= 0) return { success: true, current: 0 };

        const processedKey = uuid ? `cap:processed:${uuid}` : `cap:temp:${Math.random()}`;
        const idempotencyTTL = 86400; // 24 hours

        try {
            // ARGV: [Limit, Amount, IdempotencyTTL]
            let [code, current] = await redis.atomicCapCheck(key, processedKey, limit, amount, idempotencyTTL);

            // Handle Missing Key (Trigger Hydration)
            if (code === -1) {
                logger.info(`[CAP] Cache miss or Flush detected for ${key}. Safeguarding via hydration...`);
                await this._safeHydrate(key, entityType, entityId, obj, duration, tenantId);
                // Retry once after hydration
                [code, current] = await redis.atomicCapCheck(key, processedKey, limit, amount, idempotencyTTL);
            }

            return {
                success: code === 1 || code === 2,
                current: parseFloat(current),
                idempotent: code === 2
            };
        } catch (e) {
            logger.error(`[CAP] Critical Atomic error: ${e.message}`);
            // FAIL-CLOSED: Block conversion if system is unreliable
            return { success: false, current: 0, error: 'Redis System Failure' };
        }
    }

    async getCapStatus(entityType, entityId, obj, tenantId) {
        const { key, limit, duration } = this._getCapConfig(entityType, entityId, obj, tenantId);
        if (!key || !limit) return { isHit: false, current: 0, limit: 0 };

        try {
            let current = await redis.get(key);
            if (current === null) {
                current = await this._safeHydrate(key, entityType, entityId, obj, duration, tenantId);
            }
            return {
                isHit: parseFloat(current || 0) >= limit,
                current: parseFloat(current || 0),
                limit: limit
            };
        } catch (e) {
            return { isHit: false, current: 0, limit: 0 };
        }
    }

    /**
     * SINGLE-FLIGHT HYDRATION with Redis Lock
     */
    async _safeHydrate(key, entityType, entityId, obj, duration, tenantId) {
        const lockKey = `lock:hydrate:${key}`;

        // 1. Acquire distributed lock (NX, EX 10s)
        const lock = await redis.set(lockKey, '1', 'NX', 'EX', 10);

        if (!lock) {
            // Someone else is hydrating. Wait and check Redis.
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 500));
                const current = await redis.get(key);
                if (current !== null) return parseFloat(current);
            }
            throw new Error(`Hydration lock timeout for ${key}`);
        }

        try {
            // Double check existence after lock acquired
            const existing = await redis.get(key);
            if (existing !== null) return parseFloat(existing);

            // 2. Fetch from Aggregated Stats (Faster & Reliable)
            const truth = await this._hydrateFromStats(entityType, entityId, obj, duration, tenantId);

            // 3. Set with Long TTL (Deterministic Period)
            let ttl = 172800; // 2 days for daily
            if (duration === 'monthly') ttl = 3024000; // 35 days

            if (duration === 'total') {
                await redis.set(key, truth);
                await redis.persist(key);
            } else {
                await redis.setex(key, ttl, truth);
            }

            return truth;
        } finally {
            await redis.del(lockKey);
        }
    }

    async _hydrateFromStats(entityType, entityId, obj, duration, tenantId) {
        const capType = obj.capping_type || (obj.total_cap > 0 ? 'conversion' : 'none');
        const col = capType === 'budget' ? 'revenue' : 'approved_conversions';

        // Base Query
        let query = '';
        let params = [entityId];

        if (duration === 'daily') {
            const today = new Date().toISOString().split('T')[0];
            query = `SELECT COALESCE(SUM(${col}), 0) as val FROM daily_offer_stats WHERE offer_id = ? AND day = ?`;
            params.push(today);
        } else if (duration === 'monthly') {
            const month = new Date().toISOString().slice(0, 7) + '%';
            query = `SELECT COALESCE(SUM(${col}), 0) as val FROM daily_offer_stats WHERE offer_id = ? AND day LIKE ?`;
            params.push(month);
        } else {
            // Total Cap: Sum all daily stats
            query = `SELECT COALESCE(SUM(${col}), 0) as val FROM daily_offer_stats WHERE offer_id = ?`;
        }

        if (tenantId) {
            query += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        try {
            const [rows] = await pool.query(query, params);
            return parseFloat((Array.isArray(rows) ? rows[0] : rows).val || 0);
        } catch (e) {
            logger.error(`Stats Hydration Error: ${e.message}`);
            // Fallback to slow sum of conversions if stats table fails
            return this._hydrateCapFromDB(entityType, entityId, capType, duration, tenantId);
        }
    }

    _getCapConfig(entityType, entityId, obj, tenantId) {
        const capType = obj.capping_type;
        const duration = obj.capping_duration || 'total';

        let limit = 0;
        if (entityType === 'offer') {
            if (capType === 'budget') limit = parseFloat(obj.budget_cap || 0);
            else if (capType === 'conversion') limit = parseInt(obj.conversion_cap || 0);
        } else {
            if (capType === 'budget') {
                limit = parseFloat(obj.capping_amount ?? obj.capping_budget_amount ?? 0);
            } else if (capType === 'conversion') {
                limit = parseInt(obj.capping_amount ?? obj.capping_conversions_amount ?? 0);
            }
        }

        if (!capType || capType === 'none' || limit <= 0) {
            if (obj.total_cap > 0) {
                return {
                    key: `cap:${tenantId || 0}:offer:${entityId}:total:count`,
                    limit: parseFloat(obj.total_cap),
                    duration: 'total'
                };
            }
            return { key: null, limit: null, duration: null };
        }

        const now = new Date();
        const istTime = new Date(now.getTime() + (330 * 60 * 1000));
        let period = '';

        if (duration === 'daily') {
            period = istTime.toISOString().split('T')[0];
        } else if (duration === 'weekly') {
            const d = new Date(Date.UTC(istTime.getFullYear(), istTime.getMonth(), istTime.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            period = `${d.getUTCFullYear()}-W${weekNo}`;
        } else if (duration === 'monthly') {
            period = istTime.toISOString().slice(0, 7);
        } else {
            period = 'total';
        }

        return {
            key: `cap:${tenantId || 0}:${entityType}:${entityId}:${capType}:${duration}:${period}`,
            limit,
            duration
        };
    }

    async _hydrateCapFromDB(entityType, entityId, capType, duration, tenantId) {
        const now = new Date();
        // IST = UTC + 5:30
        const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        let startUTC, endUTC;

        if (duration === 'daily') {
            const dateStr = istNow.toISOString().split('T')[0];
            startUTC = new Date(`${dateStr}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
            endUTC = new Date(`${dateStr}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        } else if (duration === 'weekly') {
            // Get Monday of current week (IST)
            const day = istNow.getUTCDay(); // 0-6 (Sun-Sat)
            const diff = istNow.getUTCDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(istNow.setDate(diff));
            const dateStr = monday.toISOString().split('T')[0];
            startUTC = new Date(`${dateStr}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');

            const sunday = new Date(monday.setDate(monday.getDate() + 6));
            const endDateStr = sunday.toISOString().split('T')[0];
            endUTC = new Date(`${endDateStr}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        } else if (duration === 'monthly') {
            const startOfMonth = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
            const startStr = startOfMonth.toISOString().slice(0, 10);
            startUTC = new Date(`${startStr}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');

            const nextMonth = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0);
            const endStr = nextMonth.toISOString().slice(0, 10);
            endUTC = new Date(`${endStr}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        } else {
            return 0;
        }

        const dateCond = 'created_at BETWEEN ? AND ?';
        let query = '';
        let params = [startUTC, endUTC];

        // Count ONLY Approved + Pending. Exclude Rejected/RejectedCap.
        const statusCond = "status IN ('approved', 'pending')";

        if (entityType === 'offer') {
            if (capType === 'budget') {
                // Offer Budget = Revenue
                query = `SELECT COALESCE(SUM(amount), 0) as val FROM conversions WHERE offer_id = ? AND ${dateCond} AND ${statusCond}`;
            } else {
                query = `SELECT COUNT(*) as val FROM conversions WHERE offer_id = ? AND ${dateCond} AND ${statusCond}`;
            }
            params.unshift(entityId);
        } else {
            // Publisher Budget = Payout
            if (capType === 'budget') {
                query = `SELECT COALESCE(SUM(payout), 0) as val FROM conversions WHERE publisher_offer_id = ? AND ${dateCond} AND ${statusCond}`;
            } else {
                query = `SELECT COUNT(*) as val FROM conversions WHERE publisher_offer_id = ? AND ${dateCond} AND ${statusCond}`;
            }
            params.unshift(entityId);
        }

        if (tenantId) {
            query += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        try {
            const [rows] = await pool.query(query, params);
            return parseFloat((Array.isArray(rows) ? rows[0] : rows).val || 0);
        } catch (e) {
            logger.error(`Hydrate Cap DB Error: ${e.message}`, { query, params });
            return 0;
        }
    }

    // --- Deduplication ---

    async isDuplicateClick(fingerprint) {
        const key = `dedupe:click:${fingerprint}`;
        // SET NX EX 5: Set if Not Exists, Expire 5s
        // ✅ Increased TTL from 3s to 5s for better duplicate prevention
        // Returns 'OK' if set, null if already exists
        const result = await redis.set(key, '1', 'NX', 'EX', 5);
        return result === null; // If null, it WAS duplicate
    }

    async getDedupeRedirect(fingerprint) {
        return await redis.get(`dedupe:redirect:${fingerprint}`);
    }

    async cacheDedupeRedirect(fingerprint, url) {
        await redis.setex(`dedupe:redirect:${fingerprint}`, 3, url);
    }

    // --- Helpers ---

    _deserialize(obj) {
        // Simple helper to parse numbers back from strings
        // In production, might need specific schema mapping
        return obj;
    }

    async _cacheObject(key, obj, ttl) {
        // Flatten object for HSET (handle dates/nested)
        const flat = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v instanceof Date) flat[k] = v.toISOString();
            else if (v === null || v === undefined) continue;
            else flat[k] = String(v);
        }
        try {
            await redis.hset(key, flat);
            await redis.expire(key, ttl);
        } catch (e) {
            logger.warn(`Failed to cache ${key}`, e);
        }
    }

    // --- Invalidation ---

    async invalidateOffer(offerId, tenantId) {
        const metaKey = tenantId ? `ref:offer:meta:${tenantId}:${offerId}` : `ref:offer:meta:${offerId}`;
        const statusKey = tenantId ? `ref:offer:status:${tenantId}:${offerId}` : `ref:offer:status:${offerId}`;
        await redis.del(metaKey, statusKey);
    }

    async invalidatePublisher(publisherId, tenantId) {
        const key = tenantId
            ? `ref:publisher:${tenantId}:${publisherId}`
            : `ref:publisher:${publisherId}`;
        await redis.del(key);
    }

    async invalidateAssignment(publisherId, offerId, tenantId) {
        const key = tenantId
            ? `ref:assign:${tenantId}:${publisherId}:${offerId}`
            : `ref:assign:${publisherId}:${offerId}`;
        await redis.del(key);
    }
}

export default new CacheService();
