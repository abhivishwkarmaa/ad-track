import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Advertisers API
export const advertisersAPI = {
    getAdvertisers: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/advertisers?${queryString}`, requestOptions);
    },
    getAdvertiser: async (id, options = {}) => {
        const qs = options.internalOnly ? '?internal_only=1' : '';
        const requestOptions = options.signal ? { signal: options.signal } : {};
        return apiRequest(`/api/admin/advertisers/${id}${qs}`, requestOptions);
    },
    createAdvertiser: async (data) => {
        return apiRequest('/api/admin/advertisers', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateAdvertiser: async (id, data) => {
        return apiRequest(`/api/admin/advertisers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    deleteAdvertiser: async (id) => {
        return apiRequest(`/api/admin/advertisers/${id}`, {
            method: 'DELETE',
        });
    },
};
