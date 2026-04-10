
import logger from '../utils/logger.js';


/**
 * Subscription Service
 * 
 * Production-grade subscription and trial management for multi-tenant SaaS.
 * 
 * CORE PRINCIPLES:
 * - State-driven (TRIAL, ACTIVE, EXPIRED, SUSPENDED)
 * - Deterministic (no ad-hoc logic)
 * - Timezone-safe (UTC only)
 * - Server-side enforcement
 * - Single source of truth
 */

const TRIAL_DURATION_DAYS = 10;
const TENANT_STATES = {
    TRIAL: 'TRIAL',
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    SUSPENDED: 'SUSPENDED'
};

const normalizeTenantState = (status) => {
    if (!status) return null;
    return String(status).toUpperCase();
};

export class SubscriptionService {
  constructor(subscriptionRepository, pool) {
    this.subscriptionRepository = subscriptionRepository;
    this.pool = pool;
  }
    /**
     * Start trial on first login
     * Sets trial_start_at and trial_end_at (10 days from now)
     * Updates state to TRIAL
     * 
     * @param {number} tenantId - Tenant ID
     * @param {number} userId - User ID who triggered the trial
     * @returns {Promise<Object>} Updated tenant data
     */
    async startTrial(tenantId, userId = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            // Check if trial already started
            if (tenant.trial_start_at) {
                logger.info(`Trial already started for tenant ${tenantId}`, {
                    tenantId,
                    trialStartAt: tenant.trial_start_at,
                    trialEndAt: tenant.trial_end_at
                });
                await connection.commit();
                return this.getTenantSubscriptionStatus(tenantId);
            }

            // Calculate trial dates (UTC)
            const now = new Date();
            const trialStartAt = now;
            const trialEndAt = new Date(now.getTime() + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000));

