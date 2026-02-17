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
        let query = 'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?';
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

    async getCapStatus(entityType, entityId, obj, tenantId) {
        // entityType: 'offer' or 'publisher'
        // capType: 'budget' or 'conversion'
        // duration: 'daily', 'weekly', 'monthly'

        const capType = obj.capping_type;
        const duration = obj.capping_duration;

        let limit = 0;
        if (entityType === 'offer') {
            if (capType === 'budget') limit = parseFloat(obj.budget_cap || 0);
            else if (capType === 'conversion') limit = parseInt(obj.conversion_cap || 0);
        } else {
            // Publisher Assignment (Support both raw DB rows and formatted objects)
            if (capType === 'budget') {
                limit = parseFloat(obj.capping_amount ?? obj.capping_budget_amount ?? 0);
            } else if (capType === 'conversion') {
                limit = parseInt(obj.capping_amount ?? obj.capping_conversions_amount ?? 0);
            }
        }

        if (!capType || capType === 'none' || !duration || limit <= 0) {
            return { isHit: false, current: 0, limit: 0 };
        }

        const key = this._getCapKey(entityType, entityId, capType, duration, tenantId);
        let current = await redis.get(key);

        if (current === null) {
            current = await this._hydrateCapFromDB(entityType, entityId, capType, duration, tenantId);
            // Set TTL based on duration
            let ttl = 86400; // default 1 day
            if (duration === 'weekly') ttl = 604800;
            if (duration === 'monthly') ttl = 2678400;
            await redis.setex(key, ttl, current);
        }

        return {
            isHit: parseFloat(current) >= limit,
            current: parseFloat(current),
            limit: limit
        };
    }

    async incrementCap(entityType, entityId, obj, amount, tenantId) {
        const capType = obj.capping_type;
        const duration = obj.capping_duration;

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

        // Update Redis
        try {
            await redis.incrbyfloat(key, incrementValue);
            // Ensure TTL is refreshed or set if key was missing (concurrently created?)
            // Usually we rely on init. If we incr a non-existent key, it starts at 0+inc.
            // We should ensure extensive TTL if new. Not critical if short overlap.
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
        const tz = '+05:30';
        let dateCond = '';
        if (duration === 'daily') {
            dateCond = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
        } else if (duration === 'weekly') {
            dateCond = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
        } else if (duration === 'monthly') {
            dateCond = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
        } else {
            return 0;
        }

        let query = '';
        let params = [];

        // Count ONLY Approved + Pending. Exclude Rejected/RejectedCap.
        const statusCond = "status IN ('approved', 'pending')";

        if (entityType === 'offer') {
            if (capType === 'budget') {
                // Offer Budget = Revenue
                query = `SELECT COALESCE(SUM(amount), 0) as val FROM conversions WHERE offer_id = ? AND ${dateCond} AND ${statusCond}`;
            } else {
                query = `SELECT COUNT(*) as val FROM conversions WHERE offer_id = ? AND ${dateCond} AND ${statusCond}`;
            }
            params.push(entityId);
        } else {
            // Publisher Budget = Payout
            if (capType === 'budget') {
                query = `SELECT COALESCE(SUM(payout), 0) as val FROM conversions WHERE publisher_offer_id = ? AND ${dateCond} AND ${statusCond}`;
            } else {
                query = `SELECT COUNT(*) as val FROM conversions WHERE publisher_offer_id = ? AND ${dateCond} AND ${statusCond}`;
            }
            params.push(entityId);
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
}

export default new CacheService();
