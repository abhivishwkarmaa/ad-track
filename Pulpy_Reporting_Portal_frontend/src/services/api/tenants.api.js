import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Tenant Management API (Super Admin Only)
export const tenantsAPI = {
    // Get all tenants
    getTenants: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/tenants?${queryString}`);
    },
    // Get single tenant
    getTenant: async (id) => {
        return apiRequest(`/api/admin/tenants/${id}`);
    },
    // Create tenant
    createTenant: async (data) => {
        return apiRequest('/api/admin/tenants', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    // Update tenant
    updateTenant: async (id, data) => {
        return apiRequest(`/api/admin/tenants/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    // Suspend tenant
    suspendTenant: async (id) => {
        return apiRequest(`/api/admin/tenants/${id}/suspend`, {
            method: 'POST',
        });
    },
    // Resume tenant
    resumeTenant: async (id) => {
        return apiRequest(`/api/admin/tenants/${id}/resume`, {
            method: 'POST',
        });
    },
    // Get tenant metrics
    getTenantMetrics: async (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/tenants/${id}/metrics?${queryString}`);
    },
    // Delete tenant
    deleteTenant: async (id, hardDelete = false) => {
        const queryString = hardDelete ? '?hardDelete=true' : '';
        return apiRequest(`/api/admin/tenants/${id}${queryString}`, {
            method: 'DELETE',
        });
    },
};
