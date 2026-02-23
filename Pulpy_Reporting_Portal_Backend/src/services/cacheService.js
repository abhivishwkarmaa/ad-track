import pool from '../db/connection.js';
import { getUtcBoundaries, nowIST } from '../utils/dateUtils.js';
import dayjs from 'dayjs';

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
        let period = '';
        if (duration === 'daily') {
            period = nowIST('YYYY-MM-DD');
        } else if (duration === 'weekly') {
            period = dayjs().tz('Asia/Kolkata').startOf('week').format('YYYY-MM-DD');
        } else if (duration === 'monthly') {
            period = nowIST('YYYY-MM');
        }

        return `cap:${tenantId}:${entityType}:${entityId}:${capType}:${duration}:${period}`;
    }

    async _hydrateCapFromDB(entityType, entityId, capType, duration, tenantId) {
        let startUTC, endUTC;

        if (duration === 'daily') {
            const boundaries = getUtcBoundaries(nowIST('YYYY-MM-DD'), nowIST('YYYY-MM-DD'));
            startUTC = boundaries.utcStart;
            endUTC = boundaries.utcEnd;
        } else if (duration === 'weekly') {
            const startOfWeek = dayjs().tz('Asia/Kolkata').startOf('week').format('YYYY-MM-DD');
            const endOfWeek = dayjs().tz('Asia/Kolkata').endOf('week').format('YYYY-MM-DD');
            const boundaries = getUtcBoundaries(startOfWeek, endOfWeek);
            startUTC = boundaries.utcStart;
            endUTC = boundaries.utcEnd;
        } else if (duration === 'monthly') {
            const startOfMonth = dayjs().tz('Asia/Kolkata').startOf('month').format('YYYY-MM-DD');
            const endOfMonth = dayjs().tz('Asia/Kolkata').endOf('month').format('YYYY-MM-DD');
            const boundaries = getUtcBoundaries(startOfMonth, endOfMonth);
            startUTC = boundaries.utcStart;
            endUTC = boundaries.utcEnd;
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
