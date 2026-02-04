import logger from '../utils/logger.js';
import subscriptionService from '../services/subscriptionService.js';

/**
 * Subscription Access Control Middleware
 * 
 * Centralized middleware for enforcing subscription-based access control.
 * 
 * AUTHORIZATION RULES:
 * - ACTIVE → full access
 * - TRIAL → full access
 * - EXPIRED → restricted / read-only
 * - SUSPENDED → blocked
 * 
 * NO business logic in UI
 * NO duplicated date calculations
 * Single source of truth
 */

const TENANT_STATES = {
    TRIAL: 'TRIAL',
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    SUSPENDED: 'SUSPENDED'
};

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_PREFIXES = ['/api/auth', '/api/subscription/status', '/api/contact'];
const SKIP_PATHS = new Set(['/health']);

const shouldSkipSubscriptionEnforcement = (request) => {
    const url = request.url || '';
    if (SKIP_PATHS.has(url)) return true;
    return SKIP_PREFIXES.some((prefix) => url.startsWith(prefix));
};

/**
 * Require active subscription or trial
 * Blocks EXPIRED and SUSPENDED tenants
 * 
 * Use this on routes that require full access
 */
export async function requireActiveSubscription(request, reply) {
    try {
        const tenantId = request.tenantId;

        if (!tenantId) {
            return reply.code(403).send({
                success: false,
                error: 'Forbidden',
                message: 'Tenant context required',
                subscription_status: 'unknown'
            });
        }

        // Get current subscription status
        const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);
        const state = status.tenant.status;

        // Attach subscription status to request for use in handlers
        request.subscriptionStatus = status;

        // Check access level
        if (state === TENANT_STATES.ACTIVE || state === TENANT_STATES.TRIAL) {
            // Full access
            return;
        }

        // Blocked states
        if (state === TENANT_STATES.SUSPENDED) {
            logger.warn('Suspended tenant access attempt', {
                tenantId,
                tenantSlug: status.tenant.slug,
                url: request.url,
                ip: request.ip
            });

            return reply.code(403).send({
                success: false,
                error: 'Account Suspended',
                message: 'Your account has been suspended. Please contact billing@track-myads.com for assistance.',
                subscription_status: 'suspended'
            });
        }

        if (state === TENANT_STATES.EXPIRED) {
            logger.warn('Expired tenant access attempt', {
                tenantId,
                tenantSlug: status.tenant.slug,
                url: request.url,
                ip: request.ip
            });

            return reply.code(403).send({
                success: false,
                error: 'Subscription Expired',
                message: 'Your access has expired. Please contact billing@track-myads.com to continue.',
                subscription_status: 'expired',
                billing_email: 'billing@track-myads.com'
            });
        }

        // Unknown state - deny access
        return reply.code(403).send({
            success: false,
            error: 'Forbidden',
            message: 'Access denied',
            subscription_status: state
        });
    } catch (error) {
        logger.error('Error in requireActiveSubscription middleware:', error);
        return reply.code(500).send({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to verify subscription status'
        });
    }
}

/**
 * Allow read-only access for expired tenants
 * Blocks only SUSPENDED tenants
 * 
 * Use this on routes that should be accessible even when expired
 * (e.g., viewing reports, downloading data)
 */
export async function allowReadOnlyAccess(request, reply) {
    try {
        const tenantId = request.tenantId;

        if (!tenantId) {
            return reply.code(403).send({
                success: false,
                error: 'Forbidden',
                message: 'Tenant context required',
                subscription_status: 'unknown'
            });
        }

        // Get current subscription status
        const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);
        const state = status.tenant.status;

        // Attach subscription status to request
        request.subscriptionStatus = status;

        // Only block SUSPENDED
        if (state === TENANT_STATES.SUSPENDED) {
            logger.warn('Suspended tenant access attempt', {
                tenantId,
                tenantSlug: status.tenant.slug,
                url: request.url,
                ip: request.ip
            });

            return reply.code(403).send({
                success: false,
                error: 'Account Suspended',
                message: 'Your account has been suspended. Please contact billing@track-myads.com for assistance.',
                subscription_status: 'suspended'
            });
        }

        // Allow all other states (ACTIVE, TRIAL, EXPIRED)
        // Handler can check request.subscriptionStatus to show warnings
        return;
    } catch (error) {
        logger.error('Error in allowReadOnlyAccess middleware:', error);
        return reply.code(500).send({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to verify subscription status'
        });
    }
}

