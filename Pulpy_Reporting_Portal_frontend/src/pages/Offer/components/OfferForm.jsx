import { useState } from 'react';
import { OFFER_COUNTRIES } from '../../../utils/countries';
import { copyToClipboard } from '../../../utils/clipboard';
import { useToast } from '../../../context/ToastContext';
import {
    currencies,
    timeZones,
    categories,
    revenueModels,
    browsers,
    devices,
    osList,
    tokenTypes,
    billingFlows,
    billingTypes,
    advertiserParameters,
    platformTokens,
} from '../constants/offerFormConstants';
import OfferParamsEditor from './OfferParamsEditor';
import OfferEventsEditor from './OfferEventsEditor';
import TargetingChipSelect from './TargetingChipSelect';
import SearchableSelect from '../../../components/SearchableSelect/SearchableSelect';
import EntityPicker from '../../../components/SearchableSelect/EntityPicker';
import {
    DocumentIcon,
    WalletIcon,
    TrendingUpIcon,
    CreditCardIcon,
    ZapIcon,
    ClockIcon,
    LinkIcon,
    ExternalLinkIcon,
    TargetIcon,
    GlobeIcon,
    MobileIcon,
    MonitorIcon,
    ShieldIcon,
    InfoIcon,
    CircleSlashIcon,
    DollarIcon,
    CheckCircleIcon,
    ShuffleIcon,
    CheckIcon,
    CloseIcon,
} from './OfferIcons';

const MACRO_GROUPS = [
    {
        title: 'Platform & IDs',
        items: [
            { token: '{tid}', desc: 'Unique transaction ID from this platform' },
            { token: '{offerid}', desc: 'Unique ID of the offer' },
            { token: '{adv_id}', desc: 'Advertiser account ID' },
            { token: '{timestamp}', desc: 'UTC timestamp (YYYY-MM-DD HH:MM:SS)' },
            { token: '{random}', desc: 'Random unique string per click' },
        ],
    },
    {
        title: 'Publisher & Sub IDs',
        items: [
            { token: '{aff_id}', desc: 'Publisher / affiliate account ID' },
            { token: '{sub_aff_id}', desc: 'Sub-publisher account ID' },
            { token: '{source}', desc: 'Traffic source passed by publisher' },
            { token: '{aff_sub1}', desc: 'Sub ID 1' },
            { token: '{aff_sub2}', desc: 'Sub ID 2' },
            { token: '{aff_sub3}', desc: 'Sub ID 3' },
            { token: '{aff_sub4}', desc: 'Sub ID 4' },
            { token: '{aff_sub5}', desc: 'Sub ID 5' },
        ],
    },
    {
        title: 'Device & Geolocation',
        items: [
            { token: '{ip}', desc: 'Visitor IP address (IPv4 / IPv6)' },
            { token: '{country}', desc: 'Two-letter ISO country code' },
            { token: '{os}', desc: 'Operating system name' },
            { token: '{os_ver}', desc: 'Operating system version' },
            { token: '{deviceid}', desc: 'Device identifier' },
            { token: '{useragent}', desc: 'URL-encoded User-Agent string' },
            { token: '{raw_useragent}', desc: 'Raw User-Agent string' },
            { token: '{googleaid}', desc: 'Google Advertising ID (GAID)' },
            { token: '{androidid}', desc: 'Android ID' },
            { token: '{iosidfa}', desc: 'Apple IDFA identifier' },
        ],
    },
];

