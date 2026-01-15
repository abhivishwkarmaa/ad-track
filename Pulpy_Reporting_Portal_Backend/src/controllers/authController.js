import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

// JWT secrets - separate for admin and tenant users
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-secret-key-change-in-production';
const TENANT_JWT_SECRET = process.env.TENANT_JWT_SECRET || process.env.JWT_SECRET || 'tenant-secret-key-change-in-production';

export class AuthController {
  async register(request, reply) {
    try {
      const { email, name, password, role = 'admin' } = request.body;

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

      // Check if admin already exists
      const [existingRows] = await pool.query(
        'SELECT id FROM admin_users WHERE email = ?',
        [email]
      );

      if (existingRows && existingRows.length > 0) {
        return reply.code(409).send({
          success: false,
          error: 'Conflict',
          message: 'Admin with this email already exists',
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create admin user
      const [result] = await pool.query(
        'INSERT INTO admin_users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
        [email, name, passwordHash, role]
      );

      const adminId = result.insertId || result[0]?.insertId;

      // Get tenant_id if user has one
      const [userRows] = await pool.query(
        'SELECT tenant_id FROM admin_users WHERE id = ?',
        [adminId]
      );
      const tenantId = userRows && userRows.length > 0 ? userRows[0].tenant_id : null;

      // Use appropriate JWT secret based on user type
      const jwtSecret = tenantId ? TENANT_JWT_SECRET : ADMIN_JWT_SECRET;
      const tokenType = tenantId ? 'tenant' : 'admin';

      // Generate JWT token (include tenant_id and token type)
      const token = jwt.sign(
        { id: adminId, email, name, role, tenant_id: tenantId, token_type: tokenType },
        jwtSecret,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return reply.code(201).send({
        success: true,
        message: 'Admin registered successfully',
        data: {
          id: adminId,
          email,
          name,
          role,
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

      // Validate input
      if (!email || !password) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Email and password are required',
        });
      }

      // Find admin user (include tenant_id if column exists)
      // Note: tenant_id column may not exist if migration hasn't been run yet
      let [rows] = [];
      try {
        // Try query with tenant_id first
        [rows] = await pool.query(
          'SELECT id, email, name, password_hash, role, tenant_id FROM admin_users WHERE email = ?',
          [email]
        );
      } catch (error) {
        // If tenant_id column doesn't exist, fall back to query without it
        if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('tenant_id')) {
          logger.warn('tenant_id column not found in admin_users table. Please run migration.');
          [rows] = await pool.query(
            'SELECT id, email, name, password_hash, role FROM admin_users WHERE email = ?',
            [email]
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
          message: 'Invalid email or password',
        });
      }

      const admin = Array.isArray(rows) ? rows[0] : rows;

      // Verify password
      const isValid = await bcrypt.compare(password, admin.password_hash);

      if (!isValid) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      // Get tenant_id from admin record (may be undefined if column doesn't exist)
      const tenantId = admin.tenant_id !== undefined ? admin.tenant_id : null;

      // Use appropriate JWT secret based on user type
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
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      logger.debug(`JWT token generated`, {
        adminId: admin.id,
        tenantId: tenantId,
        tokenType: tokenType
      });

      return reply.send({
        success: true,
        message: 'Login successful',
        data: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          token,
        },
      });
    } catch (error) {
      logger.error('AuthController.login error:', error);
      logger.error('Error stack:', error.stack);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getProfile(request, reply) {
    try {
      // Admin info is already attached by auth middleware
      return reply.send({
        success: true,
        data: request.admin,
      });
    } catch (error) {
      logger.error('AuthController.getProfile error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new AuthController();

