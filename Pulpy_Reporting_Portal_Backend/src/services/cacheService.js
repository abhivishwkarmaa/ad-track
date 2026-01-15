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
    CAP_COUNTERS: 86400 // 24 Hours
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

    async checkAndIncrementCap(offerId, capType, limit, increment = false, tenantId = null) {
        if (!limit || limit <= 0) return true; // No cap

        // ✅ CRITICAL: Include tenant_id in Redis key for tenant isolation
        const key = tenantId 
            ? `stats:cap:${tenantId}:${offerId}:${capType}` 
            : `stats:cap:${offerId}:${capType}`; // e.g., stats:cap:1:15:daily

        let current = 0;
        try {
            // Check current value
            current = await redis.get(key);
            if (current === null) {
                // ✅ CRITICAL: Hydrate from DB if missing with tenant_id filtering
                current = await this._hydrateCapCount(offerId, capType, tenantId);
                await redis.setex(key, TTL.CAP_COUNTERS, current);
            }
        } catch (e) {
            // Redis Fail: Secure Open or Close? 
            // "Never lose money" -> Secure Close (Reject if unsure) or Fallback to DB query
            // For performance, we might Assume OK or Fallback.
            // Let's Fallback to DB query in calling service if this throws.
            throw e;
        }

        if (parseInt(current) >= limit) return false; // Cap Hit

        if (increment) {
            // Atomic Increment
            await redis.incr(key);
        }
        return true;
    }

    async _hydrateCapCount(offerId, capType, tenantId = null) {
        // ✅ CRITICAL: DB Count logic with tenant_id filtering
        let sql = '';
        const params = [offerId];
        
        if (capType === 'daily') {
            sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND created_at >= CURDATE()';
        } else if (capType === 'total') {
            sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?';
        } else {
            return 0;
        }
        
        // ✅ CRITICAL: Add tenant_id filtering
        if (tenantId) {
            sql += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        const [rows] = await pool.query(sql, params);
        return (Array.isArray(rows) ? rows[0] : rows).cnt || 0;
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
