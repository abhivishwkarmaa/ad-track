export function isSubscriptionExpired(tenant) {
    if (!tenant) return false;

    if (tenant.status === 'EXPIRED') return true;

    if (tenant.subscription_end_at) {
        return new Date(tenant.subscription_end_at) < new Date();
    }

    if (tenant.trial_end_at) {
        return new Date(tenant.trial_end_at) < new Date();
    }

    return false;
}
