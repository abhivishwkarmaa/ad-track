import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
    useOfferDetail,
    useOffersList,
    useUpdateOffer,
} from '../../hooks/queries/useOffersQuery';
import { useAdvertisersList } from '../../hooks/queries/useAdvertisersQuery';
import { usePublishersList } from '../../hooks/queries/usePublishersQuery';
import { useAssignmentsList } from '../../hooks/queries/useAssignmentsQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import { copyToClipboard as safeCopyToClipboard } from '../../utils/clipboard';
import { OFFER_COUNTRIES } from '../../utils/countries';
import './Offer.css';

// Country and Currency data - matching HTML

const currencies = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'AED'];

const timeZones = [
    '(GMT-12:00) International Date Line West',
    '(GMT-11:00) Midway Island, Samoa',
    '(GMT-10:00) Hawaii',
    '(GMT-09:00) Alaska',
    '(GMT-08:00) Pacific Time (US & Canada)',
    '(GMT-07:00) Mountain Time (US & Canada)',
    '(GMT-06:00) Central Time (US & Canada)',
    '(GMT-05:00) Eastern Time (US & Canada)',
    '(GMT-04:00) Atlantic Time (Canada)',
    '(GMT-03:00) Buenos Aires, Georgetown',
    '(GMT+00:00) London, Dublin, Lisbon',
    '(GMT+01:00) Paris, Berlin, Rome',
    '(GMT+02:00) Cairo, Athens, Istanbul',
    '(GMT+03:00) Moscow, Kuwait, Riyadh',
    '(GMT+04:00) Dubai, Abu Dhabi',
    '(GMT+05:00) Islamabad, Karachi',
    '(GMT+05:30) Mumbai, Chennai, Kolkata',
    '(GMT+06:00) Dhaka, Almaty',
    '(GMT+07:00) Bangkok, Hanoi, Jakarta',
    '(GMT+08:00) Beijing, Hong Kong, Singapore',
    '(GMT+09:00) Tokyo, Seoul, Osaka',
    '(GMT+10:00) Sydney, Melbourne',
    '(GMT+12:00) Auckland, Wellington'
];

const categories = [
    'Shopping',
    'E-commerce',
    'Finance',
    'Gaming',
    'Health & Fitness',
    'Travel',
    'Mobile',
    'Retail',
    'Entertainment',
    'Education',
    'Technology'
];

// Revenue models - matching HTML
const revenueModels = ['CPA', 'CPC', 'CPL', 'CPI', 'CPS', 'CPM'];

// Browsers - EXACTLY matching HTML
const browsers = [
    'All',
    'Chrome',
    'Dolfin',
    'Opera',
    'Skyfire',
    'Edge',
    'IE',
    'Firefox',
    'Bolt',
    'TeaShark',
    'Blazer',
    'Safari',
    'WeChat',
    'UCBrowser',
    'baiduboxapp',
    'baidubrowser',
    'DiigoBrowser',
    'Mercury',
    'ObigoBrowser',
    'NetFront',
    'GenericBrowser',
    'PaleMoon',
    'Others'
];

// Devices - EXACTLY matching HTML (matching NewOffer.jsx)
const devices = [
    'All',
    'Desktop',
    'Smartphone',
    'Tablet',
    'Feature Phone',
    'Console',
    'Tv',
    'Car Browser',
    'Smart Display',
    'Camera',
    'Portable Media Player',
    'Phablet',
    'Unsolved'
];

// OS - EXACTLY matching HTML (matching NewOffer.jsx)
const osList = [
    'All',
    'Android',
    'blackberry',
    'PalmOS',
    'Symbian',
    'Windows',
    'IOS',
    'MeeGo',
    'Maemo',
    'J2ME',
    'webOS',
    'Bada',
    'BREW',
    'Others'
];

// Token types - matching NewOffer.jsx
const tokenTypes = ['hasoffers', 'affise'];

const billingFlows = [
    'Preview Link',
    'Billing Flow: Give Option',
    '1click',
    '2click',
    '3 click',
    'OTP',
    'HE+OTP',
    'Captcha',
    'SMS',
    'DOI'
];

const billingTypes = [
    'Billable',
    'Non billable'
];

// Advertiser Parameters - matching NewOffer.jsx
const advertiserParameters = [
    'aff_sub',
    'aff_sub2',
    'aff_sub3',
    'aff_sub4',
    'aff_sub5',
    'aff_unique1',
    'aff_unique2',
    'aff_unique3',
    'aff_unique4',
    'aff_unique5',
    'source',
    'aff_click_id',
    'google_aid',
    'ios_ifa',
    'unid',
    'user_id'
];