export default function OfferForm({
    headerSubtitle,
    formData,
    setFormData,
    handleChange,
    showCustomCategory,
    setShowCustomCategory,
    showCustomCountry,
    setShowCustomCountry,
    showTokenTable,
    showMacrosInfo: showMacrosInfoProp,
    setShowMacrosInfo: setShowMacrosInfoProp,
    tokenMappings,
    handleTokenMappingChange,
    handleTestOfferLink,
    advertiserLabel = '',
    fallbackOfferLabel = '',
    offerParams,
    setOfferParams,
    offerEvents,
    setOfferEvents,
    loading,
    submitLabel,
    submittingLabel,
    onCancel,
    isEdit = false,
    offerId = null,
}) {
    const toast = useToast();
    const [copiedToken, setCopiedToken] = useState(null);
    const [localShowMacrosInfo, setLocalShowMacrosInfo] = useState(false);
    const showMacrosInfo = showMacrosInfoProp !== undefined ? showMacrosInfoProp : localShowMacrosInfo;
    const setShowMacrosInfo = setShowMacrosInfoProp || setLocalShowMacrosInfo;
    const [macroSearch, setMacroSearch] = useState('');

    const handleCopyToken = async (token) => {
        const res = await copyToClipboard(token);
        if (res.success) {
            setCopiedToken(token);
            toast.success(`Copied ${token} to clipboard`);
            setTimeout(() => setCopiedToken(null), 2000);
        } else {
            toast.error('Failed to copy token');
        }
    };

    // Calculate real-time profit margin
    const advAmount = parseFloat(formData.advertiser_amount) || 0;
    const affAmount = parseFloat(formData.affiliate_amount) || 0;
    const hasBothAmounts =
        formData.advertiser_amount !== '' &&
        formData.affiliate_amount !== '' &&
        !isNaN(advAmount) &&
        !isNaN(affAmount);
    const profitPerConversion = advAmount - affAmount;
    const marginPercent = advAmount > 0 ? ((profitPerConversion / advAmount) * 100).toFixed(1) : 0;

    return (
        <div className="offer-form-wrapper">
            {/* SECTION 1: BASIC INFORMATION */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon blue">
                        <DocumentIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Basic Information</h3>
                        <p>Core campaign identity, advertiser partnership, and classification</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    {/* Offer Name & Advertiser */}
                    <div className="offer-grid-row two-col">
                        <div className="form-group">
                            <label className="form-label required">Offer Name</label>
                            <input
                                type="text"
                                className="form-control form-control-lg"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="e.g. Finance Hub - Mobile Install & Lead"
                                required
                            />
                            <small className="form-helper">Clear, identifiable name shown to publishers and in reports</small>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Advertiser <span className="required-star">*</span></label>
                            <EntityPicker
                                type="advertiser"
                                value={formData.advertiser_id}
                                selectedLabel={advertiserLabel}
                                status="active"
                                required
                                emptyLabel="Select advertiser account"
                                onChange={(nextValue) => handleChange({ target: { name: 'advertiser_id', value: nextValue } })}
                            />
                            <small className="form-helper">The client/account providing this offer</small>
                        </div>
                    </div>

                    <div className="offer-grid-row">
                        <div className="form-group">
                            <label className="form-label">Description & Conversion Flow</label>
                            <textarea
                                className="form-control"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                placeholder="Describe the conversion trigger, restrictions, creative rules, or KPIs..."
                                rows="3"
                            />
                        </div>
                    </div>

                    {/* Currency, Country, Category, Visibility */}
                    <div className="offer-grid-row four-col">
                        <div className="form-group">
                            <label className="form-label">Offer Currency</label>
                            <SearchableSelect
                                value={formData.offer_currency}
                                options={currencies.map((curr) => ({ value: curr, label: curr }))}
                                placeholder="Search currency"
                                emptyLabel="Select currency"
                                onChange={(nextValue) => handleChange({ target: { name: 'offer_currency', value: nextValue } })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Country</label>
                            {!showCustomCountry ? (
                                <SearchableSelect
                                    value={formData.country}
                                    options={[
                                        ...OFFER_COUNTRIES.map((country) => ({
                                            value: country.code,
                                            label: `${country.name} (${country.code})`,
                                            keywords: country.code,
                                        })),
                                        { value: 'CUSTOM', label: '+ Custom Country...' },
                                    ]}
                                    placeholder="Search country or code"
                                    emptyLabel="Select country"
                                    onChange={(nextValue) => {
                                        if (nextValue === 'CUSTOM') {
                                            setShowCustomCountry(true);
                                            setFormData((prev) => ({ ...prev, country: '' }));
                                        } else {
                                            setFormData((prev) => ({ ...prev, country: nextValue }));
                                        }
                                    }}
                                />
                            ) : (
                                <div className="inline-input-action">
                                    <input
                                        type="text"
                                        className="form-control"
                                        name="country"
                                        value={formData.country}
                                        onChange={handleChange}
                                        placeholder="2-letter code (e.g. US)"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            setShowCustomCountry(false);
                                            setFormData((prev) => ({ ...prev, country: 'US' }));
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Category</label>
                            {!showCustomCategory ? (
                                <SearchableSelect
                                    value={formData.category}
                                    options={[
                                        ...categories.map((cat) => ({ value: cat, label: cat })),
                                        { value: '__custom__', label: '+ Add Custom Category' },
                                    ]}
                                    placeholder="Search category"
                                    emptyLabel="Select category"
                                    onChange={(nextValue) => {
                                        if (nextValue === '__custom__') {
                                            setShowCustomCategory(true);
                                            setFormData((prev) => ({ ...prev, category: '', custom_category: '' }));
                                        } else {
                                            setFormData((prev) => ({ ...prev, category: nextValue, custom_category: '' }));
                                        }
                                    }}
                                />
                            ) : (
                                <div className="inline-input-action">
                                    <input
                                        type="text"
                                        className="form-control"
                                        name="custom_category"
                                        value={formData.custom_category}
                                        onChange={handleChange}
                                        placeholder="New category name"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            setShowCustomCategory(false);
                                            setFormData((prev) => ({ ...prev, category: '', custom_category: '' }));
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Visibility</label>
                            <select
                                className="form-control"
                                name="offer_visibility"
                                value={formData.offer_visibility}
                                onChange={handleChange}
                            >
                                <option value="PUBLIC">Public (All Publishers)</option>
                                <option value="PUBLICREQUIREAPPROVAL">Require Approval</option>
                                <option value="PRIVATE">Private (Assigned Only)</option>
                            </select>
                        </div>
                    </div>

                    <div className="offer-grid-row three-col">
                        <div className="form-group">
                            <label className="form-label">Timezone</label>
                            <SearchableSelect
                                value={formData.timezone}
                                options={timeZones.map((tz) => ({ value: tz, label: tz }))}
                                placeholder="Search timezone"
                                emptyLabel="Select timezone"
                                onChange={(nextValue) => handleChange({ target: { name: 'timezone', value: nextValue } })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Billing Flow (Optional)</label>
                            <SearchableSelect
                                value={formData.billing_flow}
                                options={billingFlows.map((flow) => ({ value: flow, label: flow }))}
                                placeholder="Search billing flow"
                                emptyLabel="Select flow"
                                onChange={(nextValue) => handleChange({ target: { name: 'billing_flow', value: nextValue } })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Billing Type (Optional)</label>
                            <select
                                className="form-control"
                                name="billing_type"
                                value={formData.billing_type}
                                onChange={handleChange}
                            >
                                <option value="">Select Type</option>
                                {billingTypes.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="offer-grid-row">
                        <div className="form-group">
                            <label className="form-label">Carrier Name (Optional)</label>
                            <input
                                type="text"
                                className="form-control"
                                name="carrier_name"
                                value={formData.carrier_name}
                                onChange={handleChange}
                                placeholder="e.g. Verizon, Vodafone, T-Mobile, Jio"
                                maxLength={255}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 2: PRICING & FINANCIALS */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon green">
                        <WalletIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Pricing & Payout Model</h3>
                        <p>Configure revenue received from advertiser and payout delivered to publishers</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    <div className="financials-bento-grid">
                        {/* Advertiser Revenue Card */}
                        <div className="financial-subcard revenue">
                            <div className="financial-subcard-header">
                                <span className="financial-subcard-tag tag-revenue">Advertiser Revenue (Inflow)</span>
                                <span className="financial-subcard-icon">
                                    <TrendingUpIcon size={18} />
                                </span>
                            </div>
                            <div className="financial-subcard-content">
                                <div className="form-group">
                                    <label className="form-label">Revenue Model</label>
                                    <select
                                        className="form-control"
                                        name="advertiser_model"
                                        value={formData.advertiser_model}
                                        onChange={handleChange}
                                    >
                                        {revenueModels.map((model) => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label required">Advertiser Amount</label>
                                    <div className="input-currency-group">
                                        <span className="currency-prefix">{formData.offer_currency || '$'}</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="form-control"
                                            name="advertiser_amount"
                                            value={formData.advertiser_amount}
                                            onChange={handleChange}
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <small className="form-helper">What advertiser pays per conversion</small>
                                </div>
                            </div>
                        </div>

                        {/* Publisher Payout Card */}
                        <div className="financial-subcard payout">
                            <div className="financial-subcard-header">
                                <span className="financial-subcard-tag tag-payout">Publisher Payout (Cost)</span>
                                <span className="financial-subcard-icon">
                                    <CreditCardIcon size={18} />
                                </span>
                            </div>
                            <div className="financial-subcard-content">
                                <div className="form-group">
                                    <label className="form-label">Publisher Model</label>
                                    <select
                                        className="form-control"
                                        name="affiliate_model"
                                        value={formData.affiliate_model}
                                        onChange={handleChange}
                                    >
                                        {revenueModels.map((model) => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label required">Publisher Payout</label>
                                    <div className="input-currency-group">
                                        <span className="currency-prefix">{formData.offer_currency || '$'}</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="form-control"
                                            name="affiliate_amount"
                                            value={formData.affiliate_amount}
                                            onChange={handleChange}
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <small className="form-helper">What publisher earns per conversion</small>
                                </div>
                            </div>
                        </div>

                        {/* Profit Margin Preview Card */}
                        <div className={`financial-subcard margin ${profitPerConversion >= 0 ? 'profitable' : 'loss'}`}>
                            <div className="financial-subcard-header">
                                <span className="financial-subcard-tag tag-margin">Gross Profit Analysis</span>
                                <span className="financial-subcard-icon">
                                    <ZapIcon size={18} />
                                </span>
                            </div>
                            <div className="margin-calculator-body">
                                {hasBothAmounts ? (
                                    <>
                                        <div className="margin-stat-group">
                                            <div className="margin-stat-label">Estimated Gross Profit</div>
                                            <div className={`margin-stat-value ${profitPerConversion >= 0 ? 'positive' : 'negative'}`}>
                                                {profitPerConversion >= 0 ? '+' : ''}
                                                {formData.offer_currency} {profitPerConversion.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="margin-stat-row">
                                            <span className="margin-stat-sublabel">Profit Margin:</span>
                                            <span className={`margin-badge ${profitPerConversion >= 0 ? 'badge-success' : 'badge-danger'}`}>
                                                {marginPercent}%
                                            </span>
                                        </div>
                                        <div className="margin-formula-note">
                                            Revenue ({advAmount}) - Payout ({affAmount}) = Net Margin
                                        </div>
                                    </>
                                ) : (
                                    <div className="margin-placeholder">
                                        <InfoIcon size={16} />
                                        <span>Enter both advertiser and publisher amounts to preview profit margin per conversion</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 3: SCHEDULE & STATUS */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon amber">
                        <ClockIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Schedule & Offer Status</h3>
                        <p>Control campaign lifecycle, live/pause state, and daily time windows</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    {/* Visual Status Switcher */}
                    <div className="status-selector-wrap">
                        <label className="form-label">Offer Status</label>
                        <div className="status-toggle-group">
                            <button
                                type="button"
                                className={`status-toggle-btn live ${formData.status === 'live' ? 'active' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, status: 'live' }))}
                            >
                                <span className="status-dot green" />
                                <span className="status-toggle-text">Live (Active)</span>
                            </button>
                            <button
                                type="button"
                                className={`status-toggle-btn paused ${formData.status === 'paused' ? 'active' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, status: 'paused' }))}
                            >
                                <span className="status-dot amber" />
                                <span className="status-toggle-text">Paused</span>
                            </button>
                            <button
                                type="button"
                                className={`status-toggle-btn draft ${formData.status === 'draft' ? 'active' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, status: 'draft' }))}
                            >
                                <span className="status-dot grey" />
                                <span className="status-toggle-text">Draft</span>
                            </button>
                        </div>
                    </div>

                    <div className="offer-grid-row two-col u-mt-16">
                        <div className="schedule-box">
                            <div className="schedule-box-title">Start Timeline</div>
                            <div className="schedule-box-fields">
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
                                    <label className="form-label">Start Time (IST)</label>
                                    <input
                                        type="time"
                                        className="form-control"
                                        name="start_time"
                                        value={formData.start_time || ''}
                                        onChange={handleChange}
                                        step="1"
                                    />
                                    <small className="form-helper">Leave empty for 24/7 all-day traffic</small>
                                </div>
                            </div>
                        </div>

                        <div className="schedule-box">
                            <div className="schedule-box-title">End Timeline</div>
                            <div className="schedule-box-fields">
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
                                    <label className="form-label">End Time (IST)</label>
                                    <input
                                        type="time"
                                        className="form-control"
                                        name="end_time"
                                        value={formData.end_time || ''}
                                        onChange={handleChange}
                                        step="1"
                                    />
                                    <small className="form-helper">Leave empty for 24/7 all-day traffic</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="schedule-info-banner">
                        <InfoIcon size={18} />
                        <span>
                            When both start and end time are blank, this offer runs <strong>24/7 all day</strong> within the date range without time-of-day filtering.
                        </span>
                    </div>
                </div>
            </div>

            {/* SECTION 4: DESTINATION & URLS */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon purple">
                        <LinkIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Destination URLs & Platform Tokens</h3>
                        <p>Destination landing page, publisher preview link, and parameter forwarding tokens</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    {/* Primary Offer URL */}
                    <div className="form-group">
                        <label className="form-label required">Destination Offer URL</label>
                        <div className="url-input-action-group">
                            <div className="url-prefix-input-wrap">
                                <span className="url-prefix-badge">URL</span>
                                <input
                                    type="url"
                                    className="form-control url-main-input"
                                    name="offer_url"
                                    value={formData.offer_url}
                                    onChange={handleChange}
                                    placeholder="https://advertiser.com/landing?subid={tid}&click_id={aff_sub1}"
                                    required
                                />
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary btn-test-url"
                                onClick={handleTestOfferLink}
                                title="Open destination URL in a new tab"
                            >
                                <ExternalLinkIcon size={15} />
                                <span>Test Link</span>
                            </button>
                        </div>
                        <small className="form-helper">
                            The advertiser's landing page. Use tokens like <code>{'{tid}'}</code> to forward transaction IDs.
                        </small>
                    </div>

                    {/* Preview URL */}
                    <div className="form-group u-mt-16">
                        <label className="form-label">Preview Offer URL (Optional)</label>
                        <input
                            type="text"
                            className="form-control"
                            name="preview_url"
                            value={formData.preview_url}
                            onChange={handleChange}
                            placeholder="https://example.com/preview"
                            autoComplete="off"
                        />
                        <small className="form-helper">Safe sample page publishers can inspect before running traffic</small>
                    </div>

                    {/* Partner Token Integration Presets */}
                    <div className="offer-grid-row two-col u-mt-16">
                        <div className="form-group">
                            <label className="form-label">Partner Tracking Preset</label>
                            <select
                                className="form-control"
                                name="token_type"
                                value={formData.token_type}
                                onChange={handleChange}
                            >
                                <option value="">Custom / None</option>
                                {tokenTypes.map((token) => (
                                    <option key={token} value={token}>{token.toUpperCase()} Preset</option>
                                ))}
                            </select>
                            <small className="form-helper">Auto-populates parameter mapping for HasOffers or Affise</small>
                        </div>
                    </div>

                    {/* Token Mappings Table if partner selected */}
                    {showTokenTable && tokenMappings.length > 0 && (
                        <div className="token-mapping-container u-mt-16">
                            <div className="token-mapping-header">
                                <span className="token-mapping-title">Partner Token Forwarding Configuration</span>
                            </div>
                            <div className="table-responsive">
                                <table className="token-mapping-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '12%', textAlign: 'center' }}>Enable</th>
                                            <th style={{ width: '44%' }}>Advertiser Parameter</th>
                                            <th style={{ width: '44%' }}>Platform Token</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tokenMappings.map((mapping) => (
                                            <tr key={mapping.id}>
                                                <td style={{ textAlign: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        className="checkbox-custom"
                                                        checked={mapping.enabled}
                                                        onChange={(e) => handleTokenMappingChange(mapping.id, 'enabled', e.target.checked)}
                                                    />
                                                </td>
                                                <td>
                                                    <SearchableSelect
                                                        value={mapping.advertiserParam}
                                                        options={advertiserParameters.map((param) => ({ value: param, label: param }))}
                                                        placeholder="Search parameter"
                                                        emptyLabel="Select parameter"
                                                        onChange={(nextValue) => handleTokenMappingChange(mapping.id, 'advertiserParam', nextValue)}
                                                    />
                                                </td>
                                                <td>
                                                    <SearchableSelect
                                                        value={mapping.platformToken}
                                                        options={platformTokens.map((token) => ({ value: token, label: token }))}
                                                        placeholder="Search token"
                                                        emptyLabel="Select token"
                                                        onChange={(nextValue) => handleTokenMappingChange(mapping.id, 'platformToken', nextValue)}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Interactive Macros & Tokens Reference Accordion */}
                    <div className="macros-accordion-box u-mt-20">
                        <button
                            type="button"
                            className="macros-accordion-toggle"
                            onClick={() => setShowMacrosInfo(!showMacrosInfo)}
                            aria-expanded={showMacrosInfo}
                        >
                            <div className="macros-toggle-left">
                                <span className="macros-badge">{'{}'}</span>
                                <span className="macros-toggle-title">Available URL Macros & Dynamic Tokens</span>
                                <span className="macros-toggle-hint">(Click token to copy to clipboard)</span>
                            </div>
                            <span className="macros-accordion-chevron">
                                {showMacrosInfo ? 'Hide Tokens' : 'View Tokens'}
                            </span>
                        </button>

                        {showMacrosInfo && (
                            <div className="macros-accordion-content">
                                <div className="macros-search-wrap">
                                    <input
                                        type="text"
                                        className="macros-search-input"
                                        placeholder="Filter tokens (e.g. tid, aff_sub, ip, country)..."
                                        value={macroSearch}
                                        onChange={(e) => setMacroSearch(e.target.value)}
                                    />
                                    {macroSearch && (
                                        <button
                                            type="button"
                                            className="macros-search-clear"
                                            onClick={() => setMacroSearch('')}
                                        >
                                            <CloseIcon size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="macros-groups-container">
                                    {MACRO_GROUPS.map((group) => {
                                        const query = macroSearch.toLowerCase();
                                        const filteredItems = group.items.filter(
                                            (item) =>
                                                !query ||
                                                item.token.toLowerCase().includes(query) ||
                                                item.desc.toLowerCase().includes(query)
                                        );

                                        if (filteredItems.length === 0) return null;

                                        return (
                                            <div key={group.title} className="macros-group-card">
                                                <div className="macros-group-title">{group.title}</div>
                                                <div className="macros-chips-list">
                                                    {filteredItems.map((item) => (
                                                        <button
                                                            key={item.token}
                                                            type="button"
                                                            className={`macro-chip-btn ${copiedToken === item.token ? 'copied' : ''}`}
                                                            onClick={() => handleCopyToken(item.token)}
                                                            title={`Click to copy ${item.token} - ${item.desc}`}
                                                        >
                                                            <code className="macro-token-code">{item.token}</code>
                                                            <span className="macro-token-desc">{item.desc}</span>
                                                            <span className="macro-copy-indicator">
                                                                {copiedToken === item.token ? (
                                                                    <>
                                                                        <CheckIcon size={10} /> Copied
                                                                    </>
                                                                ) : 'Copy'}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* SECTION 5: DYNAMIC QUERY PARAMETERS */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon cyan">
                        <ZapIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Tracking URL Parameters</h3>
                        <p>Configure pass-through query parameters (sub IDs, UTM tags) forwarded with each click</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    <OfferParamsEditor
                        params={offerParams}
                        onChange={setOfferParams}
                        disabled={loading}
                    />
                </div>
            </div>

            {/* SECTION 5B: MULTI-EVENT / GOALS CONFIGURATION (Preserving Multi-Event Tracking) */}
            {offerEvents !== undefined && setOfferEvents && (
                <div className="offer-form-card">
                    <div className="offer-form-card-header">
                        <div className="card-header-icon green">
                            <TargetIcon size={20} />
                        </div>
                        <div className="card-header-text">
                            <h3>Offer Events & Goals (Multi-Event Tracking)</h3>
                            <p>Configure multiple conversion events, custom payouts, and advertiser revenue per goal</p>
                        </div>
                    </div>

                    <div className="offer-form-card-body">
                        <OfferEventsEditor
                            events={offerEvents}
                            onChange={setOfferEvents}
                            disabled={loading}
                            currency={formData.offer_currency || 'USD'}
                            defaultAdvertiserAmount={formData.advertiser_amount}
                            defaultAffiliateAmount={formData.affiliate_amount}
                            onPrimaryPricingChange={({ advertiser_amount, affiliate_amount }) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    ...(advertiser_amount !== undefined && { advertiser_amount }),
                                    ...(affiliate_amount !== undefined && { affiliate_amount }),
                                }));
                            }}
                        />
                    </div>
                </div>
            )}

            {/* SECTION 6: PRECISION TARGETING */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon red">
                        <TargetIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Targeting Rules</h3>
                        <p>Granular traffic filtering for Browsers, Devices, Operating Systems, Geo, and IPs</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    {/* Device & Browser Chip Multi-selects */}
                    <div className="targeting-chips-section">
                        <TargetingChipSelect
                            label="Target Browsers"
                            items={browsers}
                            selected={formData.browser_targeting}
                            onChange={(selected) => setFormData((prev) => ({ ...prev, browser_targeting: selected }))}
                            formatValue={(item) => (item.toLowerCase() === 'all' ? 'all' : item.toLowerCase())}
                            icon={<GlobeIcon size={16} />}
                            helperText="Traffic from unselected browsers will follow the Browser Action rule below."
                        />

                        <div className="targeting-action-inline">
                            <span className="targeting-action-label">Action if browser outside list:</span>
                            <select
                                className={`targeting-action-select ${formData.browser_action === 'ALLOW' ? 'allow' : 'block'}`}
                                name="browser_action"
                                value={formData.browser_action}
                                onChange={handleChange}
                            >
                                <option value="ALLOW">Allow Traffic</option>
                                <option value="BLOCK">Block Traffic</option>
                            </select>
                        </div>
                    </div>

                    <div className="targeting-divider" />

                    <div className="targeting-chips-section">
                        <TargetingChipSelect
                            label="Target Devices"
                            items={devices}
                            selected={formData.device_targeting}
                            onChange={(selected) => setFormData((prev) => ({ ...prev, device_targeting: selected }))}
                            formatValue={(item) => (item.toLowerCase() === 'all' ? 'all' : item.toLowerCase().replace(/\s+/g, '_'))}
                            icon={<MobileIcon size={16} />}
                            helperText="Select device types allowed to reach this campaign."
                        />

                        <div className="targeting-action-inline">
                            <span className="targeting-action-label">Action if device outside list:</span>
                            <select
                                className={`targeting-action-select ${formData.device_action === 'ALLOW' ? 'allow' : 'block'}`}
                                name="device_action"
                                value={formData.device_action}
                                onChange={handleChange}
                            >
                                <option value="ALLOW">Allow Traffic</option>
                                <option value="BLOCK">Block Traffic</option>
                            </select>
                        </div>
                    </div>

                    <div className="targeting-divider" />

                    <div className="targeting-chips-section">
                        <TargetingChipSelect
                            label="Target Operating Systems"
                            items={osList}
                            selected={formData.os_targeting}
                            onChange={(selected) => setFormData((prev) => ({ ...prev, os_targeting: selected }))}
                            formatValue={(item) => (item.toLowerCase() === 'all' ? 'all' : item.toLowerCase())}
                            icon={<MonitorIcon size={16} />}
                            helperText="Specify operating systems permitted for this offer."
                        />

                        <div className="targeting-action-inline">
                            <span className="targeting-action-label">Action if OS outside list:</span>
                            <select
                                className={`targeting-action-select ${formData.os_action === 'ALLOW' ? 'allow' : 'block'}`}
                                name="os_action"
                                value={formData.os_action}
                                onChange={handleChange}
                            >
                                <option value="ALLOW">Allow Traffic</option>
                                <option value="BLOCK">Block Traffic</option>
                            </select>
                        </div>
                    </div>

                    <div className="targeting-divider" />

                    {/* Granular List Filters: IP, Country, ISP, Carrier, City */}
                    <div className="targeting-lists-grid">
                        <div className="targeting-rule-box">
                            <div className="targeting-rule-header">
                                <span className="targeting-rule-title">IP Address Filtering</span>
                                <select
                                    className={`targeting-action-badge ${formData.ip_action === 'ALLOW' ? 'allow' : 'block'}`}
                                    name="ip_action"
                                    value={formData.ip_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">ALLOW</option>
                                    <option value="BLOCK">BLOCK</option>
                                </select>
                            </div>
                            <input
                                type="text"
                                className="form-control"
                                name="ip_list"
                                value={formData.ip_list}
                                onChange={handleChange}
                                placeholder="e.g. 1.1.1.1, 8.8.8.8 (comma separated)"
                            />
                            <small className="form-helper">Specific IP addresses to allow or blacklist</small>
                        </div>

                        <div className="targeting-rule-box">
                            <div className="targeting-rule-header">
                                <span className="targeting-rule-title">Target Country Codes</span>
                                <select
                                    className={`targeting-action-badge ${formData.country_action === 'ALLOW' ? 'allow' : 'block'}`}
                                    name="country_action"
                                    value={formData.country_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">ALLOW</option>
                                    <option value="BLOCK">BLOCK</option>
                                </select>
                            </div>
                            <input
                                type="text"
                                className="form-control"
                                name="country_list"
                                value={formData.country_list}
                                onChange={handleChange}
                                placeholder="e.g. US, IN, GB, CA (comma separated)"
                            />
                            <small className="form-helper">Comma separated two-letter ISO country codes</small>
                        </div>

                        <div className="targeting-rule-box">
                            <div className="targeting-rule-header">
                                <span className="targeting-rule-title">Target ISP</span>
                                <select
                                    className={`targeting-action-badge ${formData.isp_action === 'ALLOW' ? 'allow' : 'block'}`}
                                    name="isp_action"
                                    value={formData.isp_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">ALLOW</option>
                                    <option value="BLOCK">BLOCK</option>
                                </select>
                            </div>
                            <input
                                type="text"
                                className="form-control"
                                name="isp_list"
                                value={formData.isp_list}
                                onChange={handleChange}
                                placeholder="e.g. Jio, Airtel, Comcast, AT&T"
                            />
                            <small className="form-helper">Filter traffic by Internet Service Provider</small>
                        </div>

                        <div className="targeting-rule-box">
                            <div className="targeting-rule-header">
                                <span className="targeting-rule-title">Target Mobile Network / Carrier</span>
                                <select
                                    className={`targeting-action-badge ${formData.carrier_action === 'ALLOW' ? 'allow' : 'block'}`}
                                    name="carrier_action"
                                    value={formData.carrier_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">ALLOW</option>
                                    <option value="BLOCK">BLOCK</option>
                                </select>
                            </div>
                            <input
                                type="text"
                                className="form-control"
                                name="carrier_list"
                                value={formData.carrier_list}
                                onChange={handleChange}
                                placeholder="e.g. Verizon, Vodafone, T-Mobile"
                            />
                            <small className="form-helper">Filter mobile cellular network operators</small>
                        </div>

                        <div className="targeting-rule-box">
                            <div className="targeting-rule-header">
                                <span className="targeting-rule-title">Target Cities</span>
                                <select
                                    className={`targeting-action-badge ${formData.city_action === 'ALLOW' ? 'allow' : 'block'}`}
                                    name="city_action"
                                    value={formData.city_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">ALLOW</option>
                                    <option value="BLOCK">BLOCK</option>
                                </select>
                            </div>
                            <input
                                type="text"
                                className="form-control"
                                name="city_list"
                                value={formData.city_list}
                                onChange={handleChange}
                                placeholder="e.g. Mumbai, New York, London, Tokyo"
                            />
                            <small className="form-helper">Comma separated city names</small>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 7: CAPPING & SMART FALLBACK */}
            <div className="offer-form-card">
                <div className="offer-form-card-header">
                    <div className="card-header-icon teal">
                        <ShieldIcon size={20} />
                    </div>
                    <div className="card-header-text">
                        <h3>Capping & Smart Fallback</h3>
                        <p>Protect budgets with volume caps and redirect excess traffic automatically</p>
                    </div>
                </div>

                <div className="offer-form-card-body">
                    {/* Capping Type Selector Pills */}
                    <div className="capping-type-selector">
                        <label className="form-label">Capping Model</label>
                        <div className="capping-pills-group">
                            <button
                                type="button"
                                className={`capping-pill-btn ${formData.capping_type === 'none' ? 'active' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, capping_type: 'none' }))}
                            >
                                <CircleSlashIcon size={15} />
                                <span>No Capping (Unlimited)</span>
                            </button>
                            <button
                                type="button"
                                className={`capping-pill-btn ${formData.capping_type === 'budget' ? 'active' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, capping_type: 'budget' }))}
                            >
                                <DollarIcon size={15} />
                                <span>Budget Cap ({formData.offer_currency || '$'})</span>
                            </button>
                            <button
                                type="button"
                                className={`capping-pill-btn ${formData.capping_type === 'conversion' ? 'active' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, capping_type: 'conversion' }))}
                            >
                                <CheckCircleIcon size={15} />
                                <span>Conversion Cap (Count)</span>
                            </button>
                        </div>
                    </div>

                    {formData.capping_type !== 'none' && (
                        <div className="capping-configuration-card u-mt-20">
                            <div className="offer-grid-row three-col">
                                <div className="form-group">
                                    <label className="form-label">Reset Frequency</label>
                                    <select
                                        className="form-control"
                                        name="capping_duration"
                                        value={formData.capping_duration}
                                        onChange={handleChange}
                                    >
                                        <option value="daily">Daily Reset</option>
                                        <option value="weekly">Weekly Reset</option>
                                        <option value="monthly">Monthly Reset</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label required">
                                        {formData.capping_type === 'budget'
                                            ? `Budget Limit (${formData.offer_currency || '$'})`
                                            : 'Conversion Limit (Count)'}
                                    </label>
                                    <input
                                        type="number"
                                        step={formData.capping_type === 'budget' ? '0.01' : '1'}
                                        className="form-control"
                                        name="capping_amount"
                                        value={formData.capping_amount}
                                        onChange={handleChange}
                                        placeholder={formData.capping_type === 'budget' ? '1000.00' : '100'}
                                        required
                                    />
                                    {formData.capping_action === 'fallback' && (
                                        <small className="form-helper">
                                            Set to 0 with Fallback to redirect all traffic immediately.
                                        </small>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Action if Cap Exceeded</label>
                                    <select
                                        className="form-control"
                                        name="capping_action"
                                        value={formData.capping_action}
                                        onChange={handleChange}
                                    >
                                        <option value="stop">Stop Traffic (Redirect to 404)</option>
                                        <option value="reject">Reject (Track Payout 0)</option>
                                        <option value="fallback">Fallback (Smart Redirect)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Fallback Destination Panel */}
                    {formData.capping_action === 'fallback' && (
                        <div className="fallback-destination-card u-mt-16">
                            <div className="fallback-header">
                                <span className="fallback-icon">
                                    <ShuffleIcon size={18} />
                                </span>
                                <div>
                                    <div className="fallback-title">Smart Fallback Destination</div>
                                    <p className="fallback-desc">Where traffic will be routed after the cap is hit</p>
                                </div>
                            </div>

                            <div className="offer-grid-row two-col u-mt-16">
                                <div className="form-group">
                                    <label className="form-label">Fallback Type</label>
                                    <select
                                        className="form-control"
                                        name="fallback_type"
                                        value={formData.fallback_type}
                                        onChange={handleChange}
                                    >
                                        <option value="offer">Route to Another Active Offer</option>
                                        <option value="custom">Route to Custom External URL</option>
                                    </select>
                                </div>

                                {formData.fallback_type === 'custom' ? (
                                    <div className="form-group">
                                        <label className="form-label required">Destination Fallback URL</label>
                                        <input
                                            type="url"
                                            className="form-control"
                                            name="fallback_url"
                                            value={formData.fallback_url}
                                            onChange={handleChange}
                                            placeholder="https://example.com/fallback-offer"
                                            required={formData.capping_action === 'fallback'}
                                        />
                                    </div>
                                ) : (
                                    <div className="form-group">
                                        <label className="form-label required">Select Fallback Offer</label>
                                        <EntityPicker
                                            type="offer"
                                            value={formData.fallback_offer_id}
                                            selectedLabel={fallbackOfferLabel}
                                            excludePublicOfferId={offerId}
                                            required={formData.capping_action === 'fallback'}
                                            emptyLabel="Select offer..."
                                            onChange={(nextValue) => handleChange({ target: { name: 'fallback_offer_id', value: nextValue } })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* STICKY BOTTOM ACTION BAR */}
            <div className="offer-form-bottom-bar">
                <div className="bottom-bar-summary">
                    <span className="bottom-bar-name">
                        {formData.name || (isEdit ? 'Editing Offer' : 'New Offer Draft')}
                    </span>
                    <span className="bottom-bar-dot">•</span>
                    <span className="bottom-bar-status" data-status={formData.status}>
                        {formData.status?.toUpperCase() || 'LIVE'}
                    </span>
                    {hasBothAmounts && (
                        <>
                            <span className="bottom-bar-dot">•</span>
                            <span className="bottom-bar-profit">
                                Est. Profit: {profitPerConversion >= 0 ? '+' : ''}{formData.offer_currency} {profitPerConversion.toFixed(2)} ({marginPercent}%)
                            </span>
                        </>
                    )}
                </div>

                <div className="bottom-bar-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-success btn-lg"
                        disabled={loading}
                    >
                        {loading ? submittingLabel : submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
