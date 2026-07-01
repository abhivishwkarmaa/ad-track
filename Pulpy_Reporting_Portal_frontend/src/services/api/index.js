export { apiRequest, BASE_URL, setAccessToken, clearAccessToken, getAccessToken, refreshAccessToken } from './http.js';
export { authAPI } from './auth.api.js';
export { dashboardAPI } from './dashboard.api.js';
export { subscriptionAPI, adminSubscriptionAPI } from './subscription.api.js';
export { offersAPI } from './offers.api.js';
export { publishersAPI } from './publishers.api.js';
export { advertisersAPI } from './advertisers.api.js';
export { assignmentsAPI } from './assignments.api.js';
export { tenantsAPI } from './tenants.api.js';
export { contactSubmissionsAPI } from './contact.api.js';

import { authAPI } from './auth.api.js';
import { dashboardAPI } from './dashboard.api.js';
import { subscriptionAPI, adminSubscriptionAPI } from './subscription.api.js';
import { offersAPI } from './offers.api.js';
import { publishersAPI } from './publishers.api.js';
import { advertisersAPI } from './advertisers.api.js';
import { assignmentsAPI } from './assignments.api.js';
import { tenantsAPI } from './tenants.api.js';
import { contactSubmissionsAPI } from './contact.api.js';

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
