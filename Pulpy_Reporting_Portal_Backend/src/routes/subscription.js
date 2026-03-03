import subscriptionController from '../controllers/subscriptionController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { enforceClientVersion } from '../middleware/versionValidation.js';

/**
 * Subscription Routes
 * 
 * Admin routes for managing tenant subscriptions
 * Tenant routes for viewing own subscription status
 */

export default async function subscriptionRoutes(fastify, options) {
    // ============================================
    // ADMIN ROUTES (Super Admin Only)
    // ============================================

    // Get subscription status for a tenant
    fastify.get('/admin/subscriptions/:tenantId', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.getSubscriptionStatus);

    // Activate subscription
    fastify.post('/admin/subscriptions/:tenantId/activate', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.activateSubscription);

    // Extend subscription by N days
    fastify.post('/admin/subscriptions/:tenantId/extend', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.extendSubscription);

    // Set custom subscription end date
    fastify.post('/admin/subscriptions/:tenantId/set-end-date', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.setSubscriptionEndDate);

    // Suspend tenant
    fastify.post('/admin/subscriptions/:tenantId/suspend', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.suspendTenant);

    // Unsuspend tenant
    fastify.post('/admin/subscriptions/:tenantId/unsuspend', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.unsuspendTenant);

    // Reset trial (special cases only)
    fastify.post('/admin/subscriptions/:tenantId/reset-trial', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.resetTrial);

    // Get subscription history
    fastify.get('/admin/subscriptions/:tenantId/history', {
        preHandler: [authenticateAdmin, enforceClientVersion]
    }, subscriptionController.getSubscriptionHistory);

    // ============================================
    // TENANT ROUTES (Tenant Users)
    // ============================================

    // Get current tenant's subscription status
    // This endpoint is accessible by tenant users to view their own subscription
    fastify.get('/subscription/status', {
        preHandler: [authenticateAdmin, enforceClientVersion] // Tenant users are also authenticated via this middleware
    }, subscriptionController.getCurrentTenantStatus);
}
