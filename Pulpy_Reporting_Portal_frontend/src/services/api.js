import { getLastActivity, markActivity, broadcastLogout } from '../utils/activityTracker';

// 🔒 STRICT SUBDOMAIN-BASED MULTI-TENANCY
// ✅ CORRECT: Use relative paths for API calls
// Frontend operates on tenant subdomain (e.g., tenant1.domain.com)
// All API calls use relative paths, preserving Host header for tenant resolution
// In development: Vite proxy forwards /api/* to backend
// In production: NGINX proxy forwards /api/* to backend
// Host header is preserved in both cases, enabling tenant resolution from subdomain
// ❌ NEVER: Use absolute URLs, pass tenant headers, or infer tenant from client-side code

// 🛡️ SAFETY GUARD: Ensure no VITE_API_URL in production
if (import.meta.env.PROD && import.meta.env.VITE_API_URL) {
    throw new Error('❌ CRITICAL CONFIG ERROR: VITE_API_URL must NOT be set in production. The app must use relative paths (/api/...) to allow NGINX to handle tenant resolution via Host header.');
}

const BASE_URL = '';
const IDLE_TIMEOUT_MS = 180 * 60 * 1000; // 180 minutes (3 hours)

let accessToken = null;

export const setAccessToken = (token) => {
    accessToken = token || null;
};

export const clearAccessToken = () => {
    accessToken = null;
};

export const getAccessToken = () => accessToken;

const getStoredUser = () => {
    const user = localStorage.getItem('track-myads_user');
    if (!user) return null;
    try {
        return JSON.parse(user);
    } catch {
        return null;
    }
};

const isIdle = () => Date.now() - getLastActivity() > IDLE_TIMEOUT_MS;

const clearClientSession = () => {
    clearAccessToken();
    localStorage.removeItem('track-myads_user');
    localStorage.removeItem('bng_token');
    broadcastLogout();
};

const redirectToLogin = () => {
    window.location.href = '/login';
};

const refreshAccessToken = async () => {
    try {
        const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        const contentType = response.headers.get('content-type');
        const data = contentType && contentType.includes('application/json')
            ? await response.json()
            : null;

        if (!response.ok || !data?.success || !data?.data?.token) {
            return false;
        }

        setAccessToken(data.data.token);
        return true;
    } catch {
        return false;
    }
};

// API request helper
const apiRequest = async (endpoint, options = {}, meta = {}) => {
    const {
        trackActivity = true,
        skipAuth = false,
        skipIdleCheck = false,
        allowUnauthorized = false,
        isRetry = false,
    } = meta;

    const url = `${BASE_URL}${endpoint}`;
    const storedUser = getStoredUser();

    if (!skipIdleCheck && storedUser && isIdle()) {
        clearClientSession();
        redirectToLogin();
        throw new Error('SESSION_EXPIRED');
    }

    if (trackActivity) {
        markActivity();
    }

    // ✅ CRITICAL: Only set Content-Type for requests with body (POST, PUT, PATCH)
    // DELETE and GET requests don't need Content-Type if they have no body
    const hasBody = options.body !== undefined && options.body !== null;
    const needsContentType = hasBody && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || !options.method);
    const token = accessToken;

    const config = {
        ...options,
        credentials: 'include',
        headers: {
            ...(needsContentType && { 'Content-Type': 'application/json' }),
            ...(!skipAuth && token && { 'Authorization': `Bearer ${token}` }),
            ...(trackActivity && { 'X-User-Activity': '1' }),
            // 🔒 STRICT: Never add tenant headers (x-tenant-slug, x-tenant-id, etc.)
            // Tenant is resolved by backend from Host header (subdomain) ONLY
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // If not JSON, get text and try to parse
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch {
                // If parsing fails, create error object
                data = {
                    message: text || `HTTP ${response.status} ${response.statusText}`,
                    error: 'Invalid response format'
                };
            }
        }

        if (response.status === 401 && !allowUnauthorized) {
            if (!skipAuth && !isRetry && endpoint !== '/api/auth/refresh') {
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    return apiRequest(endpoint, options, { ...meta, isRetry: true });
                }
            }

            clearClientSession();
            redirectToLogin();
            throw new Error('SESSION_EXPIRED');
        }

        if (response.status === 502) {
            // Dispatch event for App.jsx to handle
            window.dispatchEvent(new CustomEvent('server-maintenance'));
            throw new Error('SERVER_MAINTENANCE');
        }

        if (!response.ok) {
            const errorMessage = data?.message || data?.error || `API request failed (${response.status})`;
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        // ✅ Don't show error messages for session expiry
        if (error.message === 'SESSION_EXPIRED') {
            throw error;
        }

        // Re-throw with better error message if it's not already an Error
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(error?.toString() || 'API request failed');
    }
};

