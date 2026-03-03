import tenantController from '../controllers/tenantController.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { requireAdminSubdomain } from '../middleware/tenant.js';
import { enforceClientVersion } from '../middleware/versionValidation.js';

async function tenantRoutes(fastify, options) {
  // All tenant routes require:
  // 1. Admin subdomain (admin.track-myads.com)
  // 2. Authentication
  // 3. Super admin access

  // Apply middleware to all routes in this plugin
  fastify.addHook('onRequest', requireAdminSubdomain);
  fastify.addHook('onRequest', authenticateAdmin);
  fastify.addHook('preHandler', enforceClientVersion);
  fastify.addHook('onRequest', requireSuperAdmin);

  // Create tenant
  fastify.post('/tenants', tenantController.createTenant);

  // Get all tenants
  fastify.get('/tenants', tenantController.getTenants);

  // Get single tenant
  fastify.get('/tenants/:id', tenantController.getTenant);

  // Update tenant
  fastify.patch('/tenants/:id', tenantController.updateTenant);
  fastify.put('/tenants/:id', tenantController.updateTenant);

  // Suspend tenant (blocks all access)
  fastify.post('/tenants/:id/suspend', tenantController.suspendTenant);

  // Resume tenant (restores access)
  fastify.post('/tenants/:id/resume', tenantController.resumeTenant);

  // Get tenant metrics
  fastify.get('/tenants/:id/metrics', tenantController.getTenantMetrics);

  // Delete tenant (soft delete by default, hard delete with ?hardDelete=true)
  fastify.delete('/tenants/:id', tenantController.deleteTenant);
}

export default tenantRoutes;
