import subscriptionService from '../services/subscriptionService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

/**
 * Subscription Controller
 * 
 * Admin endpoints for managing tenant subscriptions and trials.
 * 
 * All endpoints require super admin authentication.
 */

class SubscriptionController {
    /**
     * Get subscription status for a tenant
     * GET /api/admin/subscriptions/:tenantId
     */
    async getSubscriptionStatus(request, reply) {
        try {
            const { tenantId } = request.params;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            const status = await subscriptionService.getTenantSubscriptionStatus(parseInt(tenantId));

            return reply.send({
                success: true,
                data: status
            });
        } catch (error) {
            logger.error('Error getting subscription status:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Activate subscription for a tenant
     * POST /api/admin/subscriptions/:tenantId/activate
     * 
     * Body: {
     *   end_date: "2026-12-31T23:59:59Z",
     *   plan: "pro",
     *   billing_email: "billing@example.com"
     * }
     */
    async activateSubscription(request, reply) {
        try {
            const { tenantId } = request.params;
            const { end_date, plan = 'basic', billing_email } = request.body;
            const adminId = request.admin?.id;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            if (!end_date) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Subscription end date is required'
                });
            }

            // Parse and validate end date
            const endDate = new Date(end_date);
            if (isNaN(endDate.getTime())) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Invalid end date format. Use ISO 8601 format (e.g., 2026-12-31T23:59:59Z)'
                });
            }

            const now = new Date();
            if (endDate <= now) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'End date must be in the future'
                });
            }

            const status = await subscriptionService.activateSubscription(
                parseInt(tenantId),
                endDate,
                plan,
                adminId
            );

            logger.info('Subscription activated', {
                tenantId,
                plan,
                endDate,
                adminId
            });

            return reply.send({
                success: true,
                message: 'Subscription activated successfully',
                data: status
            });
        } catch (error) {
            logger.error('Error activating subscription:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Extend subscription by N days
     * POST /api/admin/subscriptions/:tenantId/extend
     * 
     * Body: {
     *   days: 30
     * }
     */
    async extendSubscription(request, reply) {
        try {
            const { tenantId } = request.params;
            const { days } = request.body;
            const adminId = request.admin?.id;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            if (!days || days <= 0) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Days must be a positive number'
                });
            }

            const status = await subscriptionService.extendSubscription(
                parseInt(tenantId),
                parseInt(days),
                adminId
            );

            logger.info('Subscription extended', {
                tenantId,
                days,
                adminId
            });

            return reply.send({
                success: true,
                message: `Subscription extended by ${days} days`,
                data: status
            });
        } catch (error) {
            logger.error('Error extending subscription:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Set custom subscription end date
     * POST /api/admin/subscriptions/:tenantId/set-end-date
     * 
     * Body: {
     *   end_date: "2026-12-31T23:59:59Z"
     * }
     */
    async setSubscriptionEndDate(request, reply) {
        try {
            const { tenantId } = request.params;
            const { end_date } = request.body;
            const adminId = request.admin?.id;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            if (!end_date) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'End date is required'
                });
            }

            // Parse and validate end date
            const endDate = new Date(end_date);
            if (isNaN(endDate.getTime())) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Invalid end date format. Use ISO 8601 format (e.g., 2026-12-31T23:59:59Z)'
                });
            }

            const status = await subscriptionService.setSubscriptionEndDate(
                parseInt(tenantId),
                endDate,
                adminId
            );

            logger.info('Subscription end date set', {
                tenantId,
                endDate,
                adminId
            });

            return reply.send({
                success: true,
                message: 'Subscription end date updated',
                data: status
            });
        } catch (error) {
            logger.error('Error setting subscription end date:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Suspend tenant
     * POST /api/admin/subscriptions/:tenantId/suspend
     * 
     * Body: {
     *   reason: "Payment failed"
     * }
     */
    async suspendTenant(request, reply) {
        try {
            const { tenantId } = request.params;
            const { reason } = request.body;
            const adminId = request.admin?.id;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            const status = await subscriptionService.suspendTenant(
                parseInt(tenantId),
                adminId,
                reason
            );

            logger.warn('Tenant suspended', {
                tenantId,
                reason,
                adminId
            });

            return reply.send({
                success: true,
                message: 'Tenant suspended',
                data: status
            });
        } catch (error) {
            logger.error('Error suspending tenant:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Unsuspend tenant
     * POST /api/admin/subscriptions/:tenantId/unsuspend
     */
    async unsuspendTenant(request, reply) {
        try {
            const { tenantId } = request.params;
            const adminId = request.admin?.id;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            const status = await subscriptionService.unsuspendTenant(
                parseInt(tenantId),
                adminId
            );

            logger.info('Tenant unsuspended', {
                tenantId,
                adminId
            });

            return reply.send({
                success: true,
                message: 'Tenant unsuspended',
                data: status
            });
        } catch (error) {
            logger.error('Error unsuspending tenant:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Reset trial (admin only - for special cases)
     * POST /api/admin/subscriptions/:tenantId/reset-trial
     */
    async resetTrial(request, reply) {
        try {
            const { tenantId } = request.params;
            const adminId = request.admin?.id;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            const status = await subscriptionService.resetTrial(
                parseInt(tenantId),
                adminId
            );

            logger.warn('Trial reset', {
                tenantId,
                adminId
            });

            return reply.send({
                success: true,
                message: 'Trial reset successfully',
                data: status
            });
        } catch (error) {
            logger.error('Error resetting trial:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Get subscription history for a tenant
     * GET /api/admin/subscriptions/:tenantId/history
     */
    async getSubscriptionHistory(request, reply) {
        try {
            const { tenantId } = request.params;
            const { limit = 50 } = request.query;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant ID is required'
                });
            }

            const history = await subscriptionService.getSubscriptionHistory(
                parseInt(tenantId),
                parseInt(limit)
            );

            return reply.send({
                success: true,
                data: {
                    tenant_id: parseInt(tenantId),
                    history
                }
            });
        } catch (error) {
            logger.error('Error getting subscription history:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }

    /**
     * Get current tenant's subscription status (for tenant users)
     * GET /api/subscription/status
     */
    async getCurrentTenantStatus(request, reply) {
        try {
            const tenantId = request.tenantId;

            if (!tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Tenant context required'
                });
            }

            const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);

            return reply.send({
                success: true,
                data: status
            });
        } catch (error) {
            logger.error('Error getting current tenant subscription status:', error);
            return reply.code(500).send(createErrorResponse(error, 500));
        }
    }
}

export default new SubscriptionController();
