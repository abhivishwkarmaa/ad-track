import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Subscription API
export const subscriptionAPI = {
    getStatus: async () => {
        return apiRequest('/api/subscription/status');
    },
};

export const adminSubscriptionAPI = {
    getTenantStatus: async (tenantId) => {
        return apiRequest(`/api/admin/subscriptions/${tenantId}`);
    },
    activateSubscription: async (tenantId, data) => {
        return apiRequest(`/api/admin/subscriptions/${tenantId}/activate`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};
