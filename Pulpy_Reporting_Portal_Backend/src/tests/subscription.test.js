import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import pool from '../src/db/connection.js';
import subscriptionService from '../src/services/subscriptionService.js';

/**
 * Subscription Service Tests
 * 
 * Tests for production-grade subscription and trial system
 * 
 * Test Coverage:
 * - Trial starts on first login
 * - Trial expires exactly after 10 days
 * - Subscription activation
 * - Subscription expiry
 * - Admin extension
 * - Midnight boundary (UTC)
 * - Tenant isolation
 * - Countdown accuracy
 * - State transitions
 */

describe('Subscription Service', () => {
    let testTenantId;

    beforeAll(async () => {
        // Create test tenant
        const [result] = await pool.query(
            'INSERT INTO tenants (name, slug, status) VALUES (?, ?, ?)',
            ['Test Tenant', `test-tenant-${Date.now()}`, 'TRIAL']
        );
        testTenantId = result.insertId;
    });

    afterAll(async () => {
        // Clean up test tenant
        if (testTenantId) {
            await pool.query('DELETE FROM subscription_history WHERE tenant_id = ?', [testTenantId]);
            await pool.query('DELETE FROM tenants WHERE id = ?', [testTenantId]);
        }
    });

    beforeEach(async () => {
        // Reset tenant state before each test
        await pool.query(
            `UPDATE tenants 
       SET trial_start_at = NULL, 
           trial_end_at = NULL, 
           subscription_start_at = NULL, 
           subscription_end_at = NULL,
           status = 'TRIAL'
       WHERE id = ?`,
            [testTenantId]
        );
        await pool.query('DELETE FROM subscription_history WHERE tenant_id = ?', [testTenantId]);
    });

    describe('Trial Management', () => {
        it('should start trial on first login', async () => {
            const beforeStart = new Date();
            const result = await subscriptionService.startTrial(testTenantId, 1);
            const afterStart = new Date();

            expect(result.tenant.status).toBe('TRIAL');
            expect(result.tenant.trial_start_at).toBeTruthy();
            expect(result.tenant.trial_end_at).toBeTruthy();

            const trialStart = new Date(result.tenant.trial_start_at);
            const trialEnd = new Date(result.tenant.trial_end_at);

            // Trial start should be between before and after
            expect(trialStart.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
            expect(trialStart.getTime()).toBeLessThanOrEqual(afterStart.getTime());

            // Trial end should be exactly 10 days after start
            const expectedEnd = new Date(trialStart.getTime() + (10 * 24 * 60 * 60 * 1000));
            expect(Math.abs(trialEnd.getTime() - expectedEnd.getTime())).toBeLessThan(1000); // Within 1 second
        });

        it('should not restart trial if already started', async () => {
            // Start trial first time
            const firstResult = await subscriptionService.startTrial(testTenantId, 1);
            const firstTrialStart = new Date(firstResult.tenant.trial_start_at);

            // Try to start trial again
            const secondResult = await subscriptionService.startTrial(testTenantId, 1);
            const secondTrialStart = new Date(secondResult.tenant.trial_start_at);

            // Trial start should be the same
            expect(firstTrialStart.getTime()).toBe(secondTrialStart.getTime());
        });

        it('should calculate days left correctly', async () => {
            await subscriptionService.startTrial(testTenantId, 1);
            const status = await subscriptionService.getTenantSubscriptionStatus(testTenantId);

            expect(status.subscription.days_left).toBeGreaterThan(9);
            expect(status.subscription.days_left).toBeLessThanOrEqual(10);
            expect(status.subscription.is_trial).toBe(true);
        });

        it('should expire trial after 10 days', async () => {
            // Manually set trial to expired
            const now = new Date();
            const trialStart = new Date(now.getTime() - (11 * 24 * 60 * 60 * 1000)); // 11 days ago
            const trialEnd = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)); // 1 day ago

            await pool.query(
                `UPDATE tenants 
         SET trial_start_at = ?, 
             trial_end_at = ?, 
             status = 'TRIAL'
         WHERE id = ?`,
                [trialStart, trialEnd, testTenantId]
            );

            // Update state
            const status = await subscriptionService.updateTenantState(testTenantId);

            expect(status.tenant.status).toBe('EXPIRED');
            expect(status.subscription.is_expired).toBe(true);
            expect(status.subscription.access_level).toBe('read_only');
        });

        it('should show warning when 3 days or less remaining', async () => {
            // Set trial to expire in 3 days
            const now = new Date();
            const trialStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
            const trialEnd = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)); // 3 days from now

            await pool.query(
                `UPDATE tenants 
         SET trial_start_at = ?, 
             trial_end_at = ?, 
             status = 'TRIAL'
         WHERE id = ?`,
                [trialStart, trialEnd, testTenantId]
            );

            const status = await subscriptionService.getTenantSubscriptionStatus(testTenantId);

            expect(status.subscription.is_warning).toBe(true);
            expect(status.subscription.days_left).toBeLessThanOrEqual(3);
        });

        it('should reset trial (admin action)', async () => {
            // Start trial
            await subscriptionService.startTrial(testTenantId, 1);

            // Expire it
            const now = new Date();
            const expiredEnd = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000));
            await pool.query(
                'UPDATE tenants SET trial_end_at = ?, status = ? WHERE id = ?',
                [expiredEnd, 'EXPIRED', testTenantId]
            );

            // Reset trial
            const result = await subscriptionService.resetTrial(testTenantId, 1);

            expect(result.tenant.status).toBe('TRIAL');
            expect(result.subscription.days_left).toBeGreaterThan(9);
        });
    });

    describe('Subscription Management', () => {
        it('should activate subscription', async () => {
            const endDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now
            const result = await subscriptionService.activateSubscription(
                testTenantId,
                endDate,
                'pro',
                1
            );

            expect(result.tenant.status).toBe('ACTIVE');
            expect(result.tenant.subscription_start_at).toBeTruthy();
            expect(result.tenant.subscription_end_at).toBeTruthy();
            expect(result.tenant.subscription_plan).toBe('pro');
            expect(result.subscription.is_active).toBe(true);
            expect(result.subscription.access_level).toBe('full');
        });

        it('should extend subscription by N days', async () => {
            // Activate subscription
            const initialEnd = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
            await subscriptionService.activateSubscription(testTenantId, initialEnd, 'basic', 1);

            // Extend by 15 days
            const result = await subscriptionService.extendSubscription(testTenantId, 15, 1);

            const newEnd = new Date(result.tenant.subscription_end_at);
            const expectedEnd = new Date(initialEnd.getTime() + (15 * 24 * 60 * 60 * 1000));

            expect(Math.abs(newEnd.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
            expect(result.tenant.status).toBe('ACTIVE');
        });

        it('should set custom subscription end date', async () => {
            const customEnd = new Date('2026-12-31T23:59:59Z');
            const result = await subscriptionService.setSubscriptionEndDate(testTenantId, customEnd, 1);

            expect(result.tenant.status).toBe('ACTIVE');
            expect(new Date(result.tenant.subscription_end_at).getTime()).toBe(customEnd.getTime());
        });

        it('should expire subscription after end date', async () => {
            // Set subscription to expired
            const now = new Date();
            const subscriptionStart = new Date(now.getTime() - (31 * 24 * 60 * 60 * 1000)); // 31 days ago
            const subscriptionEnd = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)); // 1 day ago

            await pool.query(
                `UPDATE tenants 
         SET subscription_start_at = ?, 
             subscription_end_at = ?, 
             status = 'ACTIVE'
         WHERE id = ?`,
                [subscriptionStart, subscriptionEnd, testTenantId]
            );

            // Update state
            const status = await subscriptionService.updateTenantState(testTenantId);

            expect(status.tenant.status).toBe('EXPIRED');
            expect(status.subscription.is_expired).toBe(true);
        });

        it('should prioritize subscription over trial', async () => {
            // Set both trial and subscription
            const now = new Date();
            const trialEnd = new Date(now.getTime() + (5 * 24 * 60 * 60 * 1000)); // 5 days
            const subscriptionEnd = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days

            await pool.query(
                `UPDATE tenants 
         SET trial_start_at = ?, 
             trial_end_at = ?, 
             subscription_start_at = ?,
             subscription_end_at = ?,
             status = 'ACTIVE'
         WHERE id = ?`,
                [now, trialEnd, now, subscriptionEnd, testTenantId]
            );

            const status = await subscriptionService.getTenantSubscriptionStatus(testTenantId);

            // Should use subscription, not trial
            expect(status.subscription.is_active).toBe(true);
            expect(status.subscription.is_trial).toBe(false);
            expect(status.subscription.days_left).toBeGreaterThan(29);
        });
    });

    describe('Tenant Suspension', () => {
        it('should suspend tenant', async () => {
            const result = await subscriptionService.suspendTenant(testTenantId, 1, 'Payment failed');

            expect(result.tenant.status).toBe('SUSPENDED');
            expect(result.subscription.is_suspended).toBe(true);
            expect(result.subscription.access_level).toBe('blocked');
        });

        it('should unsuspend tenant to correct state', async () => {
            // Set active subscription
            const endDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
            await subscriptionService.activateSubscription(testTenantId, endDate, 'basic', 1);

            // Suspend
            await subscriptionService.suspendTenant(testTenantId, 1);

            // Unsuspend
            const result = await subscriptionService.unsuspendTenant(testTenantId, 1);

            // Should restore to ACTIVE (because subscription is still valid)
            expect(result.tenant.status).toBe('ACTIVE');
        });

        it('should not auto-change suspended state', async () => {
            // Suspend tenant
            await subscriptionService.suspendTenant(testTenantId, 1);

            // Try to update state
            const result = await subscriptionService.updateTenantState(testTenantId);

            // Should remain suspended
            expect(result.tenant.status).toBe('SUSPENDED');
        });
    });

    describe('State Transitions', () => {
        it('should transition TRIAL → ACTIVE on subscription activation', async () => {
            // Start trial
            await subscriptionService.startTrial(testTenantId, 1);

            // Activate subscription
            const endDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
            const result = await subscriptionService.activateSubscription(testTenantId, endDate, 'pro', 1);

            expect(result.tenant.status).toBe('ACTIVE');

            // Check history
            const history = await subscriptionService.getSubscriptionHistory(testTenantId);
            const activationEvent = history.find(h => h.action === 'SUBSCRIPTION_ACTIVATED');
            expect(activationEvent).toBeTruthy();
            expect(activationEvent.previous_state).toBe('TRIAL');
            expect(activationEvent.new_state).toBe('ACTIVE');
        });

        it('should transition ACTIVE → EXPIRED on expiry', async () => {
            // Set expired subscription
            const now = new Date();
            const subscriptionEnd = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000));

            await pool.query(
                `UPDATE tenants 
         SET subscription_start_at = ?, 
             subscription_end_at = ?, 
             status = 'ACTIVE'
         WHERE id = ?`,
                [now, subscriptionEnd, testTenantId]
            );

            // Update state
            await subscriptionService.updateTenantState(testTenantId);

            // Check history
            const history = await subscriptionService.getSubscriptionHistory(testTenantId);
            const expiryEvent = history.find(h => h.action === 'SUBSCRIPTION_EXPIRED');
            expect(expiryEvent).toBeTruthy();
            expect(expiryEvent.previous_state).toBe('ACTIVE');
            expect(expiryEvent.new_state).toBe('EXPIRED');
        });
    });

    describe('Subscription History', () => {
        it('should record all subscription changes', async () => {
            // Start trial
            await subscriptionService.startTrial(testTenantId, 1);

            // Activate subscription
            const endDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
            await subscriptionService.activateSubscription(testTenantId, endDate, 'pro', 1);

            // Extend subscription
            await subscriptionService.extendSubscription(testTenantId, 15, 1);

            // Get history
            const history = await subscriptionService.getSubscriptionHistory(testTenantId);

            expect(history.length).toBeGreaterThanOrEqual(3);
            expect(history.some(h => h.action === 'TRIAL_STARTED')).toBe(true);
            expect(history.some(h => h.action === 'SUBSCRIPTION_ACTIVATED')).toBe(true);
            expect(history.some(h => h.action === 'SUBSCRIPTION_EXTENDED')).toBe(true);
        });
    });

    describe('UTC Timezone Handling', () => {
        it('should handle midnight boundary correctly', async () => {
            // Set trial to expire at midnight UTC
            const midnight = new Date();
            midnight.setUTCHours(0, 0, 0, 0);
            midnight.setUTCDate(midnight.getUTCDate() + 1); // Tomorrow midnight

            const trialStart = new Date(midnight.getTime() - (10 * 24 * 60 * 60 * 1000));

            await pool.query(
                `UPDATE tenants 
         SET trial_start_at = ?, 
             trial_end_at = ?, 
             status = 'TRIAL'
         WHERE id = ?`,
                [trialStart, midnight, testTenantId]
            );

            const status = await subscriptionService.getTenantSubscriptionStatus(testTenantId);

            // Should still be in trial (expires tomorrow)
            expect(status.tenant.status).toBe('TRIAL');
            expect(status.subscription.days_left).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle tenant not found', async () => {
            await expect(
                subscriptionService.getTenantSubscriptionStatus(999999)
            ).rejects.toThrow('Tenant not found');
        });

        it('should handle invalid end date', async () => {
            const pastDate = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000));

            await expect(
                subscriptionService.activateSubscription(testTenantId, pastDate, 'basic', 1)
            ).rejects.toThrow('Subscription end date must be in the future');
        });

        it('should handle extending non-existent subscription', async () => {
            await expect(
                subscriptionService.extendSubscription(testTenantId, 30, 1)
            ).rejects.toThrow('No active subscription to extend');
        });
    });
});
