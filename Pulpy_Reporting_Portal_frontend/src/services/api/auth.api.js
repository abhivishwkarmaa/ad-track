import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

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
