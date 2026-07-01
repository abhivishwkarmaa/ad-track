import { apiRequest, BASE_URL, getAccessToken, refreshAccessToken, setAccessToken } from './http.js';

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