            // Update tenant
            await this.subscriptionRepository.updateTenantTrial(tenantId, trialStartAt, trialEndAt, TENANT_STATES.TRIAL, connection);

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'TRIAL_STARTED',
                previous_state: tenant.status,
                new_state: TENANT_STATES.TRIAL,
                new_end_at: trialEndAt,
                admin_id: userId,
                notes: `Trial started on first login. Duration: ${TRIAL_DURATION_DAYS} days`
            }, connection);

            await connection.commit();

            logger.info(`Trial started for tenant ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                trialStartAt,
                trialEndAt,
                userId
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error starting trial:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Activate subscription
     * Sets subscription_start_at and subscription_end_at
     * Updates state to ACTIVE
     * 
     * @param {number} tenantId - Tenant ID
     * @param {Date} endDate - Subscription end date (UTC)
     * @param {string} plan - Subscription plan identifier
     * @param {number} adminId - Admin who activated the subscription
     * @param {Date|null} startDate - Subscription start date (UTC)
     * @param {string|null} billingEmail - Billing contact email
     * @returns {Promise<Object>} Updated tenant data
     */
    async activateSubscription(tenantId, endDate, plan = 'basic', adminId = null, startDate = null, billingEmail = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            const now = new Date();
            const activationStart = startDate || now;
            const newState = activationStart <= now ? TENANT_STATES.ACTIVE : TENANT_STATES.EXPIRED;

            // Validate end date
            if (endDate <= activationStart) {
                throw new Error('Subscription end date must be in the future');
            }

            // Update tenant
            await connection.query(
                `UPDATE tenants 
        SET subscription_start_at = ?, 
            subscription_end_at = ?, 
            subscription_plan = ?,
            billing_email = COALESCE(?, billing_email),
            status = ?,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?`,
                [
                    activationStart,
                    endDate,
                    plan,
                    billingEmail,
                    activationStart <= now ? TENANT_STATES.ACTIVE : TENANT_STATES.EXPIRED,
                    tenantId
                ]
            );

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'SUBSCRIPTION_ACTIVATED',
                previous_state: tenant.status,
                new_state: newState,
                previous_end_at: tenant.subscription_end_at,
                new_end_at: endDate,
                admin_id: adminId,
                notes: `Subscription activated. Plan: ${plan}${startDate ? `, start: ${activationStart.toISOString()}` : ''}`
            }, connection);

            await connection.commit();

            logger.info(`Subscription activated for tenant ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                plan,
                subscriptionEndAt: endDate,
                subscriptionStartAt: activationStart,
                adminId
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error activating subscription:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Extend subscription by N days
     * 
     * @param {number} tenantId - Tenant ID
     * @param {number} days - Number of days to extend
     * @param {number} adminId - Admin who extended the subscription
     * @returns {Promise<Object>} Updated tenant data
     */
    async extendSubscription(tenantId, days, adminId = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            if (!tenant.subscription_end_at) {
                throw new Error('No active subscription to extend');
            }

            // Calculate new end date
            const currentEndDate = new Date(tenant.subscription_end_at);
            const newEndDate = new Date(currentEndDate.getTime() + (days * 24 * 60 * 60 * 1000));

            // Update tenant
            await this.subscriptionRepository.activateSubscription(tenantId, {
                subscription_start_at: tenant.subscription_start_at,
                subscription_end_at: newEndDate,
                subscription_plan: tenant.subscription_plan,
                billing_email: tenant.billing_email,
                status: TENANT_STATES.ACTIVE
            }, connection);

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'SUBSCRIPTION_EXTENDED',
                previous_state: tenant.status,
                new_state: TENANT_STATES.ACTIVE,
                previous_end_at: tenant.subscription_end_at,
                new_end_at: newEndDate,
                admin_id: adminId,
                notes: `Subscription extended by ${days} days`
            }, connection);

            await connection.commit();

            logger.info(`Subscription extended for tenant ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                days,
                previousEndAt: tenant.subscription_end_at,
                newEndAt: newEndDate,
                adminId
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error extending subscription:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Set custom subscription expiry date
     * 
     * @param {number} tenantId - Tenant ID
     * @param {Date} endDate - New subscription end date (UTC)
     * @param {number} adminId - Admin who set the date
     * @returns {Promise<Object>} Updated tenant data
     */
    async setSubscriptionEndDate(tenantId, endDate, adminId = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            const now = new Date();

            // If no subscription_start_at, set it to now
            const subscriptionStartAt = tenant.subscription_start_at || now;

            // Determine new state based on end date
            const newState = endDate > now ? TENANT_STATES.ACTIVE : TENANT_STATES.EXPIRED;

            // Update tenant
            await this.subscriptionRepository.activateSubscription(tenantId, {
                subscription_start_at: subscriptionStartAt,
                subscription_end_at: endDate,
                subscription_plan: tenant.subscription_plan,
                billing_email: tenant.billing_email,
                status: newState
            }, connection);

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'SUBSCRIPTION_EXTENDED',
                previous_state: tenant.status,
                new_state: newState,
                previous_end_at: tenant.subscription_end_at,
                new_end_at: endDate,
                admin_id: adminId,
                notes: `Custom subscription end date set`
            }, connection);

            await connection.commit();

            logger.info(`Subscription end date set for tenant ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                previousEndAt: tenant.subscription_end_at,
                newEndAt: endDate,
                newState,
                adminId
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error setting subscription end date:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Suspend tenant (manual admin action)
     * 
     * @param {number} tenantId - Tenant ID
     * @param {number} adminId - Admin who suspended the tenant
     * @param {string} reason - Reason for suspension
     * @returns {Promise<Object>} Updated tenant data
     */
    async suspendTenant(tenantId, adminId = null, reason = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            // Update tenant
            await this.subscriptionRepository.updateTenantState(tenantId, TENANT_STATES.SUSPENDED, connection);

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'TENANT_SUSPENDED',
                previous_state: tenant.status,
                new_state: TENANT_STATES.SUSPENDED,
                admin_id: adminId,
                notes: reason || 'Tenant suspended by admin'
            }, connection);

            await connection.commit();

            logger.warn(`Tenant suspended: ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                previousState: tenant.status,
                adminId,
                reason
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error suspending tenant:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Unsuspend tenant (manual admin action)
     * Restores tenant to appropriate state based on subscription/trial dates
     * 
     * @param {number} tenantId - Tenant ID
     * @param {number} adminId - Admin who unsuspended the tenant
     * @returns {Promise<Object>} Updated tenant data
     */
    async unsuspendTenant(tenantId, adminId = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            if (tenant.status !== TENANT_STATES.SUSPENDED) {
                throw new Error('Tenant is not suspended');
            }

            // Calculate appropriate state
            const now = new Date();
            let newState = TENANT_STATES.EXPIRED;

            if (tenant.subscription_end_at && new Date(tenant.subscription_end_at) > now) {
                newState = TENANT_STATES.ACTIVE;
            } else if (tenant.trial_end_at && new Date(tenant.trial_end_at) > now) {
                newState = TENANT_STATES.TRIAL;
            }

            // Update tenant
            await this.subscriptionRepository.updateTenantState(tenantId, newState, connection);

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'TENANT_UNSUSPENDED',
                previous_state: TENANT_STATES.SUSPENDED,
                new_state: newState,
                admin_id: adminId,
                notes: `Tenant unsuspended. Restored to ${newState} state.`
            }, connection);

            await connection.commit();

            logger.info(`Tenant unsuspended: ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                newState,
                adminId
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error unsuspending tenant:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Reset trial (admin only - for special cases)
     * 
     * @param {number} tenantId - Tenant ID
     * @param {number} adminId - Admin who reset the trial
     * @returns {Promise<Object>} Updated tenant data
     */
    async resetTrial(tenantId, adminId = null) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            // Calculate new trial dates
            const now = new Date();
            const trialStartAt = now;
            const trialEndAt = new Date(now.getTime() + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000));

            // Update tenant
            await this.subscriptionRepository.updateTenantTrial(tenantId, trialStartAt, trialEndAt, TENANT_STATES.TRIAL, connection);

            // Log to subscription history
            await this.subscriptionRepository.addHistory({
                tenant_id: tenantId,
                action: 'TRIAL_RESET',
                previous_state: tenant.status,
                new_state: TENANT_STATES.TRIAL,
                new_end_at: trialEndAt,
                admin_id: adminId,
                notes: `Trial reset by admin. New duration: ${TRIAL_DURATION_DAYS} days`
            }, connection);

            await connection.commit();

            logger.warn(`Trial reset for tenant ${tenantId}`, {
                tenantId,
                tenantSlug: tenant.slug,
                trialStartAt,
                trialEndAt,
                adminId
            });

            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error resetting trial:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get tenant subscription status
     * Returns current state, days left, and access level
     * 
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Subscription status
     */
    async getTenantSubscriptionStatus(tenantId) {
        const tenant = await this.subscriptionRepository.getTenantSubscriptionDetails(tenantId);

        if (!tenant) {
            throw new Error('Tenant not found');
        }

        const storedState = normalizeTenantState(tenant.status);
        const now = new Date();

        // Compute effective state from expiry timestamps (read-only).
        // This avoids per-request DB locks/transactions that can stall report queries on prod.
        let effectiveState = storedState;

        // SUSPENDED stays suspended regardless of timestamps.
        if (storedState === TENANT_STATES.SUSPENDED) {
            effectiveState = TENANT_STATES.SUSPENDED;
        } else if (tenant.subscription_end_at) {
            const subscriptionStart = tenant.subscription_start_at ? new Date(tenant.subscription_start_at) : null;
            if (subscriptionStart && subscriptionStart > now) {
                effectiveState = TENANT_STATES.EXPIRED;
            } else if (new Date(tenant.subscription_end_at) > now) {
                effectiveState = TENANT_STATES.ACTIVE;
            } else {
                effectiveState = TENANT_STATES.EXPIRED;
            }
        } else if (tenant.trial_end_at) {
            if (new Date(tenant.trial_end_at) > now) {
                effectiveState = TENANT_STATES.TRIAL;
            } else {
                effectiveState = TENANT_STATES.EXPIRED;
            }
        }

        // Calculate days left
        let daysLeft = null;
        let endDate = null;
        let isWarning = false;

        if (effectiveState === TENANT_STATES.ACTIVE && tenant.subscription_end_at) {
            endDate = new Date(tenant.subscription_end_at);
            daysLeft = Math.ceil((endDate - now) / (24 * 60 * 60 * 1000));
            isWarning = daysLeft <= 3 && daysLeft > 0;
        } else if (effectiveState === TENANT_STATES.TRIAL && tenant.trial_end_at) {
            endDate = new Date(tenant.trial_end_at);
            daysLeft = Math.ceil((endDate - now) / (24 * 60 * 60 * 1000));
            isWarning = daysLeft <= 3 && daysLeft > 0;
        }

        // Determine access level
        let accessLevel = 'none';
        if (effectiveState === TENANT_STATES.ACTIVE || effectiveState === TENANT_STATES.TRIAL) {
            accessLevel = 'full';
        } else if (effectiveState === TENANT_STATES.EXPIRED) {
            accessLevel = 'read_only';
        } else if (effectiveState === TENANT_STATES.SUSPENDED) {
            accessLevel = 'blocked';
        }

        return {
            tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                status: effectiveState || tenant.status,
                trial_start_at: tenant.trial_start_at,
                trial_end_at: tenant.trial_end_at,
                subscription_start_at: tenant.subscription_start_at,
                subscription_end_at: tenant.subscription_end_at,
                subscription_plan: tenant.subscription_plan,
                billing_email: tenant.billing_email,
                created_at: tenant.created_at,
                updated_at: tenant.updated_at
            },
            subscription: {
                state: effectiveState || tenant.status,
                access_level: accessLevel,
                days_left: daysLeft,
                end_date: endDate,
                is_warning: isWarning,
                is_trial: effectiveState === TENANT_STATES.TRIAL,
                is_active: effectiveState === TENANT_STATES.ACTIVE,
                is_expired: effectiveState === TENANT_STATES.EXPIRED,
                is_suspended: effectiveState === TENANT_STATES.SUSPENDED
            }
        };
    }

    /**
     * Update tenant state based on current dates
     * Called periodically by cron job and on login
     * 
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Updated subscription status
     */
    async updateTenantState(tenantId) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const tenant = await this.subscriptionRepository.getTenantForUpdate(tenantId, connection);
            if (!tenant) {
                throw new Error('Tenant not found');
            }

            const currentState = normalizeTenantState(tenant.status);
            const now = new Date();
            let newState = currentState;

            // Don't auto-change SUSPENDED state
            if (currentState === TENANT_STATES.SUSPENDED) {
                await connection.commit();
                return this.getTenantSubscriptionStatus(tenantId);
            }

            // Check subscription first (takes precedence over trial)
            if (tenant.subscription_end_at) {
                const subscriptionStart = tenant.subscription_start_at ? new Date(tenant.subscription_start_at) : null;
                if (subscriptionStart && subscriptionStart > now) {
                    newState = TENANT_STATES.EXPIRED;
                } else if (new Date(tenant.subscription_end_at) > now) {
                    newState = TENANT_STATES.ACTIVE;
                } else {
                    newState = TENANT_STATES.EXPIRED;
                }
            }
            // Check trial
            else if (tenant.trial_end_at) {
                if (new Date(tenant.trial_end_at) > now) {
                    newState = TENANT_STATES.TRIAL;
                } else {
                    newState = TENANT_STATES.EXPIRED;
                }
            }

            // Update state if changed
            if (newState !== currentState) {
                await this.subscriptionRepository.updateTenantState(tenantId, newState, connection);

                // Log state change
                const action = newState === TENANT_STATES.EXPIRED ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_ACTIVATED';
                await this.subscriptionRepository.addHistory({
                    tenant_id: tenantId,
                    action,
                    previous_state: currentState,
                    new_state: newState,
                    notes: 'State updated automatically based on expiry dates'
                }, connection);

                logger.info(`Tenant state updated: ${tenantId}`, {
                    tenantId,
                    tenantSlug: tenant.slug,
                    previousState: currentState,
                    newState
                });
            }

            await connection.commit();
            return this.getTenantSubscriptionStatus(tenantId);
        } catch (error) {
            await connection.rollback();
            logger.error('Error updating tenant state:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get subscription history for a tenant
     * 
     * @param {number} tenantId - Tenant ID
     * @param {number} limit - Number of records to return
     * @returns {Promise<Array>} Subscription history
     */
    async getSubscriptionHistory(tenantId, limit = 50) {
        return await this.subscriptionRepository.getSubscriptionHistory(tenantId, limit);
    }
}

// (no singleton export)
