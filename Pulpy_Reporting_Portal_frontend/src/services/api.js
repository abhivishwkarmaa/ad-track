// ✅ CORRECT: Use relative paths for API calls
// In development: Vite proxy forwards /api/* to backend
// In production: NGINX proxy forwards /api/* to backend
// Host header is preserved in both cases, enabling tenant resolution
const BASE_URL = import.meta.env.VITE_API_URL || '';

// Get token from localStorage
const getToken = () => {
    const user = localStorage.getItem('bng_user');
    if (user) {
        try {
            const parsedUser = JSON.parse(user);
            return parsedUser.token;
        } catch (e) {
            return null;
        }
    }
    return null;
};

// API request helper
const apiRequest = async (endpoint, options = {}) => {
    const token = getToken();
    const url = `${BASE_URL}${endpoint}`;

    // ✅ CRITICAL: Only set Content-Type for requests with body (POST, PUT, PATCH)
    // DELETE and GET requests don't need Content-Type if they have no body
    const hasBody = options.body !== undefined && options.body !== null;
    const needsContentType = hasBody && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || !options.method);

    const config = {
        ...options,
        headers: {
            ...(needsContentType && { 'Content-Type': 'application/json' }),
            ...(token && { 'Authorization': `Bearer ${token}` }),
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
            } catch (e) {
                // If parsing fails, create error object
                data = {
                    message: text || `HTTP ${response.status} ${response.statusText}`,
                    error: 'Invalid response format'
                };
            }
        }

        if (!response.ok) {
            const errorMessage = data?.message || data?.error || `API request failed (${response.status})`;
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
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
        return apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
};

// Dashboard API
export const dashboardAPI = {
    // Main dashboard data (KPI cards)
    getDashboard: async () => {
        return apiRequest('/api/admin/reports/dashboard');
    },
    // Dashboard cards - main metrics for UI cards display
    getDashboardCards: async () => {
        return apiRequest('/api/admin/reports/dashboard/cards');
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
    // Top affiliates chart
    getTopAffiliates: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/top-affiliates?${queryString}`);
    },
    // Info cards data
    getInfoCards: async () => {
        return apiRequest('/api/admin/reports/dashboard/info-cards');
    },
    // Top countries
    getTopCountries: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/dashboard/top-countries?${queryString}`);
    },
    // Legacy endpoints (keeping for backward compatibility)
    getSummary: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/summary?${queryString}`);
    },
    getDetailed: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/detailed?${queryString}`);
    },
    getPublisherConversions: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/publisher-conversions?${queryString}`);
    },
    // New Conversion Logs
    getConversions: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/reports/conversions?${queryString}`);
    },
};

// Offers API
export const offersAPI = {
    getOffers: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/offers?${queryString}`);
    },
    getOffer: async (id) => {
        return apiRequest(`/api/admin/offers/${id}`);
    },
    getOfferStats: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/stats`);
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
    getOfferPublisherStats: async (id) => {
        return apiRequest(`/api/admin/offers/${id}/publisher-stats`);
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
    getTrackingUrl: async (id) => {
        return apiRequest(`/api/admin/assignments/${id}/tracking-url`);
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

export default {
    authAPI,
    dashboardAPI,
    offersAPI,
    publishersAPI,
    advertisersAPI,
    assignmentsAPI,
    tenantsAPI,
};

