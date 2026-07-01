import redis from '../config/redis.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';
import logger from '../utils/logger.js';
import pool from '../db/connection.js';

/** publisher_offers columns needed for tracking (capping + publisher fallback redirect) */
export const PUBLISHER_OFFERS_TRACKING_COLUMNS = `id, public_assignment_id, publisher_id, offer_id, tenant_id, payout_override, cap_override, conversion_approval_percentage, capping_type, capping_duration, capping_action, fallback_type, fallback_url, fallback_offer_id, capping_budget_duration, capping_budget_amount, capping_conversions_duration, capping_conversions_amount, callback_url, destination_url, status, assigned_at, updated_at, notes`;

const TTL = {
    OFFER: 300,        // 5 Minutes (Reference data doesn't change often)
    PUBLISHER: 300,
    ASSIGNMENT: 300,
    CAP_COUNTERS: 14400, // 4 Hours
};

export class CacheService {

    // --- Reference Data Lookups (Read-Through) ---

    async getOffer(offerId, tenantId = null) {
        // ✅ CRITICAL: Include tenant_id in cache key for tenant isolation
        const key = tenantId
            ? `ref:offer:${tenantId}:${offerId}`
            : `ref:offer:${offerId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) {
                // Redis returns strings; strictly typed fields might need conversion
                return this._deserialize(cached);
            }
        } catch (e) {
            logger.warn(`Redis getOffer error: ${e.message}`);
        }

        // ✅ CRITICAL: DB Fallback with tenant_id filtering
        const offer = await offerService.getOfferById(offerId, tenantId);
        if (offer) {
            // Async Cache Population (don't block response)
            this._cacheObject(key, offer, TTL.OFFER);
        }
        return offer;
    }

    /**
     * Cached variant of `offerService.getInternalOfferIdByPublicId`.
     * Maps tenant-scoped public_offer_id → internal id. Positive results only
     * (null/miss is not cached so newly-created offers are visible immediately).
     */
    async getInternalOfferIdByPublicId(publicOfferId, tenantId) {
        if (publicOfferId == null || !tenantId) return null;
        const key = `ref:publicOffer:${tenantId}:${publicOfferId}`;
        try {
            const cached = await redis.get(key);
            if (cached) {
                const n = parseInt(cached, 10);
                if (!Number.isNaN(n) && n > 0) return n;
            }
        } catch (e) {
            logger.warn(`Redis getInternalOfferIdByPublicId error: ${e.message}`);
        }

        const internalId = await offerService.getInternalOfferIdByPublicId(publicOfferId, tenantId);
        if (internalId) {
            try { await redis.setex(key, TTL.OFFER, String(internalId)); } catch (e) { /* ignore */ }
        }
        return internalId;
    }

    /**
     * Cached variant of `offerService.getOfferById(id, tenantId, true)` — strict
     * internal-id lookup, returns full offer row. Mirrors `getOffer` but always
     * with `internalOnly=true` so we never accidentally match a public_offer_id
     * when the caller already resolved to an internal id.
     */
    async getOfferByInternalId(internalId, tenantId) {
        if (internalId == null || !tenantId) return null;
        const key = `ref:offer:${tenantId}:${internalId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return this._deserialize(cached);
        } catch (e) {
            logger.warn(`Redis getOfferByInternalId error: ${e.message}`);
        }

        const offer = await offerService.getOfferById(internalId, tenantId, true);
        if (offer) {
            this._cacheObject(key, offer, TTL.OFFER);
        }
        return offer;
    }