// Platform Tokens - matching NewOffer.jsx
const platformTokens = [
    '{tid}',
    '{ip}',
    '{offerid}',
    '{useragent}',
    '{row-useragent}',
    '{aff_id}',
    '{adv_id}',
    '{country}',
    '{timestamp}',
    '{aff_sub1}',
    '{aff_sub2}',
    '{aff_sub3}',
    '{aff_sub4}',
    '{aff_sub5}',
    '{deviceid}',
    '{source}',
    '{googleaid}',
    '{androidid}',
    '{iosidfa}',
    '{random}'
];

// Available tokens for destination URL
const availableTokens = [
    'RCID',
    'Aff Sub1',
    'Aff Sub2',
    'Aff Sub3',
    'Aff Sub4',
    'Aff Sub5',
    'Aff Click ID',
    'Sub Aff ID',
    'Google AID',
    'Device ID',
    'Android ID',
    'IOS ID FA',
    'Source'
];

// Icons
const ChevronIcon = ({ isOpen }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
);

const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
);

const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
);

// Collapsible Section Component
function CollapsibleSection({ title, isOpen, onToggle, children, badge }) {
    return (
        <div className="collapsible-section">
            <div className="collapsible-header" onClick={onToggle}>
                <div className="collapsible-title">
                    <h3>{title}</h3>
                    {badge && <span className="section-badge">{badge}</span>}
                </div>
                <span className="collapsible-icon">
                    <ChevronIcon isOpen={isOpen} />
                </span>
            </div>
            {isOpen && <div className="collapsible-content">{children}</div>}
        </div>
    );
}

