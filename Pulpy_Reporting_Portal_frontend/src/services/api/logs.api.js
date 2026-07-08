import { apiRequest } from './http.js';

export const logsAPI = {
    getClickDetail: async (clickUuid, requestOptions = {}) => {
        return apiRequest(
            `/api/admin/reports/clicks/${encodeURIComponent(clickUuid)}`,
            requestOptions
        );
    },
    getConversionDetail: async (conversionUuid, requestOptions = {}) => {
        return apiRequest(
            `/api/admin/reports/conversions/${encodeURIComponent(conversionUuid)}`,
            requestOptions
        );
    },
};