// Auth API
export const authAPI = {
    login: async (email, password) => {
        const response = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }, {
            skipAuth: true,
            skipIdleCheck: true,
            allowUnauthorized: true,
        });

        if (response?.success && response?.data?.token) {
            setAccessToken(response.data.token);
        }

        return response;
    },
    refresh: async () => {
        const success = await refreshAccessToken();
        if (!success) {
            throw new Error('SESSION_EXPIRED');
        }
        return { success: true };
    },
    logout: async () => {
        return apiRequest('/api/auth/logout', {
            method: 'POST',
        }, {
            skipAuth: true,
            skipIdleCheck: true,
            trackActivity: false,
            allowUnauthorized: true,
        });
    },
    requestPasswordResetOtp: async (email) => {
        return apiRequest('/api/auth/forgot-password/request-otp', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }, {
            skipAuth: true,
            skipIdleCheck: true,
            allowUnauthorized: true,
        });
    },
    verifyPasswordResetOtp: async (email, otp) => {
        return apiRequest('/api/auth/forgot-password/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ email, otp }),
        }, {
            skipAuth: true,
            skipIdleCheck: true,
            allowUnauthorized: true,
        });
    },
    resetPassword: async (resetToken, newPassword) => {
        return apiRequest('/api/auth/forgot-password/reset', {
            method: 'POST',
            body: JSON.stringify({ resetToken, newPassword }),
        }, {
            skipAuth: true,
            skipIdleCheck: true,
            allowUnauthorized: true,
        });
    },
    requestChangePasswordOtp: async () => {
        return apiRequest('/api/auth/change-password/request-otp', {
            method: 'POST',
        });
    },
    verifyChangePasswordOtp: async (otp) => {
        return apiRequest('/api/auth/change-password/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ otp }),
        });
    },
    changePassword: async (resetToken, newPassword) => {
        return apiRequest('/api/auth/change-password/reset', {
            method: 'POST',
            body: JSON.stringify({ resetToken, newPassword }),
        });
    },
    updateProfile: async (data) => {
        return apiRequest('/api/auth/profile', {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
};

// Dashboard API
export const dashboardAPI = {
    // Aggregated dashboard - single call for all used data (cards, performance, summary, live offers, offer/pub stats, comparison)
    getDashboard: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard?${queryString}`);
    },
    // Dashboard cards - main metrics for UI cards display
    getDashboardCards: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/cards?${queryString}`);
    },
    // Top offers with conversions
    getTopOffers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/top-offers?${queryString}`);
    },
    // Performance chart data
    getPerformance: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/performance?${queryString}`);
    },
    // Performance summary (matching dashboard cards logic)
    getPerformanceSummary: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/performance-summary?${queryString}`);
    },
    // Top countries
    getTopCountries: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/top-countries?${queryString}`);
    },
    // Live offers
    getLiveOffers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/live-offers?${queryString}`);
    },
    // Legacy endpoints (keeping for backward compatibility)
    getSummary: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/summary?${queryString}`);
    },
    getDetailed: async (params = {}, meta) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/detailed?${queryString}`, {}, meta);
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

        let response = await requestCsv(accessToken);
        if (response.status === 401) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) throw new Error('Session expired. Please login again.');
            response = await requestCsv(accessToken);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `CSV export failed (${response.status})`);
        }

        return response.blob();
    },
    getPublisherConversions: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/publisher-conversions?${queryString}`);
    },
    // New Conversion Logs
    getConversions: async (params = {}, meta) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/conversions?${queryString}`, {}, meta);
    },
    // Offer Statistics
    getOfferStatistics: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/offer-statistics?${queryString}`);
    },
    // Publisher Statistics
    getPublisherStatistics: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/publisher-statistics?${queryString}`);
    },
    // Performance Comparison (current vs previous period)
    getPerformanceComparison: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/performance-comparison?${queryString}`);
    },
    // Manual Click Approval
    approveClick: async (clickUuid) => {
        return apiRequest('/api/admin/reports/approve-click', {
            method: 'POST',
            body: JSON.stringify({ click_uuid: clickUuid }),
        });
    },
};

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

