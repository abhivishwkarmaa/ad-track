import tenantController from '../controllers/tenantController.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { requireAdminSubdomain } from '../middleware/tenant.js';

async function tenantRoutes(fastify, options) {
  // All tenant routes require:
  // 1. Admin subdomain (admin.track-myads.com)
  // 2. Authentication
  // 3. Super admin access

  // Apply middleware to all routes in this plugin
  fastify.addHook('onRequest', requireAdminSubdomain);
  fastify.addHook('onRequest', authenticateAdmin);
  fastify.addHook('onRequest', requireSuperAdmin);

  // Create tenant
  fastify.post('/', tenantController.createTenant);

  // Get all tenants
  fastify.get('/', tenantController.getTenants);

  // Get single tenant
  fastify.get('/:id', tenantController.getTenant);

  // Update tenant
  fastify.patch('/:id', tenantController.updateTenant);
  fastify.put('/:id', tenantController.updateTenant);

  // Suspend tenant (blocks all access)
  fastify.post('/:id/suspend', tenantController.suspendTenant);

  // Resume tenant (restores access)
  fastify.post('/:id/resume', tenantController.resumeTenant);

  // Get tenant metrics
  fastify.get('/:id/metrics', tenantController.getTenantMetrics);

  // Delete tenant (soft delete by default, hard delete with ?hardDelete=true)
  fastify.delete('/:id', tenantController.deleteTenant);
}

export default tenantRoutes;