/**
 * Attach subscription status to request
 * Does not block any requests
 * 
 * Use this to make subscription status available in handlers
 * without enforcing access control
 */
export async function attachSubscriptionStatus(request, reply) {
    try {
        const tenantId = request.tenantId;

        if (!tenantId) {
            request.subscriptionStatus = null;
            return;
        }

        // Get current subscription status
        const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);

        // Attach to request
        request.subscriptionStatus = status;
    } catch (error) {
        logger.error('Error in attachSubscriptionStatus middleware:', error);
        request.subscriptionStatus = null;
    }
}

/**
 * Check if write operations are allowed
 * Helper function for use in route handlers
 * 
 * @param {Object} request - Fastify request object
 * @returns {boolean} True if write operations are allowed
 */
export function canWrite(request) {
    const status = request.subscriptionStatus;
    if (!status) return false;

    const state = status.tenant.status;
    return state === TENANT_STATES.ACTIVE || state === TENANT_STATES.TRIAL;
}

/**
 * Check if read operations are allowed
 * Helper function for use in route handlers
 * 
 * @param {Object} request - Fastify request object
 * @returns {boolean} True if read operations are allowed
 */
export function canRead(request) {
    const status = request.subscriptionStatus;
    if (!status) return false;

    const state = status.tenant.status;
    return state !== TENANT_STATES.SUSPENDED;
}

/**
 * Get subscription warning message for UI
 * Returns null if no warning needed
 * 
 * @param {Object} request - Fastify request object
 * @returns {string|null} Warning message or null
 */
export function getSubscriptionWarning(request) {
    const status = request.subscriptionStatus;
    if (!status) return null;

    const { subscription } = status;

    // Expired
    if (subscription.is_expired) {
        return 'Your access has expired. Please contact billing@track-myads.com to continue.';
    }

    // Warning (≤ 3 days left)
    if (subscription.is_warning && subscription.days_left !== null) {
        if (subscription.is_trial) {
            return `Trial ending in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} — upgrade to avoid interruption`;
        } else {
            return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
        }
    }

    return null;
}

/**
 * Get countdown text for UI
 * 
 * @param {Object} request - Fastify request object
 * @returns {string|null} Countdown text or null
 */
export function getCountdownText(request) {
    const status = request.subscriptionStatus;
    if (!status) return null;

    const { subscription } = status;

    if (subscription.days_left === null) return null;

    if (subscription.is_trial) {
        return `Trial: ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} left`;
    } else if (subscription.is_active) {
        return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
    }

    return null;
}

/**
 * Centralized subscription enforcement
 * - Applies to tenant-scoped API requests
 * - Allows read-only access for EXPIRED tenants
 * - Blocks SUSPENDED tenants entirely
 * - Skips auth/health/public endpoints
 */
export async function enforceSubscriptionAccess(request, reply) {
    try {
        if (!request.tenantId || shouldSkipSubscriptionEnforcement(request)) {
            return;
        }

        const status = await subscriptionService.getTenantSubscriptionStatus(request.tenantId);
        request.subscriptionStatus = status;

        const state = status.tenant.status;
        if (state === TENANT_STATES.SUSPENDED) {
            logger.warn('Suspended tenant access attempt', {
                tenantId: request.tenantId,
                tenantSlug: status.tenant.slug,
                url: request.url,
                ip: request.ip
            });

            return reply.code(403).send({
                success: false,
                error: 'Account Suspended',
                message: 'Your account has been suspended. Please contact billing@track-myads.com for assistance.',
                subscription_status: 'suspended'
            });
        }

        if (state === TENANT_STATES.EXPIRED) {
            logger.warn('Expired tenant access attempt', {
                tenantId: request.tenantId,
                tenantSlug: status.tenant.slug,
                url: request.url,
                ip: request.ip
            });

            return reply.code(403).send({
                success: false,
                error: 'Subscription Expired',
                message: 'Your access has expired. Please contact billing@track-myads.com to continue.',
                subscription_status: 'expired',
                billing_email: 'billing@track-myads.com'
            });
        }
    } catch (error) {
        logger.error('Error enforcing subscription access:', error);
        return reply.code(500).send({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to verify subscription status'
        });
    }
}
