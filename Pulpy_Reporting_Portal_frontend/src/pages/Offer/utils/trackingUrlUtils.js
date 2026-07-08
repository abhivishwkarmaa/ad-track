/**
 * Normalize tracking URL API payload for UI components.
 */
export function normalizeTrackingUrlMeta(data) {
    if (!data) {
        return { tracking_url: '', offer_params: [], required_params: [] };
    }
    if (typeof data === 'string') {
        return { tracking_url: data, offer_params: [], required_params: [] };
    }
    return {
        tracking_url: data.tracking_url ?? '',
        offer_params: Array.isArray(data.offer_params) ? data.offer_params : [],
        required_params: Array.isArray(data.required_params) ? data.required_params : [],
    };
}

export function getTrackingUrlString(meta) {
    return normalizeTrackingUrlMeta(meta).tracking_url;
}
