import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import bcrypt from 'bcrypt';

import tenantResolutionService from '../services/tenantResolutionService.js';
import emailService from '../services/emailService.js';

export class TenantController {
  /**
   * Create a new tenant
   * Only accessible from admin subdomain by super admin
   */
  async createTenant(request, reply) {
    try {
      const { name, slug, status = 'active', adminEmail, adminName, adminPassword } = request.body;

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
        const [tenantResult] = await pool.query(
          'INSERT INTO tenants (name, slug, status) VALUES (?, ?, ?)',
          [name, slug, status]
        );

        const tenantId = tenantResult.insertId || tenantResult[0]?.insertId;

        // Create tenant admin user if credentials provided
        let adminUserId = null;
        if (adminEmail && adminName && adminPassword) {
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

          // Hash password
          const passwordHash = await bcrypt.hash(adminPassword, 10);

          // Create tenant admin
          const [adminResult] = await pool.query(
            'INSERT INTO admin_users (email, name, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)',
            [adminEmail, adminName, passwordHash, 'tenant_admin', tenantId]
          );

          adminUserId = adminResult.insertId || adminResult[0]?.insertId;
        }

        await pool.query('COMMIT');

        // Fetch created tenant
        const [tenantRows] = await pool.query(
          'SELECT id, name, slug, status, created_at FROM tenants WHERE id = ?',
          [tenantId]
        );

        // Send tenant welcome email (best effort, do not block creation)
        if (adminEmail) {
          try {
            await emailService.sendTenantWelcomeEmail({
              tenantName: name,
              tenantSlug: slug + '.track-myads.com',
              adminName,
              adminEmail,
              adminPassword,
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
        query += ' WHERE status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await pool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM tenants';
      const countParams = [];
      if (status) {
        countQuery += ' WHERE status = ?';
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

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }

      if (status) {
        updates.push('status = ?');
        params.push(status);
      }

      params.push(id);

      await pool.query(
        `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

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

      if (tenant.status === 'suspended') {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant is already suspended',
        });
      }

      // Suspend tenant
      await pool.query(
        'UPDATE tenants SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        ['suspended', id]
      );

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
          status: 'suspended',
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

      if (tenant.status === 'active') {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant is already active',
        });
      }

      // Resume tenant
      await pool.query(
        'UPDATE tenants SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        ['active', id]
      );

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
          status: 'active',
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
      const { date_from, date_to } = request.query;

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
      const metrics = await tenantMetricsService.getTenantMetrics(id, date_from, date_to);

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
        // Soft delete (suspend) - use suspendTenant method
        return this.suspendTenant(request, reply);
      }
    } catch (error) {
      logger.error('TenantController.deleteTenant error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new TenantController();
