/**
 * API barrel — backward-compatible re-exports from domain modules.
 * @see services/api/
 */
export {
    apiRequest,
    BASE_URL,
    setAccessToken,
    clearAccessToken,
    getAccessToken,
    refreshAccessToken,
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
    logsAPI,
} from './api/index.js';

export { default } from './api/index.js';
