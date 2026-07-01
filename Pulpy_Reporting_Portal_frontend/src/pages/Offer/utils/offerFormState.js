/** Default schedule dates for new offers. */
export function getDefaultDates() {
    const now = new Date();
    const startDate = now.toISOString().split('T')[0];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const startTime = `${hours}:${minutes}:${seconds}`;
    const endDateObj = new Date(now);
    endDateObj.setFullYear(endDateObj.getFullYear() + 5);
    const endDate = endDateObj.toISOString().split('T')[0];
    return { startDate, startTime, endDate, endTime: startTime };
}

export function createEmptyOfferFormData() {
    const defaultDates = getDefaultDates();
    return {
        advertiser_id: '',
        name: '',
        offer_currency: 'USD',
        country: 'US',
        timezone: '(GMT+05:30) Mumbai, Chennai, Kolkata',
        advertiser_model: 'CPA',
        advertiser_amount: '',
        affiliate_model: 'CPA',
        affiliate_amount: '',
        offer_url: '',
        description: '',
        category: '',
        custom_category: '',
        status: 'live',
        offer_visibility: 'PUBLIC',
        preview_url: '',
        billing_flow: '',
        carrier_name: '',
        billing_type: '',
        token_type: '',
        start_date: defaultDates.startDate,
        start_time: defaultDates.startTime,
        end_date: defaultDates.endDate,
        end_time: defaultDates.endTime,
        capping_type: 'none',
        capping_duration: 'daily',
        capping_amount: '',
        capping_action: 'stop',
        fallback_type: 'offer',
        fallback_url: '',
        fallback_offer_id: '',
        ip_action: 'ALLOW',
        ip_list: '',
        country_action: 'ALLOW',
        country_list: '',
        browser_action: 'ALLOW',
        browser_targeting: [],
        device_action: 'ALLOW',
        device_targeting: [],
        os_action: 'ALLOW',
        os_targeting: [],
    };
}

export const DEFAULT_TOKEN_MAPPINGS = [
    { id: 0, enabled: false, advertiserParam: 'aff_sub', platformToken: '{row-useragent}' },
    { id: 1, enabled: false, advertiserParam: 'aff_sub', platformToken: '{ip}' },
    { id: 2, enabled: false, advertiserParam: 'aff_sub3', platformToken: '{offerid}' },
    { id: 3, enabled: false, advertiserParam: 'aff_sub4', platformToken: '{useragent}' },
    { id: 4, enabled: false, advertiserParam: 'aff_sub5', platformToken: '{row-useragent}' },
];
