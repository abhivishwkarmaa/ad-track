import redis from '../config/redis.js';



import logger from '../utils/logger.js';


const TTL = {
    OFFER: 300,        // 5 Minutes (Reference data doesn't change often)
    PUBLISHER: 300,
    ASSIGNMENT: 300,
    CAP_COUNTERS: 14400, // 4 Hours
};

export class CacheService {
    constructor(offerService, publisherService, assignmentService, cacheRepository) {
        this.offerService = offerService;
        this.publisherService = publisherService;
        this.assignmentService = assignmentService;
        this.cacheRepository = cacheRepository;
    }

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
        const offer = await this.offerService.getOfferById(offerId, tenantId);
        if (offer) {
            // Async Cache Population (don't block response)
            this._cacheObject(key, offer, TTL.OFFER);
        }
        return offer;
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
        const publisher = await this.publisherService.findById(publisherId, tenantId);
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

        // ✅ CRITICAL: DB Fallback with tenant_id filtering via repository
        const assignment = await this.cacheRepository.findAssignment(publisherId, offerId, tenantId);

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

        if (!capType || capType === 'none' || !duration || limit <= 0) {
            return { isHit: false, current: 0, limit: 0 };
        }

        const key = this._getCapKey(entityType, entityId, capType, duration, tenantId);
        let current = await redis.get(key);

        if (current === null) {
            current = await this._hydrateCapFromDB(entityType, entityId, capType, duration, tenantId);
            const ttl = this._capKeyTTL(duration);
            await redis.setex(key, ttl, String(current));
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
        const ttl = this._capKeyTTL(duration);

        try {
            await redis.incrbyfloat(key, incrementValue);
            await redis.expire(key, ttl);
        } catch (e) {
            logger.warn(`Redis incr cap error: ${e.message}`);
        }
    }

    _getCapKey(entityType, entityId, capType, duration, tenantId) {
        const now = new Date();
        const currentTime = now; // Use pure server time (Standardized UTC)

        let period = '';
        if (duration === 'daily') {
            period = currentTime.toISOString().split('T')[0];
        } else if (duration === 'weekly') {
            const d = new Date(Date.UTC(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            period = `${d.getUTCFullYear()}-W${weekNo}`;
        } else if (duration === 'monthly') {
            period = currentTime.toISOString().slice(0, 7); // YYYY-MM
        }

        return `cap:${tenantId}:${entityType}:${entityId}:${capType}:${duration}:${period}`;
    }

    async _hydrateCapFromDB(entityType, entityId, capType, duration, tenantId) {
        const now = new Date();
        // IST = UTC + 5:30
        const istNow = new Date(now.getTime());
        let startUTC, endUTC;

        if (duration === 'daily') {
            const dateStr = istNow.toISOString().split('T')[0];
            startUTC = `${dateStr} 00:00:00`;
            endUTC = `${dateStr} 23:59:59`;
        } else if (duration === 'weekly') {
            // Get Monday of current week (IST)
            const day = istNow.getUTCDay(); // 0-6 (Sun-Sat)
            const diff = istNow.getUTCDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(istNow.setDate(diff));
            const dateStr = monday.toISOString().split('T')[0];
            startUTC = `${dateStr} 00:00:00`;

            const sunday = new Date(monday.setDate(monday.getDate() + 6));
            const endDateStr = sunday.toISOString().split('T')[0];
            endUTC = `${endDateStr} 23:59:59`;
        } else if (duration === 'monthly') {
            const startOfMonth = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
            startUTC = `${startOfMonth.toISOString().split('T')[0]} 00:00:00`;

            const nextMonth = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0);
            endUTC = `${nextMonth.toISOString().split('T')[0]} 23:59:59`;
        } else {
            return 0;
        }

        try {
            return await this.cacheRepository.getCapHydrationValue(entityType, entityId, capType, startUTC, endUTC, tenantId);
        } catch (e) {
            logger.error(`Hydrate Cap DB Error: ${e.message}`, { entityType, entityId, capType });
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

// (no singleton export)
