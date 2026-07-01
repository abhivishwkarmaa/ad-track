import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Dashboard API
export const dashboardAPI = {
    // Aggregated dashboard - single call for all used data (cards, performance, summary, live offers, offer/pub stats, comparison)
    getDashboard: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard?${queryString}`, requestOptions);
    },
    // Dashboard cards - main metrics for UI cards display
    getDashboardCards: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/cards?${queryString}`, requestOptions);
    },
    // Top offers with conversions
    getTopOffers: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/top-offers?${queryString}`, requestOptions);
    },
    // Performance chart data
    getPerformance: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/performance?${queryString}`, requestOptions);
    },
    // Performance summary (matching dashboard cards logic)
    getPerformanceSummary: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/performance-summary?${queryString}`, requestOptions);
    },
    // Top countries
    getTopCountries: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/top-countries?${queryString}`);
    },
    // Live offers
    getLiveOffers: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/live-offers?${queryString}`, requestOptions);
    },
    // Legacy endpoints (keeping for backward compatibility)
    getSummary: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/summary?${queryString}`, requestOptions);
    },
    getDetailed: async (params = {}, meta = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/detailed?${queryString}`, requestOptions, meta);
    },
    exportDetailedCSV: async (params = {}) => {
        const queryString = new URLSearchParams({ ...params, export: 'csv' }).toString();
        const endpoint = `/api/admin/reports/detailed?${queryString}`;

        const requestCsv = async (token) => {
            return fetch(`${BASE_URL}${endpoint}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
            });
        };

        let response = await requestCsv(getAccessToken());
        if (response.status === 401) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) throw new Error('Session expired. Please login again.');
            response = await requestCsv(getAccessToken());
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `CSV export failed (${response.status})`);
        }

        return response.blob();
    },
    getPublisherConversions: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/publisher-conversions?${queryString}`, requestOptions);
    },
    // New Conversion Logs
    getConversions: async (params = {}, meta = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/conversions?${queryString}`, requestOptions, meta);
    },
    // Offer Statistics
    getOfferStatistics: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/offer-statistics?${queryString}`, requestOptions);
    },
    // Publisher Statistics
    getPublisherStatistics: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/publisher-statistics?${queryString}`, requestOptions);
    },
    // Performance Comparison (current vs previous period)
    getPerformanceComparison: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/performance-comparison?${queryString}`, requestOptions);
    },
    // Manual Click Approval
    approveClick: async (clickUuid) => {
        return apiRequest('/api/admin/reports/approve-click', {
            method: 'POST',
            body: JSON.stringify({ click_uuid: clickUuid }),
        });
    },
};
