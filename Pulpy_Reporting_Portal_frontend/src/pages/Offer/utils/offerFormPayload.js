/**
 * Maps offer form state to API payload (shared by create + update).
 */

import { buildListTargetingPayload, parseListTargetingField } from './offerFormTargeting.js';

export const RESERVED_OFFER_PARAM_KEYS = new Set([
    'offer_id',
    'oid',
    'pub_id',
    'a',
    'publisher_id',
    'click_id',
    'clickid',
    'tid',
    'rcid',
    'sub',
    'm',
    'token',
    'auth',
]);

export function emptyOfferParamRow() {
    return { param_key: '', is_required: false, default_value: '' };
}

export function normalizeOfferParamsForApi(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((p) => ({
            param_key: String(p.param_key || '').trim(),
            is_required: Boolean(p.is_required),
            default_value:
                p.default_value != null && String(p.default_value).trim() !== ''
                    ? String(p.default_value).trim()
                    : null,
        }))
        .filter((p) => p.param_key);
}

export function validateOfferParamsClient(rows) {
    const seen = new Set();
    for (const row of rows) {
        const key = String(row.param_key || '').trim();
        if (!key) continue;
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
            return `Parameter "${key}" must start with a letter and use only letters, numbers, underscore`;
        }
        if (RESERVED_OFFER_PARAM_KEYS.has(key.toLowerCase())) {
            return `"${key}" is reserved for platform tracking — choose another name`;
        }
        const lower = key.toLowerCase();
        if (seen.has(lower)) {
            return `Duplicate parameter name: ${key}`;
        }
        seen.add(lower);
    }
    return null;
}

export function mapOfferParamsFromOffer(offer) {
    if (Array.isArray(offer?.offer_params) && offer.offer_params.length > 0) {
        return offer.offer_params.map((p) => ({
            param_key: p.param_key || '',
            is_required: Boolean(p.is_required === 1 || p.is_required === true),
            default_value: p.default_value ?? '',
        }));
    }
    return [emptyOfferParamRow()];
}

/** Empty time fields → null in API (24/7, no IST window on clicks/postbacks). */
export function normalizeScheduleTimeForApi(value) {
    if (value == null) return null;
    const s = String(value).trim();
    return s === '' ? null : s;
}