// Offers API
export const offersAPI = {
    getOffers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers?${queryString}`);
    },
    searchOffers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/search?${queryString}`);
    },
    getOffer: async (id) => {
        return apiRequest(`/api/admin/offers/${id}`);
    },
    getOfferStats: async (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/${id}/stats${queryString ? `?${queryString}` : ''}`);
    },
    getOfferDailyStats: async (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/${id}/daily-stats?${queryString}`);
    },
    getOfferAssignments: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/assignments`);
    },
    getOfferRecentClicks: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/recent-clicks`);
    },
    getOfferRecentConversions: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/recent-conversions`);
    },
    getOfferPublisherStats: async (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers/${id}/publisher-stats${queryString ? `?${queryString}` : ''}`);
    },
    getOfferForEdit: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/edit`);
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

// Publishers API
export const publishersAPI = {
    getPublishers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/publishers?${queryString}`);
    },
    getPublisher: async (id) => {
        return apiRequest(`/api/admin/publishers/${id}`);
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


// Advertisers API
export const advertisersAPI = {
    getAdvertisers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/advertisers?${queryString}`);
    },
    getAdvertiser: async (id) => {
        return apiRequest(`/api/admin/advertisers/${id}`);
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

// Assignments API
export const assignmentsAPI = {
    getAssignments: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/assignments?${queryString}`);
    },
    getAssignment: async (id) => {
        return apiRequest(`/api/admin/assignments/${id}`);
    },
    createOrUpdateAssignments: async (data) => {
        return apiRequest('/api/admin/assignments', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateAssignment: async (id, data) => {
        return apiRequest(`/api/admin/assignments/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    getTrackingUrl: async (id, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/assignments/${id}/tracking-url${queryString ? `?${queryString}` : ''}`);
    },
    deleteAssignment: async (id) => {
        return apiRequest(`/api/admin/assignments/${id}`, {
            method: 'DELETE',
        });
    },
};

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

// Contact Submissions API (Super Admin Only - Admin Subdomain Only)
export const contactSubmissionsAPI = {
    // Get all contact submissions with pagination and filters
    getContactSubmissions: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/contact-submissions?${queryString}`);
    },
    // Get single contact submission
    getContactSubmission: async (id) => {
        return apiRequest(`/api/admin/contact-submissions/${id}`);
    },
    // Update contact submission status
    updateContactStatus: async (id, status) => {
        return apiRequest(`/api/admin/contact-submissions/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },
    // Delete contact submission
    deleteContactSubmission: async (id) => {
        return apiRequest(`/api/admin/contact-submissions/${id}`, {
            method: 'DELETE',
        });
    },
    // Get contact submissions statistics
    getContactStats: async () => {
        return apiRequest('/api/admin/contact-submissions/stats');
    },
};

export default {
    authAPI,
    dashboardAPI,
    subscriptionAPI,
    adminSubscriptionAPI,
    offersAPI,
    publishersAPI,
    advertisersAPI,
    assignmentsAPI,
    tenantsAPI,
    contactSubmissionsAPI,
};

