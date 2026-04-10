import redis from '../config/redis.js';
import logger from '../utils/logger.js';


const TENANT_CACHE_TTL = 3600; // 1 hour

export class TenantResolutionService {
    constructor(tenantRepository) {
        this.tenantRepository = tenantRepository;
        this.redis = redis;
    }

    /**
     * Resolves a tenant by slug (subdomain) using a Redis-first strategy.
     * 
     * Flow:
     * 1. Check Redis for cached tenant
     * 2. If miss, check Database
     * 3. If found in DB, cache in Redis (read-through)
     * 4. Return tenant (or null if not found)
     * 
     * Note: This returns the tenant object regardless of status (active/suspended).
     * Status checking is the responsibility of the caller/middleware.
     * 
     * @param {string} slug - The subdomain/slug to resolve
     * @returns {Promise<Object|null>} - The tenant object or null
     */
    async resolveTenant(slug) {
        if (!slug) return null;

        const cacheKey = `tenant:slug:${slug}`;

        // 1. Try Redis
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                // We assume cached data is the source of truth until invalidated
                return JSON.parse(cached);
            }
        } catch (error) {
            // Redis failure should not block the request
            logger.warn(`Redis tenant lookup failed for ${slug}: ${error.message}`);
        }

        // 2. Fallback to DB
        try {
            const tenant = await this.tenantRepository.findBySlug(slug);

            if (!tenant) {
                // Tenant not found in DB
                // Per requirements: No negative caching
                return null;
            }

            // 3. Write back to Redis
            try {
                // Cache the result for future lookups
                await this.redis.set(cacheKey, JSON.stringify(tenant), 'EX', TENANT_CACHE_TTL);
            } catch (redisError) {
                logger.warn(`Failed to cache tenant ${slug}: ${redisError.message}`);
            }

            return tenant;

        } catch (dbError) {
            logger.error(`Database tenant resolution failed for ${slug}: ${dbError.message}`);
            throw dbError; // DB failure is critical, propagate error
        }
    }

    /**
     * Invalidates the cache for a specific tenant slug.
     * Call this whenever a tenant is updated (name, status, etc).
     * 
     * @param {string} slug 
     */
    async invalidateTenantCache(slug) {
        if (!slug) return;
        try {
            const cacheKey = `tenant:slug:${slug}`;
            await this.redis.del(cacheKey);
            logger.info(`Invalidated tenant cache for slug: ${slug}`);
        } catch (e) {
            logger.error(`Failed to invalidate tenant cache ${slug}: ${e.message}`);
        }
    }
}

// (no singleton export)
