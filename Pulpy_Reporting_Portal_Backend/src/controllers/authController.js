import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import emailService from '../services/emailService.js';
import crypto from 'crypto';
import redis from '../config/redis.js';
import subscriptionService from '../services/subscriptionService.js';
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
} from '../utils/authCookies.js';

// JWT secrets - separate for admin and tenant users
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-secret-key-change-in-production';
const TENANT_JWT_SECRET = process.env.TENANT_JWT_SECRET || process.env.JWT_SECRET || 'tenant-secret-key-change-in-production';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL_SECONDS = 180 * 60; // 180 minutes (3 hours)
const SESSION_TTL_MS = 180 * 60 * 1000; // 180 minutes (3 hours)

const generateRefreshToken = () => {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(32).toString('hex');
};

const refreshCookieSetOptions = (request) => ({
  ...getRefreshCookieOptions(request),
  maxAge: REFRESH_TTL_SECONDS,
});

export class AuthController {
  async register(request, reply) {
    try {
      const { email, name, password, role = 'admin' } = request.body;

      // ============================================
      // 🔒 STRICT TENANT-SCOPED REGISTRATION
      // ============================================
      // Registration must also respect tenant subdomain
      // Super admin registration: Only via admin subdomain
      // Tenant admin registration: Only via matching tenant subdomain

      // Validate input
      if (!email || !name || !password) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Email, name, and password are required',
        });
      }

      if (password.length < 6) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Password must be at least 6 characters long',
        });
      }

      // ✅ STEP 1: Resolve tenant from subdomain
      const requestTenantId = getTenantIdFromRequest(request);
      const isAdminSubdomain = request.isAdminSubdomain || false;

      logger.info('[REGISTER] Tenant resolution', {
        host: request.headers.host,
        requestTenantId: requestTenantId,
        isAdminSubdomain: isAdminSubdomain,
        email: email
      });

      // ✅ STEP 2: Check if admin already exists
      // Note: For tenant-scoped registration, check within tenant scope if tenant is specified
      let existingQuery = 'SELECT id FROM admin_users WHERE email = ?';
      const existingParams = [email];

      // If tenant subdomain is present, only check within that tenant (if you want tenant-scoped emails)
      // For now, email uniqueness is global, but we'll assign tenant_id based on subdomain
      const [existingRows] = await pool.query(existingQuery, existingParams);

      if (existingRows && existingRows.length > 0) {
        return reply.code(409).send({
          success: false,
          error: 'Conflict',
          message: 'Admin with this email already exists',
        });
      }

      // ✅ STEP 3: Determine tenant_id for new user
      // If registering via tenant subdomain, assign that tenant_id
      // If registering via admin subdomain, create as super admin (tenant_id = NULL)
      const tenantId = requestTenantId || null;

      // ✅ STEP 4: Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // ✅ STEP 5: Create admin user with tenant_id
      let insertQuery;
      let insertParams;

      try {
        // Try insert with tenant_id
        insertQuery = 'INSERT INTO admin_users (email, name, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)';
        insertParams = [email, name, passwordHash, role, tenantId];
        const [result] = await pool.query(insertQuery, insertParams);
        var adminId = result.insertId || result[0]?.insertId;
      } catch (error) {
        // If tenant_id column doesn't exist, fall back to insert without it
        if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('tenant_id')) {
          logger.warn('tenant_id column not found in admin_users table. Database schema update required.');
          insertQuery = 'INSERT INTO admin_users (email, name, password_hash, role) VALUES (?, ?, ?, ?)';
          insertParams = [email, name, passwordHash, role];
          const [result] = await pool.query(insertQuery, insertParams);
          adminId = result.insertId || result[0]?.insertId;
        } else {
          throw error;
        }
      }

      // ✅ STEP 6: Generate JWT token with appropriate secret
      const jwtSecret = tenantId ? TENANT_JWT_SECRET : ADMIN_JWT_SECRET;
      const tokenType = tenantId ? 'tenant' : 'admin';

      // Generate JWT token (include tenant_id and token type)
      const token = jwt.sign(
        { id: adminId, email, name, role, tenant_id: tenantId, token_type: tokenType },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_TTL }
      );

      const refreshToken = generateRefreshToken();
      await redis.set(
        `auth:session:${refreshToken}`,
        JSON.stringify({
          user_id: adminId,
          tenant_id: tenantId,
          last_activity: Date.now(),
        }),
        'EX',
        REFRESH_TTL_SECONDS
      );

      reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieSetOptions(request));

      logger.info('[REGISTER] Registration successful', {
        adminId: adminId,
        email: email,
        tenantId: tenantId,
        tokenType: tokenType,
        host: request.headers.host
      });

      return reply.code(201).send({
        success: true,
        message: 'Admin registered successfully',
        data: {
          id: adminId,
          email,
          name,
          role,
          tenant_id: tenantId, // Include tenant_id in response
          token,
        },
      });
    } catch (error) {
      logger.error('AuthController.register error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async login(request, reply) {
    try {
      const { email, password } = request.body;

      // ============================================
      // 🔒 STRICT TENANT-SCOPED AUTHENTICATION
      // ============================================
      // Rule: "Login is not global. Login is always per-tenant."
      // 
      // Flow:
      // 1. Resolve tenant from subdomain (Host header) FIRST
      // 2. Validate credentials
      // 3. Verify user belongs to resolved tenant
      // 4. Reject if tenant mismatch (treat as invalid credentials)
      // 5. Only issue token if tenant matches

      // Validate input
      if (!email || !password) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Email and password are required',
        });
      }

      // ✅ STEP 1: Resolve tenant from subdomain (Host header) - EXCLUSIVE source
      // Tenant must be resolved BEFORE credential validation
      const requestTenantId = getTenantIdFromRequest(request);
      const isAdminSubdomain = request.isAdminSubdomain || false;

      logger.info('[LOGIN] Tenant resolution', {
        host: request.headers.host,
        requestTenantId: requestTenantId,
        isAdminSubdomain: isAdminSubdomain,
        email: email
      });

      // ✅ STEP 2: Find admin user (include tenant_id)
      // Note: tenant_id column may not exist if migration hasn't been run yet
      let [rows] = [];
      // ⚠️ Schema drift tolerant queries:
      // Some deployments may not yet have: tenant_id, must_change_password, company_name, phone
      // Login must not 500 because of missing optional columns.
      try {
        [rows] = await pool.query(
          'SELECT id, email, name, password_hash, role, tenant_id, must_change_password, company_name, phone FROM admin_users WHERE email = ?',
          [email]
        );
      } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
          logger.warn('Optional admin_users columns missing; falling back to minimal login query. Database schema update required.', {
            message: error.message,
          });
          try {
            // Keep tenant_id if present (needed for tenant-scoped auth decisions)
            [rows] = await pool.query(
              'SELECT id, email, name, password_hash, role, tenant_id FROM admin_users WHERE email = ?',
              [email]
            );
          } catch (error2) {
            if (error2.code === 'ER_BAD_FIELD_ERROR') {
              [rows] = await pool.query(
                'SELECT id, email, name, password_hash, role FROM admin_users WHERE email = ?',
                [email]
              );
            } else {
              throw error2;
            }
          }
        } else {
          throw error;
        }
      }

      // ✅ STEP 3: Reject if user not found (before password check to avoid timing attacks)
      if (!rows || rows.length === 0) {
        logger.warn('[LOGIN] User not found', { email, host: request.headers.host });
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      const admin = Array.isArray(rows) ? rows[0] : rows;
      const userTenantId = admin.tenant_id !== undefined ? admin.tenant_id : null;
      const mustChangePassword = admin.must_change_password !== undefined ? Boolean(admin.must_change_password) : false;

      // ✅ STEP 4: Verify password
      const isValid = await bcrypt.compare(password, admin.password_hash);

      if (!isValid) {
        logger.warn('[LOGIN] Invalid password', { email, host: request.headers.host });
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      // ✅ STEP 5: STRICT TENANT VALIDATION
      // Tenant mismatch = Invalid credentials (not a post-login error)
      // 
      // Case 1: Super admin (userTenantId = NULL) must login via admin subdomain
      // Case 2: Tenant admin (userTenantId = X) must login via matching tenant subdomain
      // Case 3: Tenant admin trying to login via wrong tenant subdomain = REJECT
      // Case 4: Super admin trying to login via tenant subdomain = REJECT

      if (!userTenantId) {
        // User is super admin (tenant_id = NULL)
        if (!isAdminSubdomain) {
          // Super admin trying to login via tenant subdomain = REJECT
          logger.warn('[LOGIN] Super admin attempted login via tenant subdomain - REJECTED', {
            email: admin.email,
            adminId: admin.id,
            host: request.headers.host,
            requestTenantId: requestTenantId,
            isAdminSubdomain: isAdminSubdomain
          });
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid email or password',
            // Note: Don't reveal that credentials were correct - treat tenant mismatch as invalid credentials
          });
        }
        // Super admin + admin subdomain = ✅ OK
      } else {
        // User is tenant admin (userTenantId = X)
        if (!requestTenantId) {
          // Tenant admin trying to login via admin subdomain (or no subdomain) = REJECT
          logger.warn('[LOGIN] Tenant admin attempted login via admin subdomain - REJECTED', {
            email: admin.email,
            adminId: admin.id,
            userTenantId: userTenantId,
            host: request.headers.host,
            requestTenantId: requestTenantId,
            isAdminSubdomain: isAdminSubdomain
          });
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid email or password',
            // Note: Don't reveal that credentials were correct - treat tenant mismatch as invalid credentials
          });
        }

        // ✅ CRITICAL: User tenant must match request tenant
        if (parseInt(userTenantId) !== parseInt(requestTenantId)) {
          logger.warn('[LOGIN] Tenant mismatch - REJECTED (treated as invalid credentials)', {
            email: admin.email,
            adminId: admin.id,
            userTenantId: userTenantId,
            requestTenantId: requestTenantId,
            host: request.headers.host
          });
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid email or password',
            // 🔒 SECURITY: Don't reveal tenant mismatch - treat as invalid credentials
            // This prevents information leakage about which tenant the user belongs to
          });
        }

        // Verify tenant is not suspended (already checked in tenant middleware, but double-check)
        if (request.tenant) {
          const normalizedStatus = String(request.tenant.status || '').toUpperCase();
          if (normalizedStatus === 'SUSPENDED') {
            logger.warn('[LOGIN] Suspended tenant login attempt', {
              email: admin.email,
              tenantId: requestTenantId,
              tenantSlug: request.tenant.slug
            });
            return reply.code(403).send({
              success: false,
              error: 'Tenant Suspended',
              message: `Tenant "${request.tenant.name}" is currently suspended. Please contact support.`,
            });
          }
        }

        // Tenant admin + matching tenant subdomain = ✅ OK
      }

      // ✅ STEP 6: Handle subscription and trial logic (tenant users only)
      if (userTenantId) {
        try {
          // Update tenant state based on current dates
          await subscriptionService.updateTenantState(userTenantId);

          // Get current subscription status
          const subscriptionStatus = await subscriptionService.getTenantSubscriptionStatus(userTenantId);

          // Start trial on first login if not already started
          if (!subscriptionStatus.tenant.trial_start_at && !subscriptionStatus.tenant.subscription_start_at) {
            logger.info('[LOGIN] Starting trial on first login', {
              tenantId: userTenantId,
              userId: admin.id,
              email: admin.email
            });
            await subscriptionService.startTrial(userTenantId, admin.id);
          }

          // Re-fetch subscription status after potential trial start
          const updatedStatus = await subscriptionService.getTenantSubscriptionStatus(userTenantId);

          // Check if tenant has access
          const state = updatedStatus.tenant.status;
          if (state === 'SUSPENDED') {
            logger.warn('[LOGIN] Suspended tenant login blocked', {
              email: admin.email,
              tenantId: userTenantId,
              tenantSlug: updatedStatus.tenant.slug
            });
            return reply.code(403).send({
              success: false,
              error: 'Account Suspended',
              message: 'Your account has been suspended. Please contact billing@track-myads.com for assistance.',
              subscription_status: 'suspended'
            });
          }

          // Note: EXPIRED tenants can still log in, but will have restricted access
          // This is enforced by middleware on individual routes
        } catch (subscriptionError) {
          logger.error('[LOGIN] Error handling subscription logic:', subscriptionError);
          // Don't block login if subscription check fails
          // This ensures users can still access the system even if subscription service has issues
        }
      }

      // ✅ STEP 7: All validations passed - generate JWT token
      const tenantId = userTenantId; // Use user's tenant_id (matches request tenant)
      const jwtSecret = tenantId ? TENANT_JWT_SECRET : ADMIN_JWT_SECRET;
      const tokenType = tenantId ? 'tenant' : 'admin';

      // Generate JWT token (include tenant_id and token type)
      const token = jwt.sign(
        {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          tenant_id: tenantId,
          token_type: tokenType
        },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_TTL }
      );

      const refreshToken = generateRefreshToken();
      try {
        const setResult = await redis.set(
          `auth:session:${refreshToken}`,
          JSON.stringify({
            user_id: admin.id,
            tenant_id: tenantId,
            last_activity: Date.now(),
          }),
          'EX',
          REFRESH_TTL_SECONDS
        );
        if (setResult !== 'OK') {
          logger.error('[LOGIN] Redis session not stored', { setResult, adminId: admin.id });
          return reply.code(503).send({
            success: false,
            error: 'Service Unavailable',
            message: 'Session store unavailable. Please try again.',
          });
        }
      } catch (redisError) {
        logger.error({ err: redisError }, '[LOGIN] Redis session store failed');
        return reply.code(503).send({
          success: false,
          error: 'Service Unavailable',
          message: 'Session store unavailable. Please try again.',
        });
      }

      const cookieOpts = refreshCookieSetOptions(request);
      reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, cookieOpts);

      logger.info('[LOGIN] Login successful', {
        adminId: admin.id,
        email: admin.email,
        tenantId: tenantId,
        tokenType: tokenType,
        host: request.headers.host,
        cookieSecure: cookieOpts.secure,
        forwardedProto: request.headers['x-forwarded-proto'],
      });

      return reply.send({
        success: true,
        message: 'Login successful',
        data: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          tenant_id: tenantId, // Include tenant_id in response
          must_change_password: mustChangePassword,
          company_name: admin.company_name,
          phone: admin.phone,
          token,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'AuthController.login error');
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }


  async getProfile(request, reply) {
    try {
      // Admin info is already attached by auth middleware
      const hostUsed =
        request.headers['x-forwarded-host'] ||
        request.headers.host ||
        '';
      return reply.send({
        success: true,
        data: {
          ...request.admin,
          // Support debugging "works on my PC, not on client" — confirms subdomain → tenant resolution on the server
          ...(request.tenant && {
            tenant_slug: request.tenant.slug,
            tenant_name: request.tenant.name,
          }),
          request_host: hostUsed,
        },
      });
    } catch (error) {
      logger.error('AuthController.getProfile error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async updateProfile(request, reply) {
    try {
      const { id } = request.admin;
      const { fullName, name, companyName, phone } = request.body;

      const finalName = fullName || name;

      const updates = [];
      const params = [];

      if (finalName) {
        updates.push('name = ?');
        params.push(finalName);
      }
      if (companyName !== undefined) {
        updates.push('company_name = ?');
        params.push(companyName);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }

      if (updates.length === 0) {
        return reply.code(400).send({
          success: false,
          message: 'No fields to update'
        });
      }

      params.push(id);
      await pool.query(
        `UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      // Fetch updated user
      let [rows] = [];
      try {
        [rows] = await pool.query(
          'SELECT id, email, name, role, tenant_id, company_name, phone FROM admin_users WHERE id = ?',
          [id]
        );
      } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
          // Backward compatible response for older schemas
          [rows] = await pool.query(
            'SELECT id, email, name, role, tenant_id FROM admin_users WHERE id = ?',
            [id]
          );
        } else {
          throw error;
        }
      }

      return reply.send({
        success: true,
        message: 'Profile updated successfully',
        data: {
          ...rows[0],
          fullName: rows[0].name // Support both frontend naming conventions
        }
      });
    } catch (error) {
      logger.error('AuthController.updateProfile error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async refresh(request, reply) {
    try {
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
        reply.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions(request));
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
        reply.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions(request));
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Session invalid',
        });
      }

      if (Date.now() - session.last_activity > SESSION_TTL_MS) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Session expired',
        });
      }

      let [rows] = [];
      try {
        [rows] = await pool.query(
          'SELECT id, email, name, role, tenant_id, company_name, phone FROM admin_users WHERE id = ?',
          [session.user_id]
        );
      } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
          logger.warn('Optional admin_users columns missing; falling back to minimal refresh query. Database schema update required.', {
            message: error.message,
          });
          try {
            [rows] = await pool.query(
              'SELECT id, email, name, role, tenant_id FROM admin_users WHERE id = ?',
              [session.user_id]
            );
          } catch (error2) {
            if (error2.code === 'ER_BAD_FIELD_ERROR') {
              [rows] = await pool.query(
                'SELECT id, email, name, role FROM admin_users WHERE id = ?',
                [session.user_id]
              );
            } else {
              throw error2;
            }
          }
        } else {
          throw error;
        }
      }

      if (!rows || rows.length === 0) {
        await redis.del(sessionKey);
        reply.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions(request));
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'User not found',
        });
      }

      const admin = rows[0];
      const tenantId = admin.tenant_id !== undefined ? admin.tenant_id : null;
      const sessionTenantId = session?.tenant_id !== undefined ? session?.tenant_id : null;

      if (sessionTenantId !== null && tenantId !== null && parseInt(sessionTenantId) !== parseInt(tenantId)) {
        await redis.del(sessionKey);
        reply.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions(request));
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Session tenant mismatch',
        });
      }

      if (sessionTenantId === null && tenantId !== null) {
        await redis.del(sessionKey);
        reply.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions(request));
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Session tenant mismatch',
        });
      }

      const requestTenantId = getTenantIdFromRequest(request);
      const isAdminSubdomain = request.isAdminSubdomain || false;

      if (!tenantId) {
        if (!isAdminSubdomain) {
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid session context',
          });
        }
      } else {
        const requestTenantMatches = requestTenantId && parseInt(requestTenantId) === parseInt(tenantId);
        const sessionTenantMatches = sessionTenantId != null && parseInt(sessionTenantId) === parseInt(tenantId);

        if (!requestTenantMatches) {
          if (!sessionTenantMatches) {
            logger.warn('[REFRESH] Invalid session context', {
              host: request.headers.host,
              'x-forwarded-host': request.headers['x-forwarded-host'],
              requestTenantId,
              tenantId,
              sessionTenantId,
            });
            return reply.code(401).send({
              success: false,
              error: 'Unauthorized',
              message: 'Invalid session context',
            });
          }
          logger.warn('[REFRESH] Host tenant unresolved; allowing refresh via session tenant_id', {
            host: request.headers.host,
            'x-forwarded-host': request.headers['x-forwarded-host'],
            tenantId,
          });
        }
        if (request.tenant) {
          const normalizedStatus = String(request.tenant.status || '').toUpperCase();
          if (normalizedStatus === 'SUSPENDED') {
            return reply.code(403).send({
              success: false,
              error: 'Tenant Suspended',
              message: `Tenant "${request.tenant.name}" is currently suspended. Please contact support.`,
            });
          }
        }
      }

      // Extend session on refresh so 3h inactivity applies from last activity
      await redis.set(
        sessionKey,
        JSON.stringify({
          ...session,
          last_activity: Date.now(),
        }),
        'EX',
        REFRESH_TTL_SECONDS
      );
      reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieSetOptions(request));

      const jwtSecret = tenantId ? TENANT_JWT_SECRET : ADMIN_JWT_SECRET;
      const tokenType = tenantId ? 'tenant' : 'admin';
      const token = jwt.sign(
        {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          tenant_id: tenantId,
          token_type: tokenType
        },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_TTL }
      );

      return reply.send({
        success: true,
        data: {
          token,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'AuthController.refresh error');
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async logout(request, reply) {
    try {
      const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
      if (refreshToken) {
        await redis.del(`auth:session:${refreshToken}`);
      }
      reply.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions(request));
      return reply.send({
        success: true,
        message: 'Logged out',
      });
    } catch (error) {
      logger.error('AuthController.logout error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async ensureOtpTable() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
          email VARCHAR(255) NOT NULL,
          otp VARCHAR(10) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (email)
        )
      `);
    } catch (error) {
      logger.error('Error creating password_resets table:', error);
    }
  }

  async requestOtp(request, reply) {
    try {
      await this.ensureOtpTable(); // Ensure table exists

      const email = request.body?.email || request.admin?.email;
      if (!email) {
        return reply.code(400).send({
          success: false,
          message: 'Email is required'
        });
      }

      // Check if user exists
      const [users] = await pool.query('SELECT id, email, name FROM admin_users WHERE email = ?', [email]);
      if (!users || users.length === 0) {
        // Security: Don't reveal user doesn't exist
        return reply.send({
          success: true,
          message: 'If an account exists with this email, an OTP has been sent.'
        });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP (Upsert)
      await pool.query(`
        INSERT INTO password_resets (email, otp, expires_at, status)
        VALUES (?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at), status = 'pending'
      `, [email, otp, expiresAt]);

      // Send Email
      await emailService.sendOtpEmail(email, otp);

      return reply.send({
        success: true,
        message: 'OTP sent to your email'
      });
    } catch (error) {
      logger.error('requestOtp error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async verifyResetOtp(request, reply) {
    try {
      const { email, otp } = request.body;
      const userEmail = email || request.admin?.email;

      if (!userEmail || !otp) {
        return reply.code(400).send({ success: false, message: 'Email and OTP are required' });
      }

      const [rows] = await pool.query(
        'SELECT email, otp, status, expires_at, created_at FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW()',
        [userEmail, otp]
      );

      if (!rows || rows.length === 0) {
        return reply.code(400).send({ success: false, message: 'Invalid or expired OTP' });
      }

      // Mark OTP as verified/used so it can be used to reset password
      // We can issue a temporary token here

      // Generate a short-lived reset token
      const resetToken = jwt.sign(
        { email: userEmail, type: 'password_reset' },
        ADMIN_JWT_SECRET,
        { expiresIn: '15m' }
      );

      return reply.send({
        success: true,
        message: 'OTP verified',
        resetToken
      });

    } catch (error) {
      logger.error('verifyResetOtp error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async resetPassword(request, reply) {
    try {
      const { resetToken, newPassword } = request.body;
      if (!resetToken || !newPassword) {
        return reply.code(400).send({ success: false, message: 'Token and new password required' });
      }

      if (newPassword.length < 6) {
        return reply.code(400).send({ success: false, message: 'Password must be at least 6 characters' });
      }

      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(resetToken, ADMIN_JWT_SECRET);
      } catch (err) {
        return reply.code(401).send({ success: false, message: 'Invalid or expired reset token' });
      }

      if (decoded.type !== 'password_reset') {
        return reply.code(401).send({ success: false, message: 'Invalid token type' });
      }

      const email = decoded.email;

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password and clear must-change flag if present
      try {
        await pool.query(
          'UPDATE admin_users SET password_hash = ?, must_change_password = 0 WHERE email = ?',
          [passwordHash, email]
        );
      } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('must_change_password')) {
          await pool.query('UPDATE admin_users SET password_hash = ? WHERE email = ?', [passwordHash, email]);
        } else {
          throw error;
        }
      }

      // Clear OTP
      await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

      return reply.send({
        success: true,
        message: 'Password updated successfully'
      });

    } catch (error) {
      logger.error('resetPassword error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new AuthController();
