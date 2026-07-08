import { OFFER_COUNTRIES } from '../../../utils/countries';
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

export default function OfferForm({
    headerSubtitle,
    formData,
    handleChange,
    showCustomCategory,
    setShowCustomCategory,
    showCustomCountry,
    setShowCustomCountry,
    showTokenTable,
    showMacrosInfo,
    setShowMacrosInfo,
    tokenMappings,
    handleTokenMappingChange,
    handleTestOfferLink,
    advertisers,
    offers,
    offerParams,
    setOfferParams,
    loadingAdvertisers = false,
    loading,
    submitLabel,
    submittingLabel,
    onCancel,
}) {
    return (
        <div className="offer-form-container">
            <div className="offer-form-header">
                <h2>Offer Details</h2>
                <p>{headerSubtitle}</p>
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
                                                setFormData(prev => ({ ...prev, category: '', custom_category: '' }));
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
                                    value={formData.start_time || ''}
                                    onChange={handleChange}
                                    step="1"
                                />
                                <small style={{ color: '#666' }}>Leave empty for 24/7 (IST)</small>
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
                                    value={formData.end_time || ''}
                                    onChange={handleChange}
                                    step="1"
                                />
                                <small style={{ color: '#666' }}>Leave empty for 24/7 (IST)</small>
                            </div>
                        </div>
                        <p style={{ color: '#666', fontSize: '13px', margin: '0 0 12px' }}>
                            If both start and end time are empty, the offer accepts traffic all day within the date range.
                        </p>
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
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleTestOfferLink}
                                style={{ marginBottom: '0', height: 'fit-content', whiteSpace: 'nowrap' }}
                            >
                                🔗 Test Offer Link
                            </button>
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

                    {/* Pass-through URL parameters */}
                    <div className="offer-form-section">
                        <h3 className="offer-form-section-title">Tracking URL Parameters</h3>
                        <OfferParamsEditor
                            params={offerParams}
                            onChange={setOfferParams}
                            disabled={loading}
                        />
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
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="isp_action"
                                    value={formData.isp_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target ISP</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="isp_list"
                                    value={formData.isp_list}
                                    onChange={handleChange}
                                    placeholder="Jio, Airtel, Vi (comma separated)"
                                />
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="carrier_action"
                                    value={formData.carrier_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target Carrier / Network</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="carrier_list"
                                    value={formData.carrier_list}
                                    onChange={handleChange}
                                    placeholder="Jio, Airtel, T-Mobile (comma separated)"
                                />
                            </div>
                        </div>
                        <div className="offer-form-row">
                            <div className="form-group" style={{ flex: '0 0 150px' }}>
                                <label className="form-label">Select Action</label>
                                <select
                                    className="form-control"
                                    name="city_action"
                                    value={formData.city_action}
                                    onChange={handleChange}
                                >
                                    <option value="ALLOW">Allow</option>
                                    <option value="BLOCK">Block</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: '1' }}>
                                <label className="form-label">Target Cities</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="city_list"
                                    value={formData.city_list}
                                    onChange={handleChange}
                                    placeholder="Mumbai, Delhi, Bangalore (comma separated)"
                                />
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
            <div className="offer-form-actions">
                <button type="submit" className="btn btn-success" disabled={loading}>
                    {loading ? submittingLabel : submitLabel}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
