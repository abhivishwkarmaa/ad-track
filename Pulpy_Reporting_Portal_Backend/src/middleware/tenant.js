import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import tenantResolutionService from '../services/tenantResolutionService.js';
import {
  TenantNotFoundError,
  TenantSuspendedError,
  TenantRequiredError
} from '../utils/secureErrors.js';

/**
 * Tenant Resolution Middleware
 * 
 * 🔒 STRICT SUBDOMAIN-BASED MULTI-TENANCY
 * 
 * Extracts tenant EXCLUSIVELY from subdomain (Host header).
 * NEVER accepts tenant from client headers (Origin, Referer, x-tenant-*, etc.)
 * 
 * Subdomain format: {tenant_slug}.track-myads.com
 * Examples:
 *   - owner1.track-myads.com -> tenant slug: "owner1"
 *   - admin.track-myads.com -> special admin subdomain (no tenant)
 *   - api.track-myads.com -> API subdomain (no tenant, no header fallback)
 */
export async function resolveTenant(request, reply) {
  try {
    // Skip tenant resolution for health checks, static assets, and debug endpoints
    if (request.url === '/health' ||
      request.url.startsWith('/static') ||
      request.url.startsWith('/debug/')) {
      return;
    }

    // ✅ CRITICAL: Get host from forwarded headers (for VPS/NGINX reverse proxy)
    // Priority order:
    // 1. X-Forwarded-Host (set by NGINX when behind reverse proxy)
    // 2. Host header (direct access or if X-Forwarded-Host not set)
    // 3. request.hostname (Fastify's parsed hostname, only works with trustProxy: true)
    const host = request.headers['x-forwarded-host'] ||
      request.headers.host ||
      request.hostname ||
      '';

    // Log host resolution for debugging
    logger.debug('Tenant resolution - Host extraction', {
      'x-forwarded-host': request.headers['x-forwarded-host'],
      'host': request.headers.host,
      'hostname': request.hostname,
      'resolved-host': host,
      'url': request.url
    });

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
        // 🔒 STRICT: API subdomain has no tenant - no header fallback allowed
        // All API calls must use tenant subdomain (e.g., tenant1.domain.com/api/...)
        return; // No tenant for special subdomains
      }

      // Regular tenant subdomain (e.g., owner1.track-myads.com)
      // Use the new deterministic resolution service (Redis -> DB)
      const tenant = await tenantResolutionService.resolveTenant(subdomain);

      if (!tenant) {
        // ✅ Log full details server-side
        logger.warn(`Unknown tenant subdomain access attempt: ${subdomain}`, {
          host: host,
          subdomain: subdomain,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          url: request.url
        });
        // ✅ Throw error instead of sending response directly
        throw new TenantNotFoundError('Tenant not found', subdomain);
      }

      // 🔒 STRICT: Reject suspended tenants immediately
      if (tenant.status !== 'active') {
        // ✅ Log full details server-side
        logger.warn(`Suspended tenant access attempt: ${subdomain}`, {
          tenant: tenant,
          host: host,
          ip: request.ip,
          url: request.url
        });
        // ✅ Throw error instead of sending response directly
        throw new TenantSuspendedError('Tenant suspended', tenant.slug);
      }

      // Attach tenant to request context
      request.tenant = tenant;
      request.tenantId = tenant.id;

      logger.debug(`Tenant resolved: ${tenant.slug} (ID: ${tenant.id})`, { host, subdomain });
    } else {
      // 🔒 STRICT MULTI-TENANT: No subdomain = HARD REJECTION
      // Tenant identity MUST come from subdomain (Host header)
      // Business identifiers (offer_id, pub_id) are NEVER used for tenant resolution

      // ✅ Log full details server-side
      logger.warn('No subdomain detected in host - REJECTED', {
        host,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      // ✅ Throw error instead of sending response directly
      // Error handler will create appropriate response based on endpoint type
      throw new TenantRequiredError('Tenant required');
    }
  } catch (error) {
    logger.error('Tenant resolution error:', error);
    // Don't fail the request, but log the error
    // Some endpoints might work without tenant (like health checks)
  }
}

/**
 * Middleware to require tenant context
 * Use this on routes that MUST have a tenant
 */
export async function requireTenant(request, reply) {
  if (!request.tenant || !request.tenantId) {
    // ✅ Throw error instead of sending response directly
    throw new TenantRequiredError('Tenant required');
  }
}

/**
 * Middleware to require admin subdomain
 * Use this on admin-only routes
 */
export async function requireAdminSubdomain(request, reply) {
  if (!request.isAdminSubdomain) {
    // ✅ Throw error instead of sending response directly
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }
}

/**
 * Helper to get tenant ID from request
 * Returns null if no tenant
 */
export function getTenantId(request) {
  return request.tenantId || null;
}
