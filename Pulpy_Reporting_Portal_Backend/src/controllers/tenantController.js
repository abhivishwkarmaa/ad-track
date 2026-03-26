import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

import tenantResolutionService from '../services/tenantResolutionService.js';
import emailService from '../services/emailService.js';

const generateRandomPassword = (length = 12) => {
  const bytes = crypto.randomBytes(Math.ceil(length));
  const base = bytes.toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  return base.slice(0, length);
};

const normalizeTenantStatus = (status) => {
  if (!status) return null;
  const normalized = String(status).toUpperCase();
  const allowedStatuses = new Set(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED']);
  return allowedStatuses.has(normalized) ? normalized : null;
};

const getLegacyStatusValue = (normalizedStatus) => {
  if (!normalizedStatus) return null;
  if (normalizedStatus === 'SUSPENDED') return 'suspended';
  if (normalizedStatus === 'ACTIVE') return 'active';
  return null;
};

const statusesMatch = (currentStatus, desiredStatus) => {
  const normalizedCurrent = normalizeTenantStatus(currentStatus);
  const normalizedDesired = normalizeTenantStatus(desiredStatus);
  return Boolean(normalizedCurrent && normalizedDesired && normalizedCurrent === normalizedDesired);
};

const applyTenantStatusUpdate = async (tenantId, desiredStatus) => {
  const normalizedStatus = normalizeTenantStatus(desiredStatus);
  if (!normalizedStatus) {
    return { success: false, error: 'Invalid tenant status. Allowed values: TRIAL, ACTIVE, EXPIRED, SUSPENDED' };
  }

  await pool.query(
    'UPDATE tenants SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [normalizedStatus, tenantId]
  );

  const [statusRows] = await pool.query(
    'SELECT status FROM tenants WHERE id = ?',
    [tenantId]
  );

  const currentStatus = statusRows?.[0]?.status || null;
  if (statusesMatch(currentStatus, normalizedStatus)) {
    return { success: true, status: currentStatus };
  }

  const fallbackStatus = getLegacyStatusValue(normalizedStatus);
  if (!fallbackStatus) {
    return { success: false, error: 'Tenant status update failed due to schema mismatch. Please run the subscription migration.' };
  }

  await pool.query(
    'UPDATE tenants SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [fallbackStatus, tenantId]
  );

  const [fallbackRows] = await pool.query(
    'SELECT status FROM tenants WHERE id = ?',
    [tenantId]
  );

  return { success: true, status: fallbackRows?.[0]?.status || fallbackStatus };
};

export class TenantController {
  /**
   * Create a new tenant
   * Only accessible from admin subdomain by super admin
   */
  async createTenant(request, reply) {
    try {
      const { name, slug, status = 'TRIAL', adminEmail, adminName } = request.body;

      // Validate input
      if (!name || !slug) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Name and slug are required',
        });
      }

      // Validate slug format (alphanumeric and hyphens only)
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Slug must contain only lowercase letters, numbers, and hyphens',
        });
      }

      // Check if tenant with this slug already exists
      const [existingRows] = await pool.query(
        'SELECT id FROM tenants WHERE slug = ?',
        [slug]
      );

      if (existingRows && existingRows.length > 0) {
        return reply.code(409).send({
          success: false,
          error: 'Conflict',
          message: 'Tenant with this slug already exists',
        });
      }

      // Start transaction
      await pool.query('START TRANSACTION');

      try {
        // Create tenant
        const normalizedStatus = normalizeTenantStatus(status);
        if (!normalizedStatus) {
          await pool.query('ROLLBACK');
          return reply.code(400).send({
            success: false,
            error: 'Validation Error',
            message: 'Invalid tenant status. Allowed values: TRIAL, ACTIVE, EXPIRED, SUSPENDED',
          });
        }

        const [tenantResult] = await pool.query(
          'INSERT INTO tenants (name, slug, status) VALUES (?, ?, ?)',
          [name, slug, normalizedStatus]
        );

        const tenantId = tenantResult.insertId || tenantResult[0]?.insertId;

        // Create tenant admin user if credentials provided
        let adminUserId = null;
        let finalAdminPassword = null;
        if (adminEmail && adminName) {
          // Check if admin email already exists
          const [existingAdminRows] = await pool.query(
            'SELECT id FROM admin_users WHERE email = ?',
            [adminEmail]
          );

          if (existingAdminRows && existingAdminRows.length > 0) {
            await pool.query('ROLLBACK');
            return reply.code(409).send({
              success: false,
              error: 'Conflict',
              message: 'Admin email already exists',
            });
          }

          const generatedPassword = generateRandomPassword();
          finalAdminPassword = generatedPassword;

          // Hash password
          const passwordHash = await bcrypt.hash(generatedPassword, 10);

          // Create tenant admin (force password change on first login)
          try {
            const [adminResult] = await pool.query(
              'INSERT INTO admin_users (email, name, password_hash, role, tenant_id, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
              [adminEmail, adminName, passwordHash, 'tenant_admin', tenantId, 1]
            );
            adminUserId = adminResult.insertId || adminResult[0]?.insertId;
          } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR' && (error.message.includes('must_change_password') || error.message.includes('tenant_id'))) {
              const [adminResult] = await pool.query(
                'INSERT INTO admin_users (email, name, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)',
                [adminEmail, adminName, passwordHash, 'tenant_admin', tenantId]
              );
              adminUserId = adminResult.insertId || adminResult[0]?.insertId;
            } else {
              throw error;
            }
          }
        }

        await pool.query('COMMIT');

        // Fetch created tenant
        const [tenantRows] = await pool.query(
          'SELECT id, name, slug, status, created_at FROM tenants WHERE id = ?',
          [tenantId]
        );

        // Send tenant welcome email (best effort, do not block creation)
        if (adminEmail && finalAdminPassword) {
          try {
            await emailService.sendTenantWelcomeEmail({
              tenantName: name,
              tenantSlug: slug,
              adminName,
              adminEmail,
              adminPassword: finalAdminPassword,
            });
          } catch (emailError) {
            logger.warn('⚠️ Tenant welcome email failed to send:', {
              tenant: slug,
              adminEmail,
              error: emailError?.message || emailError,
            });
          }
        }

        return reply.code(201).send({
          success: true,
          message: 'Tenant created successfully',
          data: {
            tenant: tenantRows[0],
            adminUserId: adminUserId,
          },
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('TenantController.createTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get all tenants
   * Only accessible from admin subdomain by super admin
   */
  async getTenants(request, reply) {
    try {
      // Check if tenants table exists
      try {
        await pool.query('SELECT 1 FROM tenants LIMIT 1');
      } catch (tableError) {
        if (tableError.code === 'ER_NO_SUCH_TABLE') {
          return reply.code(503).send({
            success: false,
            error: 'Service Unavailable',
            message: 'Database migration required. Please run migration 001_add_multi_tenant_support.sql to create the tenants table.',
            migration_required: true,
            migration_file: 'src/db/migrations/001_add_multi_tenant_support.sql',
          });
        }
        throw tableError;
      }

      const { status, page = 1, limit = 50 } = request.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT id, name, slug, status, created_at, updated_at FROM tenants';
      const params = [];

      if (status) {
        query += ' WHERE UPPER(status) = UPPER(?)';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await pool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM tenants';
      const countParams = [];
      if (status) {
        countQuery += ' WHERE UPPER(status) = UPPER(?)';
        countParams.push(status);
      }
      const [countRows] = await pool.query(countQuery, countParams);
      const total = countRows[0]?.total || 0;

      return reply.send({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('TenantController.getTenants error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get single tenant by ID
   */
  async getTenant(request, reply) {
    try {
      const { id } = request.params;

      const [rows] = await pool.query(
        'SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE id = ?',
        [id]
      );

      if (!rows || rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Tenant not found',
        });
      }

      return reply.send({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      logger.error('TenantController.getTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(request, reply) {
    try {
      const { id } = request.params;
      const { name, status } = request.body;

      // Validate that at least one field is provided
      if (!name && !status) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'At least one field (name or status) is required',
        });
      }

      // Check if tenant exists
      const [existingRows] = await pool.query(
        'SELECT id, slug FROM tenants WHERE id = ?',
        [id]
      );

      if (!existingRows || existingRows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Tenant not found',
        });
      }

      // Build update query dynamically
      const updates = [];
      const params = [];
      const requestedStatus = status || null;

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }

      if (updates.length > 0) {
        params.push(id);
        await pool.query(
          `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
      }

      if (requestedStatus) {
        const statusResult = await applyTenantStatusUpdate(id, requestedStatus);
        if (!statusResult.success) {
          return reply.code(400).send({
            success: false,
            error: 'Validation Error',
            message: statusResult.error || 'Failed to update tenant status',
          });
        }
      }

      // Invalidate cache
      if (existingRows[0] && existingRows[0].slug) {
        await tenantResolutionService.invalidateTenantCache(existingRows[0].slug);
      }

      // Fetch updated tenant
      const [tenantRows] = await pool.query(
        'SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE id = ?',
        [id]
      );

      return reply.send({
        success: true,
        message: 'Tenant updated successfully',
        data: tenantRows[0],
      });
    } catch (error) {
      logger.error('TenantController.updateTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Suspend tenant (blocks all access immediately)
   */
  async suspendTenant(request, reply) {
    try {
      const { id } = request.params;

      // Check if tenant exists
      const [existingRows] = await pool.query(
        'SELECT id, name, slug, status FROM tenants WHERE id = ?',
        [id]
      );

      if (!existingRows || existingRows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Tenant not found',
        });
      }

      const tenant = existingRows[0];

      const normalizedStatus = normalizeTenantStatus(tenant.status);
      if (normalizedStatus === 'SUSPENDED') {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant is already suspended',
        });
      }

      // Suspend tenant
      const statusResult = await applyTenantStatusUpdate(id, 'SUSPENDED');
      if (!statusResult.success) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: statusResult.error || 'Failed to suspend tenant',
        });
      }

      // Invalidate cache
      if (tenant.slug) {
        await tenantResolutionService.invalidateTenantCache(tenant.slug);
      }

      logger.info(`Tenant suspended: ${tenant.name} (ID: ${id})`);

      return reply.send({
        success: true,
        message: 'Tenant suspended successfully. All access is now blocked.',
        data: {
          tenant_id: id,
          status: 'SUSPENDED',
        },
      });
    } catch (error) {
      logger.error('TenantController.suspendTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Resume tenant (restores access)
   */
  async resumeTenant(request, reply) {
    try {
      const { id } = request.params;

      // Check if tenant exists
      const [existingRows] = await pool.query(
        'SELECT id, name, slug, status FROM tenants WHERE id = ?',
        [id]
      );

      if (!existingRows || existingRows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Tenant not found',
        });
      }

      const tenant = existingRows[0];

      const normalizedStatus = normalizeTenantStatus(tenant.status);
      if (normalizedStatus && normalizedStatus !== 'SUSPENDED') {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant is not suspended',
        });
      }

      // Resume tenant
      const statusResult = await applyTenantStatusUpdate(id, 'ACTIVE');
      if (!statusResult.success) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: statusResult.error || 'Failed to resume tenant',
        });
      }

      // Invalidate cache
      if (tenant.slug) {
        await tenantResolutionService.invalidateTenantCache(tenant.slug);
      }

      logger.info(`Tenant resumed: ${tenant.name} (ID: ${id})`);

      return reply.send({
        success: true,
        message: 'Tenant resumed successfully. Access has been restored.',
        data: {
          tenant_id: id,
          status: 'ACTIVE',
        },
      });
    } catch (error) {
      logger.error('TenantController.resumeTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get tenant metrics
   */
  async getTenantMetrics(request, reply) {
    try {
      const { id } = request.params;
      const { date_from, date_to, datetime_from, datetime_to } = request.query;

      // Verify tenant exists
      const [tenantRows] = await pool.query(
        'SELECT id, name, slug, status FROM tenants WHERE id = ?',
        [id]
      );

      if (!tenantRows || tenantRows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Tenant not found',
        });
      }

      const tenantMetricsService = (await import('../services/tenantMetricsService.js')).default;
      const metrics = await tenantMetricsService.getTenantMetrics(id, date_from, date_to, datetime_from, datetime_to);

      return reply.send({
        success: true,
        data: {
          tenant: tenantRows[0],
          metrics,
        },
      });
    } catch (error) {
      logger.error('TenantController.getTenantMetrics error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }



  /**
   * Delete tenant (soft delete by setting status to suspended)
   * Or hard delete if requested
   */
  async deleteTenant(request, reply) {
    try {
      const { id } = request.params;
      const { hardDelete = false } = request.query;

      // Check if tenant exists
      const [existingRows] = await pool.query(
        'SELECT id, name, slug FROM tenants WHERE id = ?',
        [id]
      );

      if (!existingRows || existingRows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Tenant not found',
        });
      }

      if (hardDelete === 'true' || hardDelete === true) {
        // Hard delete (cascade will handle related records)
        await pool.query('DELETE FROM tenants WHERE id = ?', [id]);

        // Invalidate cache
        if (existingRows[0].slug) {
          await tenantResolutionService.invalidateTenantCache(existingRows[0].slug);
        }

        logger.warn(`Tenant hard deleted: ${existingRows[0].name} (ID: ${id})`);

        return reply.send({
          success: true,
          message: 'Tenant deleted permanently',
        });
      } else {
        // Soft delete (suspend)
        const statusResult = await applyTenantStatusUpdate(id, 'SUSPENDED');
        if (!statusResult.success) {
          return reply.code(400).send({
            success: false,
            error: 'Validation Error',
            message: statusResult.error || 'Failed to suspend tenant',
          });
        }

        if (existingRows[0].slug) {
          await tenantResolutionService.invalidateTenantCache(existingRows[0].slug);
        }

        logger.info(`Tenant suspended: ${existingRows[0].name} (ID: ${id})`);

        return reply.send({
          success: true,
          message: 'Tenant suspended successfully. All access is now blocked.',
          data: {
            tenant_id: id,
            status: 'SUSPENDED',
          },
        });
      }
    } catch (error) {
      logger.error('TenantController.deleteTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new TenantController();
