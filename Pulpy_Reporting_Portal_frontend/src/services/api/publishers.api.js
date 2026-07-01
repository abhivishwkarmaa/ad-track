import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Publishers API
export const publishersAPI = {
    getPublishers: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/publishers?${queryString}`, requestOptions);
    },
    getPublisher: async (id, options = {}) => {
        const qs = options.internalOnly ? '?internal_only=1' : '';
        const requestOptions = options.signal ? { signal: options.signal } : {};
        return apiRequest(`/api/admin/publishers/${id}${qs}`, requestOptions);
    },
    createPublisher: async (data) => {
        return apiRequest('/api/admin/publishers', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updatePublisher: async (id, data) => {
        return apiRequest(`/api/admin/publishers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    deletePublisher: async (id) => {
        return apiRequest(`/api/admin/publishers/${id}`, {
            method: 'DELETE',
        });
    },
    testAffiliatePostback: async (data) => {
        return apiRequest('/api/admin/test-affiliate-postback', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    createTestConversion: async (tracking_url) => {
        return apiRequest('/api/admin/create-test-conversion', {
            method: 'POST',
            body: JSON.stringify({ tracking_url }),
        });
    },
    startTestPostbackSession: async (data) => {
        return apiRequest('/api/test-postback/start', {
            method: 'POST',
            body: JSON.stringify(data), // { affiliate_id, tracking_url }
        });
    },
    checkTestPostbackStatus: async (affiliateId, offerId, meta) => {
        return apiRequest(`/api/test-postback/status?affiliate_id=${affiliateId}&offer_id=${offerId}`, {}, meta);
    },
};