function EditOffer() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const updateOfferMutation = useUpdateOffer();
    const [loading, setLoading] = useState(false);
    const [publisherAssignments, setPublisherAssignments] = useState([]);
    const [showCustomCategory, setShowCustomCategory] = useState(false);
    const [showCustomCountry, setShowCustomCountry] = useState(false);
    const [showTokenTable, setShowTokenTable] = useState(false);
    const [showMacrosInfo, setShowMacrosInfo] = useState(false);
    const [tokenMappings, setTokenMappings] = useState([]);

    const { data: offer, isLoading: loadingOffer, error: offerError } = useOfferDetail(id);
    const { data: advertisersResult, isLoading: loadingAdvertisers } = useAdvertisersList({ status: 'active', limit: 100 });
    const { data: publishersResult, isLoading: loadingPublishers } = usePublishersList({ status: 'active', limit: 100 });
    const { data: offersResult, isLoading: loadingOffers } = useOffersList({ limit: 1000 });
    const { data: assignmentsResult, isLoading: loadingAssignments } = useAssignmentsList(
        { offer_id: id },
        { enabled: Boolean(id) }
    );

    const advertisers = advertisersResult?.data ?? [];
    const publishers = publishersResult?.data ?? [];
    const assignments = assignmentsResult?.data ?? [];
    const offers = useMemo(() => {
        const allOffers = offersResult?.data ?? [];
        return allOffers.filter((o) => {
            const publicId = o.public_offer_id ?? o.display_id ?? o.id;
            return String(publicId) !== String(id);
        });
    }, [offersResult?.data, id]);

    // Section states - matching original website
    const [openSections, setOpenSections] = useState({
        offerInfo: true,
        offerUrl: true,
        targeting: true,
        capping: true,
        fallback: true,
        advertiserPostback: true,
        affiliates: true,
        postback: true
    });

    // Form data - matching NewOffer.jsx structure exactly
    const [formData, setFormData] = useState({
        offerId: '',
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
        start_date: '',
        start_time: '00:00:00',
        end_date: '',
        end_time: '23:59:59',
        // Capping (Unified)
        capping_type: 'none', // none, budget, conversion
        capping_duration: 'daily', // daily, weekly, monthly
        capping_amount: '',
        capping_action: 'stop', // stop, reject, fallback

        // Fallback
        fallback_type: 'offer', // offer, custom
        fallback_url: '',
        fallback_offer_id: ''
    });

    useEffect(() => {
        if (!assignments.length) {
            setPublisherAssignments([]);
            return;
        }

        const initialAssignments = assignments.map((assignment) => ({
            publisher_id: assignment.publisher_id,
            publisher_email: assignment.publisher_email,
            payout_override: assignment.payout_override || '',
            conversion_approval_percentage: assignment.conversion_approval_percentage || '',
            capping_budget: assignment.capping_budget || { duration: 'day', amount: '' },
            capping_conversions: assignment.capping_conversions || { duration: 'day', amount: '' },
            callback_url: assignment.callback_url || '',
            offer_url: assignment.offer_url || '',
            notes: assignment.notes || '',
            status: assignment.status || 'active',
            assignment_id: assignment.id,
            tracking_url: '',
            selectedTokens: [],
        }));
        setPublisherAssignments(initialAssignments);
    }, [assignments]);

    useEffect(() => {
        if (offerError) {
            toast.error('Failed to load offer');
            navigate('/offer/list');
        }
    }, [offerError, navigate, toast]);

    useEffect(() => {
        if (!offer) return;

        const deviceTargeting = offer.device_targeting_json
            ? (typeof offer.device_targeting_json === 'string' ? JSON.parse(offer.device_targeting_json) : offer.device_targeting_json)
            : {};
        const osTargeting = offer.os_targeting_json
            ? (typeof offer.os_targeting_json === 'string' ? JSON.parse(offer.os_targeting_json) : offer.os_targeting_json)
            : {};
        const browserTargeting = offer.browser_targeting_json
            ? (typeof offer.browser_targeting_json === 'string' ? JSON.parse(offer.browser_targeting_json) : offer.browser_targeting_json)
            : {};

        setFormData((prev) => ({
            ...prev,
            offerId: `o${String(id).padStart(4, '0')}`,
            name: offer.name || '',
            description: offer.description || '',
            offer_currency: offer.offer_currency || 'USD',
            country: offer.country || 'US',
            timezone: offer.timezone || '(GMT+05:30) Mumbai, Chennai, Kolkata',
            advertiser_id: offer.advertiser_id?.toString() || '',
            category: offer.category || '',
            advertiser_model: offer.advertiser_model || 'CPA',
            advertiser_amount: offer.advertiser_amount || '',
            affiliate_model: offer.affiliate_model || 'CPA',
            affiliate_amount: offer.affiliate_amount || '',
            offer_url: offer.offer_url || '',
            preview_url: offer.preview_url || '',
            billing_flow: offer.billing_flow || '',
            carrier_name: offer.carrier_name || '',
            billing_type: offer.billing_type || '',
            token_type: offer.token_type || '',
            offer_visibility: offer.offer_visibility || 'PUBLIC',
            status: offer.status || 'draft',
            start_date: offer.start_date ? offer.start_date.split('T')[0] : '',
            start_time: offer.start_time || '00:00:00',
            end_date: offer.end_date ? offer.end_date.split('T')[0] : '',
            end_time: offer.end_time || '23:59:59',
            ip_action: offer.ip_action?.toUpperCase() || 'ALLOW',
            ip_list: offer.ip_list || '',
            country_action: offer.country_action?.toUpperCase() || 'ALLOW',
            country_list: offer.country_list || '',
            device_targeting: deviceTargeting.device || [],
            os_targeting: osTargeting.os || [],
            browser_targeting: browserTargeting.browser || [],
            device_action: offer.device_action?.toUpperCase() || 'ALLOW',
            os_action: offer.os_action?.toUpperCase() || 'ALLOW',
            browser_action: offer.browser_action?.toUpperCase() || 'ALLOW',
            capping_type: offer.capping_type || 'none',
            capping_duration: offer.capping_duration || 'daily',
            capping_action: offer.capping_action || 'stop',
            capping_amount: offer.capping_type === 'budget'
                ? (offer.budget_cap != null && offer.budget_cap !== '' ? offer.budget_cap : '')
                : offer.capping_type === 'conversion'
                    ? (offer.conversion_cap != null && offer.conversion_cap !== '' ? offer.conversion_cap : '')
                    : '',
            fallback_type: offer.fallback_type || 'offer',
            fallback_url: offer.fallback_url || '',
            fallback_offer_id: offer.fallback_offer_id?.toString() || '',
            fallback_enabled: (offer.capping_action === 'fallback' || offer.fallback_enabled) ? 1 : 0,
            fallbackType: offer.fallback_url ? 'url' : (offer.fallback_offer_id ? 'offer' : 'url'),
            globalCapping: 'none',
            globalCappingValue: '',
            globalCappingPeriod: 'Daily',
            affiliateCapping: 'none',
            affiliateCappingValue: '',
            affiliateCappingPeriod: 'Daily',
            dailyClickCap: offer.daily_cap || '',
            dailyConversionCap: offer.conversion_cap || '',
            totalClickCap: offer.total_cap || '',
            totalConversionCap: '',
            sendEmailOnCap: false,
            capEmailRecipients: '',
            advertiserPostbackEnabled: !!(offer.advertiser_postback_url),
            advertiserPostbackUrl: offer.advertiser_postback_url || '',
            advertiserPostbackMethod: offer.advertiser_postback_method || 'GET',
            advertiserPostbackEvents: ['conversion'],
            globalPostbackUrl: offer.system_postback_url || '',
            postbackMethod: offer.system_postback_method || 'GET',
            postbackEvents: ['conversion'],
        }));

        const isStandardCountry = OFFER_COUNTRIES.some((c) => c.code === (offer.country || 'US'));
        if (!isStandardCountry && offer.country) {
            setShowCustomCountry(true);
        }
    }, [offer, id]);

    const toggleSection = (section) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else if (type === 'select-multiple') {
            const selectedValues = Array.from(e.target.selectedOptions, option => option.value);
            setFormData(prev => ({ ...prev, [name]: selectedValues }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
            // Show token table when token type is selected
            if (name === 'token_type' && value) {
                setShowTokenTable(true);
                // Initialize with default mappings if empty
                if (tokenMappings.length === 0) {
                    const defaultMappings = [
                        { id: 0, enabled: false, advertiserParam: 'aff_sub', platformToken: '{row-useragent}' },
                        { id: 1, enabled: false, advertiserParam: 'aff_sub', platformToken: '{ip}' },
                        { id: 2, enabled: false, advertiserParam: 'aff_sub3', platformToken: '{offerid}' },
                        { id: 3, enabled: false, advertiserParam: 'aff_sub4', platformToken: '{useragent}' },
                        { id: 4, enabled: false, advertiserParam: 'aff_sub5', platformToken: '{row-useragent}' }
                    ];
                    setTokenMappings(defaultMappings);
                }
            } else if (name === 'token_type' && !value) {
                setShowTokenTable(false);
            }
        }
    };

    const handleArrayToggle = (field, value) => {
        setFormData(prev => {
            const currentArray = prev[field] || [];
            return {
                ...prev,
                [field]: currentArray.includes(value)
                    ? currentArray.filter(v => v !== value)
                    : [...currentArray, value]
            };
        });
    };

    const copyToClipboard = async (text) => {
        const result = await safeCopyToClipboard(text);
        if (result.success) {
            toast.success('Copied to clipboard!');
        } else {
            toast.error(result.error || 'Failed to copy to clipboard');
        }
    };

    // 🔒 DEPRECATED: Tracking URLs are generated by backend only
    // Frontend should NEVER generate tracking URLs - they must come from backend API
    // Backend generates URLs with tenant subdomain (e.g., tenant1.domain.com/click)
    // This function is kept for backward compatibility but should not be used
    // Use assignmentsAPI.getTrackingUrl(assignmentId) instead
    const generateTrackingUrl = () => {
        toast.error('Tracking URLs must be generated by the backend. Use the "Get Tracking URL" button instead.');
        console.warn('⚠️ generateTrackingUrl() is deprecated. Tracking URLs should be fetched from backend API.');
    };

    const handleTokenMappingChange = (id, field, value) => {
        setTokenMappings(prev =>
            prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
        );
    };

    const handleTestOfferLink = () => {
        const urlToTest = formData.preview_url || formData.offer_url;
        if (urlToTest) {
            window.open(urlToTest, '_blank');
        } else {
            toast.error('Please enter an Offer URL first');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!formData.name) {
                toast.error('Offer name is required');
                setLoading(false);
                return;
            }

            // Format the data for API - matching NewOffer.jsx exactly
            const finalCategory = showCustomCategory ? formData.custom_category : formData.category;

            const offerData = {
                advertiser_id: parseInt(formData.advertiser_id),
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
                status: formData.status.toLowerCase(),
                offer_visibility: formData.offer_visibility,
                preview_url: formData.preview_url || null,
                billing_flow: formData.billing_flow || null,
                carrier_name: (formData.carrier_name && String(formData.carrier_name).trim()) || null,
                billing_type: formData.billing_type || null,
                token_type: formData.token_type || null,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                start_time: formData.start_time || null,
                end_time: formData.end_time || null,
                // IP Targeting
                ip_action: formData.ip_action.toLowerCase(),
                ip_list: formData.ip_list || null,
                // Country Targeting
                country_action: formData.country_action ? formData.country_action.toLowerCase() : 'allow',
                country_list: formData.country_list || null,
                // Device Targeting
                device_action: formData.device_action ? formData.device_action.toLowerCase() : 'allow',
                device_targeting_json: formData.device_targeting && formData.device_targeting.length > 0
                    ? JSON.stringify({ device: formData.device_targeting })
                    : null,
                // OS Targeting
                os_action: formData.os_action ? formData.os_action.toLowerCase() : 'allow',
                os_targeting_json: formData.os_targeting && formData.os_targeting.length > 0
                    ? JSON.stringify({ os: formData.os_targeting })
                    : null,
                // Browser Targeting
                browser_action: formData.browser_action ? formData.browser_action.toLowerCase() : 'allow',
                browser_targeting_json: formData.browser_targeting && formData.browser_targeting.length > 0
                    ? JSON.stringify({ browser: formData.browser_targeting })
                    : null,
                // Capping
                capping_type: formData.capping_type,
                capping_duration: formData.capping_duration,
                capping_action: formData.capping_action,
                capping_amount: formData.capping_type !== 'none' && formData.capping_amount !== '' && formData.capping_amount != null
                    ? parseFloat(formData.capping_amount)
                    : null,

                // Fallback
                fallback_type: formData.fallback_type,
                fallback_url: formData.fallback_url || null,
                fallback_offer_id: formData.fallback_offer_id ? parseInt(formData.fallback_offer_id) : null,
                fallback_enabled: formData.capping_action === 'fallback' ? 1 : 0 // Auto-enable if action is fallback
            };

            await updateOfferMutation.mutateAsync({ id, data: offerData });
            toast.success('Offer updated successfully!');
            navigate('/offer/list');
        } catch (error) {
            console.error('Error updating offer:', error);
            toast.error(error.message || 'Failed to update offer');
        } finally {
            setLoading(false);
        }
    };

    // Scroll to section helper
    const goToElement = (sectionId) => {
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    if (loadingOffer) {
        return (
            <div className="offer-page">
                <SkeletonDetail sections={4} />
            </div>
        );
    }

    return (
        <div className="offer-page">
            <div className="offer-header">
                <div className="offer-header-left">
                    <h1>Edit Offer</h1>
                    <p>Update offer details and settings</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="offer-form-container">
                    <div className="offer-form-header">
                        <h2>Offer Details</h2>
                        <p>Update the details below to modify the offer</p>
                    </div>

                    {/* Basic Information */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">Basic Information</h3>
                        <div className="offer-form-row">
                            <div className="form-group">
                                <label className="form-label required">Offer Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Enter offer name"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-control"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder="Enter the campaign description"
                                    rows="2"
                                />
                            </div>
                        </div>

                        <div className="offer-form-row three-col">
                            <div className="form-group">
                                <label className="form-label">Offer Currency</label>
                                <select
                                    className="form-control"
                                    name="offer_currency"
                                    value={formData.offer_currency}
                                    onChange={handleChange}
                                >
                                    {currencies.map(curr => (
                                        <option key={curr} value={curr}>{curr}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Country</label>
                                {!showCustomCountry ? (
                                    <select
                                        className="form-control"
                                        name="country"
                                        value={formData.country}
                                        onChange={(e) => {
                                            if (e.target.value === 'CUSTOM') {
                                                setShowCustomCountry(true);
                                                setFormData(prev => ({ ...prev, country: '' }));
                                            } else {
                                                setFormData(prev => ({ ...prev, country: e.target.value }));
                                            }
                                        }}
                                    >
                                        {OFFER_COUNTRIES.map(country => (
                                            <option key={country.code} value={country.code}>{country.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="country"
                                            value={formData.country}
                                            onChange={handleChange}
                                            placeholder="Enter country"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setShowCustomCountry(false);
                                                setFormData(prev => ({ ...prev, country: 'US' }));
                                            }}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="form-label">Time Zone</label>
                                <select
                                    className="form-control"
                                    name="timezone"
                                    value={formData.timezone}
                                    onChange={handleChange}
                                >
                                    {timeZones.map(tz => (
                                        <option key={tz} value={tz}>{tz}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="offer-form-row three-col">
                            <div className="form-group">
                                <label className="form-label required">Advertiser</label>
                                <select
                                    className="form-control"
                                    name="advertiser_id"
                                    value={formData.advertiser_id}
                                    onChange={handleChange}
                                    required
                                    disabled={loadingAdvertisers}
                                >
                                    <option value="">
                                        {loadingAdvertisers ? 'Loading advertisers...' : 'Select Advertiser'}
                                    </option>
                                    {advertisers.map(advertiser => (
                                        <option key={advertiser.id} value={advertiser.id}>
                                            {advertiser.name} {advertiser.company_name ? `(${advertiser.company_name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                {!showCustomCategory ? (
                                    <select
                                        className="form-control"
                                        name="category"
                                        value={formData.category}
                                        onChange={(e) => {
                                            if (e.target.value === '__custom__') {
                                                setShowCustomCategory(true);
                                                setFormData(prev => ({ ...prev, category: '', custom_category: '' }));
                                            } else {
                                                setFormData(prev => ({ ...prev, category: e.target.value, custom_category: '' }));
                                            }
                                        }}
                                    >
                                        <option value="">Select Category</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        <option value="__custom__">+ Add Custom Category</option>
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="custom_category"
                                            value={formData.custom_category}
                                            onChange={handleChange}
                                            placeholder="Enter custom category"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setShowCustomCategory(false);
                                                setFormData(prev => ({ ...prev, custom_category: '' }));
                                            }}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="form-label">Offer Visibility</label>
                                <select
                                    className="form-control"
                                    name="offer_visibility"
                                    value={formData.offer_visibility}
                                    onChange={handleChange}
                                >
                                    <option value="PUBLIC">Public</option>
                                    <option value="PUBLICREQUIREAPPROVAL">Public Require Approval</option>
                                    <option value="PRIVATE">Private</option>
                                </select>
                            </div>
                        </div>

                        <div className="offer-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Billing Flow</label>
                                <select
                                    className="form-control"
                                    name="billing_flow"
                                    value={formData.billing_flow}
                                    onChange={handleChange}
                                >
                                    <option value="">Select Billing Flow</option>
                                    {billingFlows.map(flow => (
                                        <option key={flow} value={flow}>{flow}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Billing Type</label>
                                <select
                                    className="form-control"
                                    name="billing_type"
                                    value={formData.billing_type}
                                    onChange={handleChange}
                                >
                                    <option value="">Select Billing Type</option>
                                    {billingTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group">
                                <label className="form-label">Carrier name (optional)</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="carrier_name"
                                    value={formData.carrier_name}
                                    onChange={handleChange}
                                    placeholder="e.g. Verizon, T-Mobile"
                                    maxLength={255}
                                />
                            </div>
                        </div>

                    </div>

                    {/* Pricing Information */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">Pricing Information</h3>
                        <div className="offer-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Advertiser Model (Revenue)</label>
                                <select
                                    className="form-control"
                                    name="advertiser_model"
                                    value={formData.advertiser_model}
                                    onChange={handleChange}
                                >
                                    {revenueModels.map(model => (
                                        <option key={model} value={model}>{model}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label required">Advertiser Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    name="advertiser_amount"
                                    value={formData.advertiser_amount}
                                    onChange={handleChange}
                                    placeholder="00.00"
                                    required
                                />
                            </div>
                        </div>
                        <div className="offer-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Publisher Model (Cost)</label>
                                <select
                                    className="form-control"
                                    name="affiliate_model"
                                    value={formData.affiliate_model}
                                    onChange={handleChange}
                                >
                                    {revenueModels.map(model => (
                                        <option key={model} value={model}>{model}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label required">Publisher Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    name="affiliate_amount"
                                    value={formData.affiliate_amount}
                                    onChange={handleChange}
                                    placeholder="00.00"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">Schedule</h3>
                        <div className="offer-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Start Date</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    name="start_date"
                                    value={formData.start_date}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Start Time</label>
                                <input
                                    type="time"
                                    className="form-control"
                                    name="start_time"
                                    value={formData.start_time}
                                    onChange={handleChange}
                                    step="1"
                                />
                            </div>
                        </div>
                        <div className="offer-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">End Date</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    name="end_date"
                                    value={formData.end_date}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">End Time</label>
                                <input
                                    type="time"
                                    className="form-control"
                                    name="end_time"
                                    value={formData.end_time}
                                    onChange={handleChange}
                                    step="1"
                                />
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group">
                                <label className="form-label">Offer Live/Pause</label>
                                <select
                                    className="form-control"
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="live">Live (Take Live Now)</option>
                                    <option value="paused">Pause</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* URLs */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">URLs</h3>
                        {/* Offer URL */}
                        <div className="offer-form-row" style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label required">Offer URL</label>
                                <input
                                    type="url"
                                    className="form-control"
                                    name="offer_url"
                                    value={formData.offer_url}
                                    onChange={handleChange}
                                    placeholder="https://example.com/offer"
                                    required
                                />
                            </div>

                        </div>
                        {/* Preview offer URL — manual entry only (not auto-filled from Offer URL) */}
                        <div className="offer-form-row">
                            <div className="form-group">
                                <label className="form-label">Preview offer URL (optional)</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="preview_url"
                                    value={formData.preview_url}
                                    onChange={handleChange}
                                    placeholder="https://"
                                    autoComplete="off"
                                />
                               
                            </div>
                        </div>
                        {/* Tokens */}
                        <div className="offer-form-row">
                            <div className="form-group">
                                <label className="form-label">Tokens</label>
                                <select
                                    className="form-control"
                                    name="token_type"
                                    value={formData.token_type}
                                    onChange={handleChange}
                                >
                                    <option value="">Select Partner</option>
                                    {tokenTypes.map(token => (
                                        <option key={token} value={token}>{token}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {/* Token Mappings Table */}
                        {showTokenTable && tokenMappings.length > 0 && (
                            <div className="offer-form-row" style={{ marginTop: '20px' }}>
                                <div className="form-group" style={{ width: '100%' }}>
                                    <table className="table table-striped" style={{ marginTop: '10px' }}>
                                        <thead className="thead-light">
                                            <tr>
                                                <th className="text-center" style={{ textTransform: 'uppercase' }}>Enable</th>
                                                <th className="text-center" style={{ textTransform: 'uppercase' }}>Advertiser Parameter</th>
                                                <th className="text-center" style={{ textTransform: 'uppercase' }}>Platform Token</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tokenMappings.map((mapping) => (
                                                <tr key={mapping.id}>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={mapping.enabled}
                                                            onChange={(e) => handleTokenMappingChange(mapping.id, 'enabled', e.target.checked)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="form-control"
                                                            value={mapping.advertiserParam}
                                                            onChange={(e) => handleTokenMappingChange(mapping.id, 'advertiserParam', e.target.value)}
                                                        >
                                                            {advertiserParameters.map(param => (
                                                                <option key={param} value={param}>{param}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="form-control"
                                                            value={mapping.platformToken}
                                                            onChange={(e) => handleTokenMappingChange(mapping.id, 'platformToken', e.target.value)}
                                                        >
                                                            {platformTokens.map(token => (
                                                                <option key={token} value={token}>{token}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        {/* Tokens/Macros Info */}
                        <div className="offer-form-row" style={{ marginTop: '20px' }}>
                            <div className="form-group" style={{ width: '100%' }}>
                                <div className="card" style={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }}>
                                    <div
                                        className="card-header"
                                        style={{
                                            backgroundColor: '#e6eced',
                                            padding: '10px 15px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        onClick={() => setShowMacrosInfo(!showMacrosInfo)}
                                    >
                                        <h5 style={{ margin: 0 }}>Tokens/macros</h5>
                                        <span style={{ fontSize: '20px' }}>
                                            {showMacrosInfo ? '▼' : '▶'}
                                        </span>
                                    </div>
                                    {showMacrosInfo && (
                                        <div className="card-body" style={{ padding: '15px' }}>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{tid}'}</strong> = Unique ID of the transaction form this system.
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{ip}'}</strong> = Session IP4/6
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{offerid}'}</strong> = OfferID
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{useragent}'}</strong> = Device UserAgent Urlencoded
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{raw_useragent}'}</strong> = Raw Device UserAgent (not recommended)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{aff_id}'}</strong> = Publisher Account ID (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{sub_aff_id}'}</strong> = Sub Publisher Account ID (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{adv_id}'}</strong> = Advertiser Account ID (advertiser data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{country}'}</strong> = Country
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{timestamp}'}</strong> = UTC Timestamp 1991-04-20 00:00:00
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{aff_sub1}'}</strong> = Sub ID 1 (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{aff_sub2}'}</strong> = Sub ID 2 (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{aff_sub3}'}</strong> = Sub ID 3 (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{aff_sub4}'}</strong> = Sub ID 4 (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{aff_sub5}'}</strong> = Sub ID 5 (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{deviceid}'}</strong> = Device ID (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{source}'}</strong> = Traffic Source (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{googleaid}'}</strong> = Google AID (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{androidid}'}</strong> = Android ID (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{iosidfa}'}</strong> = iOS IDFA (publisher data)
                                            </p>
                                            <p style={{ marginBottom: '5px', fontSize: '14px' }}>
                                                <strong>{'{os}'}</strong> = OS Name (device data)
                                            </p>
                                            <p style={{ marginBottom: '0', fontSize: '14px' }}>
                                                <strong>{'{os_ver}'}</strong> = OS Version (device data)
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Targeting */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">Targeting</h3>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="ip_action"
                                    value={formData.ip_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target IP</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="ip_list"
                                    value={formData.ip_list}
                                    onChange={handleChange}
                                    placeholder="1.1.1.1,2.2.2.2 (comma separated)"
                                />
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="country_action"
                                    value={formData.country_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target Country Codes</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="country_list"
                                    value={formData.country_list}
                                    onChange={handleChange}
                                    placeholder="US,IN,CA (comma separated)"
                                />
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="browser_action"
                                    value={formData.browser_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target Browsers</label>
                                <select
                                    className="form-control"
                                    name="browser_targeting"
                                    value={formData.browser_targeting}
                                    onChange={handleChange}
                                    multiple
                                    size="5"
                                >
                                    {browsers.map(browser => (
                                        <option key={browser} value={browser.toLowerCase() === 'all' ? 'all' : browser.toLowerCase()}>
                                            {browser}
                                        </option>
                                    ))}
                                </select>
                                <small>Hold Ctrl/Cmd to select multiple</small>
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="device_action"
                                    value={formData.device_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target Devices</label>
                                <select
                                    className="form-control"
                                    name="device_targeting"
                                    value={formData.device_targeting}
                                    onChange={handleChange}
                                    multiple
                                    size="5"
                                >
                                    {devices.map(device => {
                                        const value = device.toLowerCase() === 'all' ? 'all' : device.toLowerCase().replace(/\s+/g, '_');
                                        return (
                                            <option key={device} value={value}>
                                                {device}
                                            </option>
                                        );
                                    })}
                                </select>
                                <small>Hold Ctrl/Cmd to select multiple</small>
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="os_action"
                                    value={formData.os_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target OS</label>
                                <select
                                    className="form-control"
                                    name="os_targeting"
                                    value={formData.os_targeting}
                                    onChange={handleChange}
                                    multiple
                                    size="5"
                                >
                                    {osList.map(os => (
                                        <option key={os} value={os.toLowerCase() === 'all' ? 'all' : os.toLowerCase()}>
                                            {os}
                                        </option>
                                    ))}
                                </select>
                                <small>Hold Ctrl/Cmd to select multiple</small>
                            </div>
                        </div>
                    </div>

                    {/* Capping */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">Capping & Budget</h3>
                        <div className="offer-form-row three-col">
                            <div className="form-group">
                                <label className="form-label">Capping Type</label>
                                <select
                                    className="form-control"
                                    name="capping_type"
                                    value={formData.capping_type}
                                    onChange={handleChange}
                                >
                                    <option value="none">No Capping</option>
                                    <option value="budget">Budget Cap (Revenue)</option>
                                    <option value="conversion">Conversion Cap (Count)</option>
                                </select>
                            </div>

                            {formData.capping_type !== 'none' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Duration</label>
                                        <select
                                            className="form-control"
                                            name="capping_duration"
                                            value={formData.capping_duration}
                                            onChange={handleChange}
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label required">
                                            {formData.capping_type === 'budget' ? 'Budget Amount ($)' : 'Conversion Limit (Count)'}
                                        </label>
                                        <input
                                            type="number"
                                            step={formData.capping_type === 'budget' ? "0.01" : "1"}
                                            className="form-control"
                                            name="capping_amount"
                                            value={formData.capping_amount}
                                            onChange={handleChange}
                                            placeholder={formData.capping_type === 'budget' ? "1000.00" : "100"}
                                            required
                                        />
                                        {formData.capping_action === 'fallback' && (
                                            <small className="form-text text-muted">
                                                Set to 0 with Fallback action to redirect all traffic immediately.
                                            </small>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Action if Exceeded</label>
                                        <select
                                            className="form-control"
                                            name="capping_action"
                                            value={formData.capping_action}
                                            onChange={handleChange}
                                        >
                                            <option value="stop">Stop Traffic (Redirect to 404)</option>
                                            <option value="reject">Reject (Track as Rejected, Payout 0)</option>
                                            <option value="fallback">Fallback (Redirect)</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Fallback Configuration - Visible if Fallback Action selected or explicitly enabled */}
                    {(formData.capping_action === 'fallback') && (
                        <div className="offer-form-section">
                            <h3 className="offer-form-section-title">Fallback Configuration</h3>
                            <div className="offer-form-row two-col">
                                <div className="form-group">
                                    <label className="form-label">Fallback Type</label>
                                    <select
                                        className="form-control"
                                        name="fallback_type"
                                        value={formData.fallback_type}
                                        onChange={handleChange}
                                    >
                                        <option value="offer">Fallback to Offer</option>
                                        <option value="custom">Custom URL</option>
                                    </select>
                                </div>

                                {formData.fallback_type === 'custom' ? (
                                    <div className="form-group">
                                        <label className="form-label required">Destination URL</label>
                                        <input
                                            type="url"
                                            className="form-control"
                                            name="fallback_url"
                                            value={formData.fallback_url}
                                            onChange={handleChange}
                                            placeholder="https://example.com/fallback"
                                            required={formData.capping_action === 'fallback'}
                                        />
                                    </div>
                                ) : (
                                    <div className="form-group">
                                        <label className="form-label required">Select Fallback Offer</label>
                                        <select
                                            className="form-control"
                                            name="fallback_offer_id"
                                            value={formData.fallback_offer_id}
                                            onChange={handleChange}
                                            required={formData.capping_action === 'fallback'}
                                        >
                                            <option value="">Select Offer...</option>
                                            {offers.map(offer => (
                                                <option key={offer.id} value={offer.id}>
                                                    #{offer.public_offer_id} - {offer.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}



                    {/* Actions */}
                    <div className="offer-form-actions">
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Offer'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate('/offer/list')}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default EditOffer;