    /**
     * Cached variant of `offerPublicIdService.getPublisherByPublicId`.
     * Tenant-scoped public_publisher_id → full publisher row.
     * Uses dynamic import to avoid a top-level circular dependency with
     * `offerPublicIdService` (rare cap-fallback paths import the latter).
     */
    async getPublisherByPublicId(publicPublisherId, tenantId) {
        if (publicPublisherId == null || !tenantId) return null;
        const key = `ref:publicPublisher:${tenantId}:${publicPublisherId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return this._deserialize(cached);
        } catch (e) {
            logger.warn(`Redis getPublisherByPublicId error: ${e.message}`);
        }

        const { default: offerPublicIdService } = await import('./offerPublicIdService.js');
        const publisher = await offerPublicIdService.getPublisherByPublicId(publicPublisherId, tenantId);
        if (publisher) {
            this._cacheObject(key, publisher, TTL.PUBLISHER);
        }
        return publisher;
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
        let query = `SELECT ${PUBLISHER_OFFERS_TRACKING_COLUMNS} FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?`;
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
    // Keys: cap:{tenantId}:{offer|publisher}:{entityId}:{budget|conversion}:{daily|weekly|monthly}:{period}
    // Offer and publisher (assignment) share the same Redis counter pattern + DB hydrate + incr.

    /**
     * Publisher rows may use legacy split columns (capping_budget_* / capping_conversions_*).
     * Redis HGETALL returns strings — normalize so cap checks match offer-style behaviour.
     */
    _normalizeCapEntity(entityType, obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (entityType !== 'publisher') return obj;

        const o = { ...obj };
        const ct = o.capping_type;
        if (!o.capping_duration) {
            if (ct === 'budget' && o.capping_budget_duration) {
                o.capping_duration = o.capping_budget_duration;
            } else if (ct === 'conversion' && o.capping_conversions_duration) {
                o.capping_duration = o.capping_conversions_duration;
            }
        }
        if (ct === 'budget') {
            if (o.capping_amount == null || o.capping_amount === '') {
                const v = o.capping_budget_amount;
                if (v != null && v !== '') o.capping_amount = parseFloat(v);
            }
        } else if (ct === 'conversion') {
            if (o.capping_amount == null || o.capping_amount === '') {
                const v = o.capping_conversions_amount;
                if (v != null && v !== '') o.capping_amount = parseInt(v, 10);
            }
        }
        return o;
    }

    _capKeyTTL(duration) {
        if (duration === 'weekly') return 604800;
        if (duration === 'monthly') return 2678400;
        return 86400;
    }

    async getCapStatus(entityType, entityId, obj, tenantId) {
        // entityType: 'offer' or 'publisher' (publisher = publisher_offers.id / assignment id)
        // capType: 'budget' or 'conversion'
        // duration: 'daily', 'weekly', 'monthly'

        const o = this._normalizeCapEntity(entityType, obj);
        const capType = o.capping_type;
        const duration = o.capping_duration;

        let limit = 0;
        if (entityType === 'offer') {
            if (capType === 'budget') limit = parseFloat(o.budget_cap || 0);
            else if (capType === 'conversion') limit = parseInt(o.conversion_cap || 0);
        } else {
            if (capType === 'budget') {
                limit = parseFloat(o.capping_amount ?? o.capping_budget_amount ?? 0);
            } else if (capType === 'conversion') {
                limit = parseInt(o.capping_amount ?? o.capping_conversions_amount ?? 0, 10);
            }
        }

        if (!capType || capType === 'none' || !duration) {
            return { isHit: false, current: 0, limit: 0 };
        }

        if (limit === 0) {
            const action = o.capping_action || 'stop';
            if (action === 'fallback') {
                return { isHit: true, current: 0, limit: 0 };
            }
            return { isHit: false, current: 0, limit: 0 };
        }

        if (limit < 0) {
            return { isHit: false, current: 0, limit: 0 };
        }

        const key = this._getCapKey(entityType, entityId, capType, duration, tenantId);
        const metaKey = `${key}:meta`; // stores last_hydrate_ms / last_update_ms for self-healing
        let current = await redis.get(key);

        if (current === null) {
            current = await this._hydrateCapFromDB(entityType, entityId, capType, duration, tenantId);
            const ttl = this._capKeyTTL(duration);
            await redis.setex(key, ttl, String(current));
            // Track hydration time to avoid repeated DB hits when keys exist but are stale.
            await redis.setex(metaKey, ttl, JSON.stringify({ last_hydrate_ms: Date.now() }));
        } else {
            // Self-healing: counters can drift low if some conversion insert paths skip incrementCap
            // or if worker lag/drop happens. We periodically reconcile upward from DB.
            // Important: we only ever increase the counter (max of Redis vs DB) to avoid loosening caps.
            try {
                const ttl = this._capKeyTTL(duration);
                const metaRaw = await redis.get(metaKey);
                let lastHydrateMs = 0;
                if (metaRaw) {
                    try {
                        const meta = JSON.parse(metaRaw);
                        lastHydrateMs = Number(meta?.last_hydrate_ms || 0);
                    } catch (e) {
                        lastHydrateMs = 0;
                    }
                }

                // Rate limit DB reconciliation to once per 5 minutes per cap key.
                const nowMs = Date.now();
                const reconcileIntervalMs = 5 * 60 * 1000;
                if (!lastHydrateMs || (nowMs - lastHydrateMs) >= reconcileIntervalMs) {
                    const redisVal = parseFloat(current);
                    const dbVal = await this._hydrateCapFromDB(entityType, entityId, capType, duration, tenantId);
                    if (Number.isFinite(dbVal) && Number.isFinite(redisVal) && dbVal > redisVal) {
                        await redis.setex(key, ttl, String(dbVal));
                        current = String(dbVal);
                    }
                    await redis.setex(metaKey, ttl, JSON.stringify({ last_hydrate_ms: nowMs }));
                }
            } catch (e) {
                // Never fail cap checks due to reconciliation errors; keep Redis value as source of truth.
                logger.warn(`Cap reconciliation failed for ${key}: ${e.message}`);
            }
        }

        return {
            isHit: parseFloat(current) >= limit,
            current: parseFloat(current),
            limit: limit
        };
    }

    async incrementCap(entityType, entityId, obj, amount, tenantId) {
        const o = this._normalizeCapEntity(entityType, obj);
        const capType = o.capping_type;
        const duration = o.capping_duration;

        if (!capType || capType === 'none' || !duration) return;

        let incrementValue = 0;
        // Rules:
        // Offer Budget = Revenue (amount)
        // Offer Conversion = 1
        // Publisher Budget = Payout (amount check logic should pass payout here)
        // Publisher Conversion = 1

        if (entityType === 'offer' && capType === 'budget') incrementValue = amount; // Revenue
        else if (entityType === 'offer' && capType === 'conversion') incrementValue = 1;
        else if (entityType === 'publisher' && capType === 'budget') incrementValue = amount; // Payout
        else if (entityType === 'publisher' && capType === 'conversion') incrementValue = 1;

        if (incrementValue <= 0) return;

        const key = this._getCapKey(entityType, entityId, capType, duration, tenantId);
        const metaKey = `${key}:meta`;
        const ttl = this._capKeyTTL(duration);

        try {
            await redis.incrbyfloat(key, incrementValue);
            await redis.expire(key, ttl);
            // Record last update time for observability / reconciliation pacing.
            // Keep it best-effort; do not block conversion processing on this.
            try {
                await redis.setex(metaKey, ttl, JSON.stringify({ last_update_ms: Date.now() }));
            } catch (e) { /* ignore */ }
        } catch (e) {
            logger.warn(`Redis incr cap error: ${e.message}`);
        }
    }

    _getCapKey(entityType, entityId, capType, duration, tenantId) {
        const now = new Date();
        // Use IST (UTC+05:30)
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
            period = istTime.toISOString().slice(0, 7); // YYYY-MM
        }

        return `cap:${tenantId}:${entityType}:${entityId}:${capType}:${duration}:${period}`;
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
        const key = tenantId
            ? `ref:offer:${tenantId}:${offerId}`
            : `ref:offer:${offerId}`;
        await redis.del(key);
    }

    /** Invalidate the public_offer_id → internal id mapping for a tenant. */
    async invalidateOfferByPublicId(publicOfferId, tenantId) {
        if (publicOfferId == null || !tenantId) return;
        const key = `ref:publicOffer:${tenantId}:${publicOfferId}`;
        try { await redis.del(key); } catch (e) { /* ignore */ }
    }

    async invalidatePublisher(publisherId, tenantId) {
        const key = tenantId
            ? `ref:publisher:${tenantId}:${publisherId}`
            : `ref:publisher:${publisherId}`;
        await redis.del(key);
    }

    /** Invalidate the public_publisher_id → publisher row cache for a tenant. */
    async invalidatePublisherByPublicId(publicPublisherId, tenantId) {
        if (publicPublisherId == null || !tenantId) return;
        const key = `ref:publicPublisher:${tenantId}:${publicPublisherId}`;
        try { await redis.del(key); } catch (e) { /* ignore */ }
    }

    async invalidateAssignment(publisherId, offerId, tenantId) {
        const key = tenantId
            ? `ref:assign:${tenantId}:${publisherId}:${offerId}`
            : `ref:assign:${publisherId}:${offerId}`;
        await redis.del(key);
    }
}

export default new CacheService();
