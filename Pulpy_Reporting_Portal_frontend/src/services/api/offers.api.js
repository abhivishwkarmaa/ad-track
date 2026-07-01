import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Offers API
export const offersAPI = {
    getOffers: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers?${queryString}`, requestOptions);
    },
    searchOffers: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/search?${queryString}`, requestOptions);
    },
    getOffer: async (id, requestOptions = {}) => {
        return apiRequest(`/api/admin/offers/${id}`, requestOptions);
    },
    getOfferStats: async (id, params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/${id}/stats${queryString ? `?${queryString}` : ''}`, requestOptions);
    },
    getOfferDailyStats: async (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/${id}/daily-stats?${queryString}`);
    },
    getOfferRecentClicks: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/recent-clicks`);
    },
    getOfferRecentConversions: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/recent-conversions`);
    },
    getOfferPublisherStats: async (id, params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/${id}/publisher-stats${queryString ? `?${queryString}` : ''}`, requestOptions);
    },
    getOfferForEdit: async (id, requestOptions = {}) => {
        return apiRequest(`/api/admin/offers/${id}/edit`, requestOptions);
    },
    getOfferAssignments: async (id, requestOptions = {}) => {
        return apiRequest(`/api/admin/offers/${id}/assignments`, requestOptions);
    },
    createOffer: async (data) => {
        return apiRequest('/api/admin/offers', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateOffer: async (id, data) => {
        return apiRequest(`/api/admin/offers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    updateOfferStatus: async (id, status) => {
        return apiRequest(`/api/admin/offers/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },
    deleteOffer: async (id) => {
        return apiRequest(`/api/admin/offers/${id}`, {
            method: 'DELETE',
        });
    },
};