/** For <input type="time"> — null/empty stays blank; DB TIME values normalized to HH:MM:SS. */
export function formatScheduleTimeForForm(value) {
    if (value == null || String(value).trim() === '') return '';
    const raw = String(value).trim();
    const parts = raw.split(':');
    if (parts.length < 2) return raw;
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const sec = (parts[2] || '00').split('.')[0].padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

/** Detail page label for start/end time (IST). */
export function formatScheduleTimeForDisplay(value) {
    if (value == null || String(value).trim() === '') return null;
    return formatScheduleTimeForForm(value).slice(0, 8);
}

export function buildOfferPayload(formData, { showCustomCategory = false, offerParams = [] } = {}) {
    const finalCategory = showCustomCategory ? formData.custom_category : formData.category;
    const start_time = normalizeScheduleTimeForApi(formData.start_time);
    const end_time = normalizeScheduleTimeForApi(formData.end_time);

    return {
        advertiser_id: parseInt(formData.advertiser_id, 10),
        name: formData.name,
        offer_currency: formData.offer_currency,
        country: formData.country,
        timezone: formData.timezone,
        advertiser_model: formData.advertiser_model,
        advertiser_amount: parseFloat(formData.advertiser_amount),
        affiliate_model: formData.affiliate_model,
        affiliate_amount: parseFloat(formData.affiliate_amount),
        offer_url: formData.offer_url,
        description: formData.description,
        category: finalCategory,
        status: String(formData.status).toLowerCase(),
        offer_visibility: formData.offer_visibility,
        preview_url: formData.preview_url || null,
        billing_flow: formData.billing_flow || null,
        carrier_name: (formData.carrier_name && String(formData.carrier_name).trim()) || null,
        billing_type: formData.billing_type || null,
        token_type: formData.token_type || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        start_time,
        end_time,
        ip_action: formData.ip_action.toLowerCase(),
        ip_list: formData.ip_list || null,
        country_action: formData.country_action ? formData.country_action.toLowerCase() : 'allow',
        country_list: formData.country_list || null,
        device_action: formData.device_action ? formData.device_action.toLowerCase() : 'allow',
        device_targeting_json:
            formData.device_targeting?.length > 0
                ? JSON.stringify({ device: formData.device_targeting })
                : null,
        os_action: formData.os_action ? formData.os_action.toLowerCase() : 'allow',
        os_targeting_json:
            formData.os_targeting?.length > 0
                ? JSON.stringify({ os: formData.os_targeting })
                : null,
        browser_action: formData.browser_action ? formData.browser_action.toLowerCase() : 'allow',
        browser_targeting_json:
            formData.browser_targeting?.length > 0
                ? JSON.stringify({ browser: formData.browser_targeting })
                : null,
        isp_targeting_json: buildListTargetingPayload(formData.isp_action, formData.isp_list),
        carrier_targeting_json: buildListTargetingPayload(formData.carrier_action, formData.carrier_list),
        city_targeting_json: buildListTargetingPayload(formData.city_action, formData.city_list),
        capping_type: formData.capping_type,
        capping_duration: formData.capping_duration,
        capping_action: formData.capping_action,
        capping_amount:
            formData.capping_type !== 'none' &&
            formData.capping_amount !== '' &&
            formData.capping_amount != null
                ? parseFloat(formData.capping_amount)
                : null,
        fallback_type: formData.fallback_type,
        fallback_url: formData.fallback_url || null,
        fallback_offer_id: formData.fallback_offer_id
            ? parseInt(formData.fallback_offer_id, 10)
            : null,
        fallback_enabled: formData.capping_action === 'fallback' ? 1 : 0,
        offer_params: normalizeOfferParamsForApi(offerParams),
    };
}

export function mapOfferToFormData(offer, routeId) {
    const deviceTargeting = offer.device_targeting_json
        ? typeof offer.device_targeting_json === 'string'
            ? JSON.parse(offer.device_targeting_json)
            : offer.device_targeting_json
        : {};
    const osTargeting = offer.os_targeting_json
        ? typeof offer.os_targeting_json === 'string'
            ? JSON.parse(offer.os_targeting_json)
            : offer.os_targeting_json
        : {};
    const browserTargeting = offer.browser_targeting_json
        ? typeof offer.browser_targeting_json === 'string'
            ? JSON.parse(offer.browser_targeting_json)
            : offer.browser_targeting_json
        : {};
    const ispParsed = parseListTargetingField(offer.isp_targeting_json, 'isps');
    const carrierParsed = parseListTargetingField(offer.carrier_targeting_json, 'carriers');
    const cityParsed = parseListTargetingField(offer.city_targeting_json, 'cities');

    return {
        offerId: routeId ? `o${String(routeId).padStart(4, '0')}` : '',
        advertiser_id: offer.advertiser_id?.toString() || '',
        name: offer.name || '',
        offer_currency: offer.offer_currency || 'USD',
        country: offer.country || 'US',
        timezone: offer.timezone || '(GMT+05:30) Mumbai, Chennai, Kolkata',
        advertiser_model: offer.advertiser_model || 'CPA',
        advertiser_amount: offer.advertiser_amount ?? '',
        affiliate_model: offer.affiliate_model || 'CPA',
        affiliate_amount: offer.affiliate_amount ?? '',
        offer_url: offer.offer_url || '',
        description: offer.description || '',
        category: offer.category || '',
        custom_category: '',
        status: offer.status || 'draft',
        offer_visibility: offer.offer_visibility || 'PUBLIC',
        preview_url: offer.preview_url || '',
        billing_flow: offer.billing_flow || '',
        carrier_name: offer.carrier_name || '',
        billing_type: offer.billing_type || '',
        token_type: offer.token_type || '',
        start_date: offer.start_date ? offer.start_date.split('T')[0] : '',
        start_time: formatScheduleTimeForForm(offer.start_time),
        end_date: offer.end_date ? offer.end_date.split('T')[0] : '',
        end_time: formatScheduleTimeForForm(offer.end_time),
        ip_action: offer.ip_action?.toUpperCase() || 'ALLOW',
        ip_list: offer.ip_list || '',
        country_action: offer.country_action?.toUpperCase() || 'ALLOW',
        country_list: offer.country_list || '',
        browser_action: offer.browser_action?.toUpperCase() || 'ALLOW',
        browser_targeting: browserTargeting.browser || [],
        device_action: offer.device_action?.toUpperCase() || 'ALLOW',
        device_targeting: deviceTargeting.device || [],
        os_action: offer.os_action?.toUpperCase() || 'ALLOW',
        os_targeting: osTargeting.os || [],
        isp_action: ispParsed.action,
        isp_list: ispParsed.list,
        carrier_action: carrierParsed.action,
        carrier_list: carrierParsed.list,
        city_action: cityParsed.action,
        city_list: cityParsed.list,
        capping_type: offer.capping_type || 'none',
        capping_duration: offer.capping_duration || 'daily',
        capping_action: offer.capping_action || 'stop',
        capping_amount:
            offer.capping_type === 'budget'
                ? offer.budget_cap != null && offer.budget_cap !== ''
                    ? offer.budget_cap
                    : ''
                : offer.capping_type === 'conversion'
                  ? offer.conversion_cap != null && offer.conversion_cap !== ''
                      ? offer.conversion_cap
                      : ''
                  : '',
        fallback_type: offer.fallback_type || 'offer',
        fallback_url: offer.fallback_url || '',
        fallback_offer_id: offer.fallback_offer_id?.toString() || '',
    };
}
