import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { getTenantId } from './tenant.js';
import redis from '../config/redis.js';

// JWT secrets - separate for admin and tenant users
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-secret-key-change-in-production';
const TENANT_JWT_SECRET = process.env.TENANT_JWT_SECRET || process.env.JWT_SECRET || 'tenant-secret-key-change-in-production';
const REFRESH_COOKIE_NAME = 'refresh_token';
const SESSION_TTL_MS = 15 * 60 * 1000;

/**
 * JWT authentication middleware
 * Supports both admin (super admin) and tenant admin authentication
 */
export async function authenticateAdmin(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header. Please provide a Bearer token.',
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Token is required',
      });
    }
    
    // Verify JWT token - try both admin and tenant secrets
    // This allows backward compatibility during migration
    let decoded;
    let isAdminToken = false;
    
    try {
      // Try admin secret first (for super admins)
      decoded = jwt.verify(token, ADMIN_JWT_SECRET);
      isAdminToken = true;
    } catch (adminError) {
      try {
        // Try tenant secret (for tenant admins)
        decoded = jwt.verify(token, TENANT_JWT_SECRET);
        isAdminToken = false;
      } catch (tenantError) {
        // Fallback to old secret for backward compatibility
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
          logger.warn('Using legacy JWT secret - consider migrating to new secrets');
        } catch (legacyError) {
          // All attempts failed
          throw adminError; // Throw the first error
        }
      }
    }
    
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Missing refresh token',
      });
    }

    const sessionKey = `auth:session:${refreshToken}`;
    const sessionRaw = await redis.get(sessionKey);

    if (!sessionRaw) {
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Session expired',
      });
    }

    let session;
    try {
      session = JSON.parse(sessionRaw);
    } catch (parseError) {
      await redis.del(sessionKey);
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Session invalid',
      });
    }

    if (session?.user_id && decoded?.id && parseInt(session.user_id) !== parseInt(decoded.id)) {
      await redis.del(sessionKey);
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Session mismatch',
      });
    }

    if (Date.now() - session.last_activity > SESSION_TTL_MS) {
      await redis.del(sessionKey);
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Session expired',
      });
    }

    // Activity tracking: update last_activity only for user-initiated requests
    const isUserActivity = request.headers['x-user-activity'] === '1';
    if (isUserActivity) {
      await redis.set(
        sessionKey,
        JSON.stringify({
          ...session,
          last_activity: Date.now(),
        }),
        'KEEPTTL'
      );
    }

    // Get admin info from database (handle tenant_id column gracefully)
    let [rows] = [];
    try {
      // Try query with tenant_id first
      [rows] = await pool.query(
        'SELECT id, email, name, role, tenant_id FROM admin_users WHERE id = ? AND email = ?',
        [decoded.id, decoded.email]
      );
    } catch (error) {
      // If tenant_id column doesn't exist, fall back to query without it
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('tenant_id')) {
        logger.warn('tenant_id column not found in admin_users table. Please run migration.');
        [rows] = await pool.query(
          'SELECT id, email, name, role FROM admin_users WHERE id = ? AND email = ?',
          [decoded.id, decoded.email]
        );
      } else {
        // Re-throw if it's a different error
        throw error;
      }
    }
    
    if (!rows || rows.length === 0) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token or user not found',
      });
    }
    
    const admin = rows[0];
    
    // Get tenant_id (may be undefined if column doesn't exist)
    const tenantId = admin.tenant_id !== undefined ? admin.tenant_id : null;
    const sessionTenantId = session?.tenant_id !== undefined ? session?.tenant_id : null;

    if (sessionTenantId !== null && tenantId !== null && parseInt(sessionTenantId) !== parseInt(tenantId)) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Session tenant mismatch',
      });
    }

    if (sessionTenantId === null && tenantId !== null) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Session tenant mismatch',
      });
    }
    
    // 🔒 STRICT TENANT ISOLATION ENFORCEMENT
    // Rule 1: Super admins (tenant_id = NULL) can ONLY access via admin subdomain
    if (!tenantId) {
      if (!request.isAdminSubdomain) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Super admin access is only allowed via admin subdomain',
        });
      }
    }
    
    // Rule 2: Tenant admins MUST have matching tenant context
    if (tenantId) {
      const requestTenantId = getTenantId(request);
      
      // 🔒 STRICT: Tenant admin MUST have matching tenant subdomain
      // This should never happen if login validation worked correctly, but defense-in-depth
      if (!requestTenantId) {
        // Tenant admin trying to access without tenant subdomain = REJECT
        logger.error('[AUTH] Tenant admin accessing without tenant subdomain - REJECTED', {
          jwtTenantId: tenantId,
          requestTenantId: requestTenantId,
          adminId: admin.id,
          email: admin.email,
          host: request.headers.host
        });
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Tenant admin access requires tenant subdomain. Please access via your tenant subdomain.',
        });
      }
      
      // 🔒 STRICT: JWT tenant_id MUST match request tenant_id (from subdomain)
      if (parseInt(requestTenantId) !== parseInt(tenantId)) {
        logger.error('[AUTH] Tenant mismatch detected - REJECTED', {
          jwtTenantId: tenantId,
          requestTenantId: requestTenantId,
          adminId: admin.id,
          email: admin.email,
          host: request.headers.host
        });
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'JWT tenant_id does not match request tenant. Access denied.',
        });
      }
      
      // Rule 3: Verify tenant is active (not suspended)
      if (request.tenant) {
        if (request.tenant.status !== 'active') {
          logger.warn('[AUTH] Suspended tenant access attempt', {
            tenantId: tenantId,
            tenantSlug: request.tenant.slug,
            adminId: admin.id
          });
          return reply.code(403).send({
            success: false,
            error: 'Tenant Suspended',
            message: `Tenant "${request.tenant.name}" is currently suspended. Please contact support.`,
          });
        }
      } else {
        // Tenant not found in request but admin has tenant_id
        // This shouldn't happen if tenant middleware worked correctly
        logger.error('[AUTH] Tenant not found in request context', {
          tenantId: tenantId,
          adminId: admin.id,
          host: request.headers.host
        });
        return reply.code(403).send({
          success: false,
          error: 'Tenant Not Found',
          message: 'Tenant context not found. Please access via tenant subdomain.',
        });
      }
    }
    
    // Super admin check (no tenant_id = super admin)
    const isSuperAdmin = !tenantId;
    
    // Attach admin info to request
    request.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      tenantId: tenantId,
      isSuperAdmin: isSuperAdmin,
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Token has expired. Please login again.',
      });
    }
    
    logger.error('Auth error:', error);
    logger.error('Auth error stack:', error.stack);
    return reply.code(500).send({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication failed',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message }),
    });
  }
}

/**
 * Middleware to require super admin access
 * Only users without tenant_id can access
 */
export async function requireSuperAdmin(request, reply) {
  if (!request.admin || !request.admin.isSuperAdmin) {
    return reply.code(403).send({
      success: false,
      error: 'Forbidden',
      message: 'This endpoint requires super admin access',
    });
  }
}
