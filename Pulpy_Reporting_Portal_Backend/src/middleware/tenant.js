import pool from '../db/connection.js';
import logger from '../utils/logger.js';

/**
 * Tenant Resolution Middleware
 * 
 * Extracts tenant from subdomain and attaches to request context.
 * 
 * Subdomain format: {tenant_slug}.track-myads.com
 * Examples:
 *   - owner1.track-myads.com -> tenant slug: "owner1"
 *   - admin.track-myads.com -> special admin subdomain (no tenant)
 *   - api.track-myads.com -> API subdomain (no tenant, but can accept tenant header)
 */
export async function resolveTenant(request, reply) {
  try {
    // Skip tenant resolution for health checks, static assets, and debug endpoints
    if (request.url === '/health' || 
        request.url.startsWith('/static') || 
        request.url.startsWith('/debug/')) {
      return;
    }

    // Get host from request headers
    const host = request.headers.host || request.hostname || '';

    // Extract subdomain
    // Format: {subdomain}.{domain}
    // Examples: owner1.track-myads.com, admin.track-myads.com, api.track-myads.com
    const hostParts = host.split('.');

    // Special subdomains that don't require tenant resolution
    const specialSubdomains = ['admin', 'api', 'www'];

    // If host has at least 2 parts (subdomain.domain)
    if (hostParts.length >= 2) {
      const subdomain = hostParts[0].toLowerCase();

      // Check if it's a special subdomain
      if (specialSubdomains.includes(subdomain)) {
        // Admin subdomain - no tenant, but mark as admin
        if (subdomain === 'admin') {
          request.isAdminSubdomain = true;
        }
        // API subdomain - check for tenant in header or subdomain
        if (subdomain === 'api') {
          // Allow tenant to be passed via header for API calls
          const tenantSlug = request.headers['x-tenant-slug'] || request.headers['x-tenant-id'];
          if (tenantSlug) {
            const tenant = await getTenantBySlug(tenantSlug);
            if (tenant) {
              request.tenant = tenant;
              return;
            }
          }
        }
        return; // No tenant for special subdomains
      }

      // Regular tenant subdomain (e.g., owner1.track-myads.com)
      const tenant = await getTenantBySlug(subdomain);

      if (!tenant) {
        logger.warn(`Unknown tenant subdomain access attempt: ${subdomain}`, {
          host: host,
          subdomain: subdomain,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        return reply.code(404).send({
          success: false,
          error: 'Tenant Not Found',
          message: `No tenant found for subdomain: ${subdomain}. Please verify the subdomain is correct.`,
          subdomain: subdomain,
        });
      }

      // 🔒 STRICT: Reject suspended tenants immediately
      if (tenant.status !== 'active') {
        logger.warn(`Suspended tenant access attempt: ${subdomain}`, {
          tenant: tenant,
          host: host,
          ip: request.ip
        });
        return reply.code(403).send({
          success: false,
          error: 'Tenant Suspended',
          message: `Tenant "${tenant.name}" is currently suspended. Please contact support.`,
          tenant_slug: tenant.slug,
        });
      }

      // Attach tenant to request context
      request.tenant = tenant;
      request.tenantId = tenant.id;

      logger.debug(`Tenant resolved: ${tenant.slug} (ID: ${tenant.id})`, { host, subdomain });
    } else {
      // 🔒 STRICT MULTI-TENANT: No subdomain = HARD REJECTION
      // Tenant identity MUST come from subdomain (Host header)
      // Business identifiers (offer_id, pub_id) are NEVER used for tenant resolution
      
      // For tracking endpoints, STRICTLY require tenant subdomain
      if (request.url && (request.url.startsWith('/click') || request.url.startsWith('/imp') || request.url.startsWith('/postback'))) {
        logger.warn('❌ Tracking endpoint accessed without tenant subdomain - REJECTED', {
          host,
          url: request.url,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        return reply.code(400).send({
          success: false,
          error: 'Tenant Required',
          message: 'Tracking endpoints require a valid tenant subdomain. Access via tenant subdomain (e.g., tenant1.localhost:5001/click for local testing).',
          host: host,
          url: request.url,
          note: 'For local testing, use tenant subdomain: tenant1.localhost:5001/click'
        });
      }
      
      // For other endpoints, also require tenant subdomain
      logger.warn('No subdomain detected in host - REJECTED', { host, url: request.url });
      return reply.code(400).send({
        success: false,
        error: 'Tenant Required',
        message: 'This endpoint requires a valid tenant subdomain. Please access via tenant subdomain.',
        host: host
      });
    }
  } catch (error) {
    logger.error('Tenant resolution error:', error);
    // Don't fail the request, but log the error
    // Some endpoints might work without tenant (like health checks)
  }
}

/**
 * Get tenant by slug
 */
async function getTenantBySlug(slug) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, slug, status, created_at FROM tenants WHERE slug = ? LIMIT 1',
      [slug]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error) {
    logger.error('Error fetching tenant by slug:', error);
    return null;
  }
}

/**
 * Middleware to require tenant context
 * Use this on routes that MUST have a tenant
 */
export async function requireTenant(request, reply) {
  if (!request.tenant || !request.tenantId) {
    return reply.code(400).send({
      success: false,
      error: 'Tenant Required',
      message: 'This endpoint requires a tenant context. Please access via tenant subdomain.',
    });
  }
}

/**
 * Middleware to require admin subdomain
 * Use this on admin-only routes
 */
export async function requireAdminSubdomain(request, reply) {
  if (!request.isAdminSubdomain) {
    return reply.code(403).send({
      success: false,
      error: 'Admin Access Required',
      message: 'This endpoint requires admin subdomain access.',
    });
  }
}

/**
 * Helper to get tenant ID from request
 * Returns null if no tenant
 */
export function getTenantId(request) {
  return request.tenantId || null;
}
