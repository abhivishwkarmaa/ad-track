import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { publishersAPI, offersAPI } from '../../services/api';
import './Affiliate.css';

// Simple check icon
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);

// Copy icon
const CopyIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
);

function PostbackTest() {
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [affiliates, setAffiliates] = useState([]);
    const [loadingAffiliates, setLoadingAffiliates] = useState(true);
    const [selectedAffiliate, setSelectedAffiliate] = useState(null);
    const [offers, setOffers] = useState([]);
    const [loadingOffers, setLoadingOffers] = useState(true);

    const [formData, setFormData] = useState({
        trackingUrl: '',
        affiliateId: '',
        offerId: '', // Added offerId requirement
        rcid: '',
    });

    useEffect(() => {
        const fetchAffiliates = async () => {
            try {
                const response = await publishersAPI.getPublishers({ limit: 1000 });
                if (response.success) {
                    setAffiliates(response.data);
                } else {
                    toast.error('Failed to load publishers');
                }
            } catch (error) {
                console.error('Error fetching affiliates:', error);
                toast.error('Error fetching affiliates');
            } finally {
                setLoadingAffiliates(false);
            }
        };

        const fetchOffers = async () => {
            try {
                const response = await offersAPI.getOffers({ limit: 1000 });
                if (response.success) {
                    setOffers(response.data);
                } else {
                    toast.error('Failed to load offers');
                }
            } catch (error) {
                console.error('Error fetching offers:', error);
                toast.error('Error fetching offers');
            } finally {
                setLoadingOffers(false);
            }
        };

        fetchAffiliates();
        fetchOffers();
    }, [refreshKey]);



    const handleAffiliateChange = (e) => {
        const id = e.target.value;
        setFormData(prev => ({ ...prev, affiliateId: id }));

        if (id) {
            const affiliate = affiliates.find(a => a.id === parseInt(id));
            setSelectedAffiliate(affiliate || null);
        } else {
            setSelectedAffiliate(null);
        }
    };



    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const generateRandomId = () => {
        const randomId = 'test_' + Math.random().toString(36).substr(2, 9);
        setFormData(prev => ({ ...prev, rcid: randomId }));
    };

    const handleTest = async (e) => {
        e.preventDefault();

        if (!formData.trackingUrl) {
            toast.error('Please enter a tracking URL');
            return;
        }

        if (!formData.affiliateId) {
            toast.error('Please select a Publisher');
            return;
        }

        if (!formData.offerId) {
            toast.error('Please select an Offer');
            return;
        }

        // Validate URL format
        try {
            const url = new URL(formData.trackingUrl);
            if (!url.protocol.startsWith('http')) {
                toast.error('Invalid URL protocol. Must be http or https');
                return;
            }
        } catch (err) {
            toast.error('Invalid tracking URL format');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            let trackingUrl = formData.trackingUrl;

            // Append rcid if provided
            if (formData.rcid) {
                const separator = trackingUrl.includes('?') ? '&' : '?';
                trackingUrl += `${separator}tid=${encodeURIComponent(formData.rcid)}`;
            }

            // 1. Start Test Session
            const sessionResponse = await publishersAPI.startTestPostbackSession({
                affiliate_id: formData.affiliateId,
                offer_id: formData.offerId,
                tracking_url: trackingUrl
            });

            if (!sessionResponse.success) {
                throw new Error(sessionResponse.error || 'Failed to start test session');
            }

            // 2. Open URL (Unmodified)
            // Real User Traffic Simulation
            const newWindow = window.open(trackingUrl, '_blank');

            if (!newWindow) {
                toast.error('Please allow popups for this site to test postbacks');
                setLoading(false);
                return;
            }

            setResult({
                success: true,
                mode: 'BROWSER_CLICK',
                url: trackingUrl,
                timestamp: new Date().toISOString(),
                message: 'Tracking URL opened! Waiting for click to reach tracker...',
                status: 'processing'
            });

            toast.success('Test initiated! Waiting for results...');

            // 3. Poll for results
            let attempts = 0;
            const maxAttempts = 30; // 60 seconds (2s interval)

            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const statusResponse = await publishersAPI.checkTestPostbackStatus(formData.affiliateId, formData.offerId);

                    if (statusResponse.success) {
                        // Backend sets status to 'success' (matching Redis value) when complete
                        if (statusResponse.status === 'success') {
                            clearInterval(pollInterval);
                            setLoading(false);

                            // Merge result data for display
                            const resultData = statusResponse.result || {};
                            const conversionData = resultData.conversion || {};

                            setResult({
                                success: true,
                                mode: 'BROWSER_CLICK',
                                url: trackingUrl,
                                timestamp: new Date().toISOString(),
                                message: 'Test completed successfully! Postback fired.',
                                status: 'completed',
                                conversion: {
                                    ...conversionData,
                                    click_id: resultData.click_id, // Ensure click_id is available
                                    affiliate_click_id: resultData.affiliate_click_id
                                }
                            });
                            toast.success('Test Postback Successfully Fired!');
                        } else if (statusResponse.status === 'failed') {
                            clearInterval(pollInterval);
                            setLoading(false);
                            setResult(prev => ({
                                ...prev,
                                success: false,
                                status: 'error',
                                error: statusResponse.result?.error || 'Test failed on server side',
                                message: 'Test failed.'
                            }));
                            toast.error('Test Failed.');
                        } else if (statusResponse.status === 'expired' || attempts >= maxAttempts) {
                            clearInterval(pollInterval);
                            setLoading(false);
                            setResult(prev => ({
                                ...prev,
                                status: 'timeout',
                                message: 'Test timed out. The click might not have reached the tracker.'
                            }));
                            toast.warning('Test timed out. Check your tracking URL.');
                        }
                    }
                } catch (pollErr) {
                    console.error('Polling error:', pollErr);
                }
            }, 2000);

        } catch (error) {
            setResult({
                success: false,
                error: error.message || 'Failed to start test',
                timestamp: new Date().toISOString(),
                status: 'error'
            });
            toast.error('Test failed: ' + (error.message || 'Unknown error'));
            setLoading(false);
        }
    };


    const copyToClipboard = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const postbackUrl = selectedAffiliate?.global_postback_url || selectedAffiliate?.postbackUrl || 'Not Configured';

    return (
        <div className="affiliate-page">
            <div className="affiliate-header">
                <div className="affiliate-header-left">
                    <h1>Postback Testing</h1>
                    <p className="subtitle">Test Postback Using Real Browser Click</p>
                </div>
            </div>

            <div className="postback-layout">
                {/* Configuration Panel */}
                <div className="postback-config-panel">
                    <form onSubmit={handleTest}>
                        <div className="postback-test-container">
                            <div className="postback-test-header">
                                <h2>Configuration</h2>
                                <p>Select a publisher and offer to test the complete tracking flow</p>
                            </div>

                            <div className="affiliate-form-section">
                                <div className="form-group">
                                    <label className="form-label required">Tracking URL</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        name="trackingUrl"
                                        value={formData.trackingUrl}
                                        onChange={handleChange}
                                        placeholder="https://affiliate.com/track?offer_id=...&pub_id=..."
                                        required
                                    />
                                    <small className="form-hint">
                                        Enter the complete tracking URL you want to test
                                    </small>
                                </div>

                                <div className="form-group">
                                    <label className="form-label required">Offer</label>
                                    <select
                                        className="form-control"
                                        name="offerId"
                                        value={formData.offerId}
                                        onChange={handleChange}
                                        disabled={loadingOffers}
                                        required
                                    >
                                        <option value="">
                                            {loadingOffers ? 'Loading offers...' : 'Select Offer'}
                                        </option>
                                        {offers.map(offer => (
                                            <option key={offer.id} value={offer.id}>
                                                {offer.name} ({offer.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label required">Publisher</label>
                                    <select
                                        className="form-control"
                                        name="affiliateId"
                                        value={formData.affiliateId}
                                        onChange={handleAffiliateChange}
                                        disabled={loadingAffiliates}
                                    >
                                        <option value="">
                                            {loadingAffiliates ? 'Loading publishers...' : 'Select Publisher'}
                                        </option>
                                        {affiliates.map(affiliate => (
                                            <option key={affiliate.id} value={affiliate.id}>
                                                {affiliate.companyName || affiliate.fullName || affiliate.company_name} ({affiliate.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedAffiliate && (
                                    <div className="postback-preview-box">
                                        <div className="preview-label">Configured Global Postback:</div>
                                        <div className="preview-url">{postbackUrl}</div>
                                        <div className="preview-macros">
                                            Supported: {'{rcid}'}, {'{payout}'}, {'{status}'}, {'{txid}'}
                                        </div>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">RCID (Click ID) - Optional</label>
                                    <div className="input-with-action">
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="rcid"
                                            value={formData.rcid}
                                            onChange={handleChange}
                                            placeholder="Optional: Custom tracking ID"
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-icon"
                                            onClick={generateRandomId}
                                            title="Generate Random ID"
                                        >
                                            <span style={{ fontSize: '18px' }}>↺</span>
                                        </button>
                                    </div>
                                    <small className="form-hint">
                                        Optional: Add a custom tracking ID (will be appended as tid parameter)
                                    </small>
                                </div>
                            </div>

                            <div className="affiliate-form-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loading || !formData.trackingUrl}
                                >
                                    {loading ? 'Opening...' : 'Fire Test'}
                                </button>
                            </div>

                            <div className="info-box">
                                <div className="info-icon">ℹ️</div>
                                <div className="info-content">
                                    <strong>How it works:</strong>
                                    <ol>
                                        <li>Enter your tracking URL above</li>
                                        <li>Click "Fire Test" to open the URL in a new tab</li>
                                        <li>The browser will follow the real redirect chain: Publisher → Tracker → Advertiser</li>
                                        <li>A real click will be recorded in the database</li>
                                        <li>If a conversion fires, the postback will be triggered automatically</li>
                                        <li>Return here to monitor postback logs and conversion status</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Results Panel */}
                <div className="postback-results-panel">
                    {result ? (
                        <div className={`postback-result-card ${result.success ? 'success' : 'error'} ${result.mode === 'BROWSER_CLICK' ? 'browser-mode' : ''}`}>
                            <div className="result-header">
                                <h3>Test Status</h3>
                                <div className="result-meta">
                                    {result.mode === 'BROWSER_CLICK' && <span className="badge browser-mode">BROWSER CLICK</span>}
                                    <span className="timestamp">{new Date(result.timestamp).toLocaleTimeString()}</span>
                                </div>
                            </div>

                            <div className="result-body">
                                {result.mode === 'BROWSER_CLICK' ? (
                                    <>
                                        <div className="result-item">
                                            <label>Tracking URL Opened</label>
                                            <div className="code-block url">
                                                {result.url}
                                                <button className="copy-btn" onClick={() => copyToClipboard(result.url)}>
                                                    <CopyIcon />
                                                </button>
                                            </div>
                                        </div>

                                        {result.conversion && (
                                            <>
                                                <div className="result-item">
                                                    <label>Test Conversion Details</label>
                                                    <div className="conversion-details">
                                                        <div className="detail-row">
                                                            <span className="detail-label">Conversion ID:</span>
                                                            <span className="detail-value">{result.conversion.conversion_id}</span>
                                                        </div>
                                                        <div className="detail-row">
                                                            <span className="detail-label">Click ID:</span>
                                                            <span className="detail-value">{result.conversion.click_id}</span>
                                                        </div>
                                                        <div className="detail-row">
                                                            <span className="detail-label">Publisher Click ID:</span>
                                                            <span className="detail-value">{result.conversion.affiliate_click_id || 'N/A'}</span>
                                                        </div>
                                                        <div className="detail-row">
                                                            <span className="detail-label">Status:</span>
                                                            <span className="detail-value status-approved">
                                                                {result.conversion.status}
                                                                {(result.conversion.is_test || (parseFloat(result.conversion.payout || 0) === 0 && parseFloat(result.conversion.amount || 0) === 0)) && (
                                                                    <span className="badge test" style={{ marginLeft: '6px', background: '#fef3c7', color: '#92400e', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>TEST</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="detail-row">
                                                            <span className="detail-label">Payout:</span>
                                                            <span className="detail-value">${result.conversion.payout}</span>
                                                        </div>
                                                        <div className="detail-row">
                                                            <span className="detail-label">Is Test:</span>
                                                            <span className="detail-value test-badge">✓ TEST</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {result.conversion.postback && (
                                                    <div className="result-item">
                                                        <label>Postback Result</label>
                                                        {result.conversion.postback.error ? (
                                                            <div className="postback-error">
                                                                <span className="error-icon">⚠️</span>
                                                                <span>{result.conversion.postback.error}</span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="code-block url">
                                                                    {result.conversion.postback.url}
                                                                    <button className="copy-btn" onClick={() => copyToClipboard(result.conversion.postback.url)}>
                                                                        <CopyIcon />
                                                                    </button>
                                                                </div>
                                                                <div className="postback-stats">
                                                                    <div className="stat-item">
                                                                        <span className="stat-label">Status:</span>
                                                                        <span className={`stat-value ${result.conversion.postback.status >= 200 && result.conversion.postback.status < 300 ? 'success' : 'error'}`}>
                                                                            {result.conversion.postback.status}
                                                                        </span>
                                                                    </div>
                                                                    <div className="stat-item">
                                                                        <span className="stat-label">Latency:</span>
                                                                        <span className="stat-value">{result.conversion.postback.latency_ms}ms</span>
                                                                    </div>
                                                                </div>
                                                                {result.conversion.postback.response && (
                                                                    <div className="postback-response">
                                                                        <label>Response:</label>
                                                                        <pre className="code-block response">
                                                                            {result.conversion.postback.response}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        <div className={result.status === 'completed' ? 'success-box' : result.status === 'processing' ? 'info-box' : 'instruction-box'}>
                                            <div className="instruction-icon">
                                                {result.status === 'completed' ? '✅' : result.status === 'processing' ? '⏳' : '👉'}
                                            </div>
                                            <div className="instruction-content">
                                                <h4>{result.status === 'completed' ? 'Success!' : result.status === 'processing' ? 'Processing...' : 'Next Steps:'}</h4>
                                                <p>{result.message}</p>
                                                {result.status === 'completed' && (
                                                    <p className="hint">Check the "Postback Logs" page to see the full postback history.</p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="result-item">
                                            <label>Error</label>
                                            <pre className="code-block response error">
                                                {result.error || '(Unknown error)'}

                                            </pre>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">🔗</div>
                            <h3>Ready to Test</h3>
                            <p>Select a publisher and offer assignment, then click "Open Tracking URL" to start the test.</p>
                            <p className="empty-hint">The tracking URL will open in a new tab, simulating a real user click through your tracking system.</p>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .postback-layout {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                    margin-top: 24px;
                }
                
                .postback-config-panel, .postback-results-panel {
                    display: flex;
                    flex-direction: column;
                }
                
                .postback-preview-box {
                    background: #f8f9fa;
                    border: 1px solid #e9ecef;
                    border-radius: 6px;
                    padding: 12px;
                    margin-bottom: 20px;
                    font-size: 13px;
                }
                
                .preview-label {
                    color: #6c757d;
                    font-weight: 500;
                    margin-bottom: 4px;
                }
                
                .preview-url {
                    font-family: monospace;
                    word-break: break-all;
                    color: #2c3e50;
                    background: #fff;
                    padding: 4px 8px;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    margin-bottom: 8px;
                }
                
                .preview-macros {
                    color: #17a2b8;
                    font-size: 12px;
                }

                .form-hint {
                    display: block;
                    margin-top: 4px;
                    font-size: 12px;
                    color: #6c757d;
                }

                .info-box {
                    background: #e7f3ff;
                    border: 1px solid #b3d9ff;
                    border-radius: 8px;
                    padding: 16px;
                    margin-top: 20px;
                    display: flex;
                    gap: 12px;
                }

                .info-icon {
                    font-size: 24px;
                    flex-shrink: 0;
                }

                .info-content {
                    flex: 1;
                }

                .info-content strong {
                    display: block;
                    margin-bottom: 8px;
                    color: #0066cc;
                }

                .info-content ol {
                    margin: 0;
                    padding-left: 20px;
                    font-size: 13px;
                    color: #495057;
                }

                .info-content li {
                    margin-bottom: 4px;
                }

                .instruction-box {
                    background: #fff3cd;
                    border: 1px solid #ffc107;
                    border-radius: 8px;
                    padding: 16px;
                    margin-top: 16px;
                    display: flex;
                    gap: 12px;
                }

                .instruction-icon {
                    font-size: 24px;
                    flex-shrink: 0;
                }

                .instruction-content {
                    flex: 1;
                }

                .instruction-content h4 {
                    margin: 0 0 8px 0;
                    color: #856404;
                    font-size: 16px;
                }

                .instruction-content p {
                    margin: 0 0 12px 0;
                    color: #856404;
                    font-size: 14px;
                }

                .instruction-content ul {
                    margin: 0;
                    padding-left: 20px;
                    font-size: 13px;
                    color: #856404;
                }

                .instruction-content li {
                    margin-bottom: 6px;
                }
                
                .checkbox-wrapper {
                    display: flex;
                    align-items: center;
                    padding-top: 32px;
                }
                
                .checkbox-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    user-select: none;
                }
                
                .postback-result-card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                
                .postback-result-card.success { border-top: 4px solid #10b981; }
                .postback-result-card.error { border-top: 4px solid #ef4444; }
                .postback-result-card.browser-mode { border-top: 4px solid #3b82f6; }
                
                .result-header {
                    padding: 16px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                }
                
                .result-header h3 { margin: 0; font-size: 16px; color: #1e293b; }
                
                .result-meta {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 12px;
                    color: #64748b;
                }
                
                .badge.browser-mode {
                    background: #dbeafe;
                    color: #1e40af;
                    padding: 2px 8px;
                    border-radius: 99px;
                    font-weight: 600;
                    border: 1px solid #3b82f6;
                }
                
                .result-body { padding: 20px; }
                
                .result-item { margin-bottom: 16px; }
                .result-item label {
                    display: block;
                    font-size: 12px;
                    text-transform: uppercase;
                    color: #64748b;
                    font-weight: 600;
                    margin-bottom: 6px;
                    letter-spacing: 0.5px;
                }
                
                .result-row-flex {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 16px;
                }
                
                .code-block {
                    background: #1e293b;
                    color: #e2e8f0;
                    padding: 12px;
                    border-radius: 6px;
                    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
                    font-size: 13px;
                    overflow-x: auto;
                    position: relative;
                }
                
                .code-block.url {
                    color: #38bdf8;
                    padding-right: 40px;
                }
                
                .code-block.response {
                    max-height: 300px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                }

                .code-block.response.error {
                    background: #fef2f2;
                    color: #991b1b;
                    border: 1px solid #fecaca;
                }
                
                .copy-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    padding: 4px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                }
                
                .copy-btn:hover { background: rgba(255,255,255,0.2); }
                
                .value-box {
                    font-size: 15px;
                    font-weight: 600;
                    color: #1e293b;
                    padding: 8px 12px;
                    background: #f1f5f9;
                    border-radius: 4px;
                    display: inline-block;
                    min-width: 80px;
                    text-align: center;
                }
                
                .value-box.green { color: #10b981; background: #ecfdf5; }
                .value-box.red { color: #ef4444; background: #fef2f2; }
                
                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    min-height: 400px;
                    background: #f8fafc;
                    border: 2px dashed #e2e8f0;
                    border-radius: 12px;
                    padding: 40px;
                    text-align: center;
                    color: #94a3b8;
                }
                
                .empty-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                    opacity: 0.5;
                }

                .empty-hint {
                    font-size: 13px;
                    color: #64748b;
                    margin-top: 8px;
                }

                .conversion-details {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    padding: 12px;
                }

                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #e2e8f0;
                }

                .detail-row:last-child {
                    border-bottom: none;
                }

                .detail-label {
                    font-weight: 500;
                    color: #64748b;
                    font-size: 13px;
                }

                .detail-value {
                    font-weight: 600;
                    color: #1e293b;
                    font-size: 13px;
                }

                .status-approved {
                    color: #10b981 !important;
                    text-transform: uppercase;
                }

                .test-badge {
                    background: #fef3c7;
                    color: #92400e;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 700;
                }

                .postback-stats {
                    display: flex;
                    gap: 20px;
                    margin-top: 12px;
                    padding: 12px;
                    background: #f8fafc;
                    border-radius: 6px;
                }

                .stat-item {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .stat-label {
                    font-size: 12px;
                    color: #64748b;
                    font-weight: 500;
                }

                .stat-value {
                    font-size: 14px;
                    font-weight: 600;
                    color: #1e293b;
                }

                .stat-value.success {
                    color: #10b981;
                }

                .stat-value.error {
                    color: #ef4444;
                }

                .postback-response {
                    margin-top: 12px;
                }

                .postback-response label {
                    font-size: 12px;
                    color: #64748b;
                    font-weight: 600;
                    margin-bottom: 6px;
                    display: block;
                }

                .postback-error {
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 6px;
                    padding: 12px;
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    color: #991b1b;
                }

                .error-icon {
                    font-size: 20px;
                }

                .success-box {
                    background: #ecfdf5;
                    border: 1px solid #10b981;
                    border-radius: 8px;
                    padding: 16px;
                    margin-top: 16px;
                    display: flex;
                    gap: 12px;
                }

                .success-box .instruction-content h4 {
                    color: #047857;
                }

                .success-box .instruction-content p {
                    color: #065f46;
                }

                .hint {
                    font-size: 12px;
                    opacity: 0.8;
                    margin-top: 8px;
                }
                
                @media (max-width: 1024px) {
                    .postback-layout { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}

export default PostbackTest;
