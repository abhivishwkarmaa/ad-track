import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

// Assignments API
export const assignmentsAPI = {
    getAssignments: async (params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/api/admin/assignments?${queryString}`, requestOptions);
    },
    getAssignment: async (id, requestOptions = {}) => {
        return apiRequest(`/api/admin/assignments/${id}`, requestOptions);
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
    getTrackingUrl: async (id, params = {}, requestOptions = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(
            `/api/admin/assignments/${id}/tracking-url${queryString ? `?${queryString}` : ''}`,
            requestOptions
        );
    },
    deleteAssignment: async (id) => {
        return apiRequest(`/api/admin/assignments/${id}`, {
            method: 'DELETE',
        });
    },
};
