import { apiRequest, setAccessToken } from './http.js';

export const publisherAPI = {
    login: async (email, password) => {
        const response = await apiRequest('/api/auth/publisher/login', {
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

    getDashboard: (params = {}) => {
        const query = new URLSearchParams();
        ['range', 'date_from', 'date_to', 'range_start_utc', 'range_end_utc', 'report_timezone'].forEach((key) => {
            if (params[key]) query.append(key, params[key]);
        });
        const qs = query.toString();
        return apiRequest(`/api/publisher/dashboard${qs ? `?${qs}` : ''}`, {
            method: 'GET',
        });
    },

    getOffers: (params = {}) => {
        const query = new URLSearchParams();
        if (params.search) query.append('search', params.search);
        if (params.status) query.append('status', params.status);
        if (params.page) query.append('page', params.page);
        if (params.limit) query.append('limit', params.limit);
        const qs = query.toString();
        return apiRequest(`/api/publisher/offers${qs ? `?${qs}` : ''}`, {
            method: 'GET',
        });
    },

    getReports: (params = {}) => {
        const query = new URLSearchParams();
        if (params.start_date) query.append('start_date', params.start_date);
        if (params.end_date) query.append('end_date', params.end_date);
        if (params.offer_id) query.append('offer_id', params.offer_id);
        if (params.group_by) query.append('group_by', params.group_by);
        if (params.country) query.append('country', params.country);
        if (params.device_type) query.append('device_type', params.device_type);
        if (params.status) query.append('status', params.status);
        if (params.search) query.append('search', params.search);
        const qs = query.toString();
        return apiRequest(`/api/publisher/reports${qs ? `?${qs}` : ''}`, {
            method: 'GET',
        });
    },

    getProfile: () =>
        apiRequest('/api/publisher/profile', {
            method: 'GET',
        }),

    updateProfile: (data) =>
        apiRequest('/api/publisher/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    changePassword: (currentPassword, newPassword) =>
        apiRequest('/api/publisher/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        }),

    requestPasswordOtp: () =>
        apiRequest('/api/publisher/change-password/request-otp', {
            method: 'POST',
        }),

    verifyPasswordOtp: (otp) =>
        apiRequest('/api/publisher/change-password/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ otp }),
        }),

    resetPasswordWithOtp: (newPassword) =>
        apiRequest('/api/publisher/change-password/reset', {
            method: 'POST',
            body: JSON.stringify({ newPassword }),
        }),
};
