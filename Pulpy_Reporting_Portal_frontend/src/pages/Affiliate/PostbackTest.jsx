import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { publishersAPI } from '../../services/api';
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
    const [selectedAffiliate, setSelectedAffiliate] = useState(null);
    const [affiliates, setAffiliates] = useState([]);
    const [loadingAffiliates, setLoadingAffiliates] = useState(true);

    const [formData, setFormData] = useState({
        affiliateId: '',
        rcid: '', // affiliate_click_id
        payout: '',
        status: 'approved',
        txid: '',
        method: 'GET',
        dryRun: false
    });

    useEffect(() => {
        const fetchAffiliates = async () => {
            try {
                const response = await publishersAPI.getPublishers({ limit: 1000 });
                if (response.success) {
                    setAffiliates(response.data);
                } else {
                    toast.error('Failed to load affiliates');
                }
            } catch (error) {
                console.error('Error fetching affiliates:', error);
                toast.error('Error fetching affiliates');
            } finally {
                setLoadingAffiliates(false);
            }
        };

        fetchAffiliates();
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
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const generateRandomId = () => {
        const randomId = 'test_' + Math.random().toString(36).substr(2, 9);
        setFormData(prev => ({ ...prev, rcid: randomId }));
    };

    const handleTest = async (e) => {
        e.preventDefault();

        if (!formData.affiliateId) {
            toast.error('Please select an affiliate');
            return;
        }

        if (!selectedAffiliate?.global_postback_url && !selectedAffiliate?.postbackUrl) {
            toast.error('Selected affiliate does not have a global postback URL configured');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const payload = {
                publisher_id: formData.affiliateId,
                rcid: formData.rcid, // mapped to affiliate_click_id/click_id in backend
                payout: formData.payout ? parseFloat(formData.payout) : 0,
                status: formData.status,
                txid: formData.txid,
                method: formData.method,
                dry_run: formData.dryRun
            };

            const response = await publishersAPI.testAffiliatePostback(payload);

            if (response.success) {
                setResult({
                    success: true,
                    mode: response.mode, // DRY_RUN or null
                    url: response.fired_url,
                    method: response.method,
                    status: response.http_status,
                    body: response.response_body,
                    duration: response.execution_time_ms,
                    error: response.error,
                    timestamp: new Date().toISOString()
                });

                if (response.mode === 'DRY_RUN') {
                    toast.info('Dry run complete. URL generated but not fired.');
                } else {
                    toast.success('Test postback fired successfully');
                }
            } else {
                setResult({
                    success: false,
                    error: response.message || response.error || 'Unknown error',
                    timestamp: new Date().toISOString()
                });
                toast.error(response.message || 'Test failed');
            }
        } catch (error) {
            setResult({
                success: false,
                error: error.message || 'Connection failed',
                timestamp: new Date().toISOString()
            });
            toast.error('Postback test failed');
        } finally {
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
                    <p className="subtitle">Test Postback (Does Not Affect Real Data)</p>
                </div>
            </div>

            <div className="postback-layout">
                {/* Configuration Panel */}
                <div className="postback-config-panel">
                    <form onSubmit={handleTest}>
                        <div className="postback-test-container">
                            <div className="postback-test-header">
                                <h2>Configuration</h2>
                                <p>Simulate a conversion postback</p>
                            </div>

                            <div className="affiliate-form-section">
                                <div className="form-group">
                                    <label className="form-label required">Affiliate</label>
                                    <select
                                        className="form-control"
                                        name="affiliateId"
                                        value={formData.affiliateId}
                                        onChange={handleAffiliateChange}
                                        required
                                        disabled={loadingAffiliates}
                                    >
                                        <option value="">
                                            {loadingAffiliates ? 'Loading affiliates...' : 'Select Affiliate'}
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

                                <div className="affiliate-form-row two-col">
                                    <div className="form-group">
                                        <label className="form-label">RCID (Click ID)</label>
                                        <div className="input-with-action">
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="rcid"
                                                value={formData.rcid}
                                                onChange={handleChange}
                                                placeholder="affiliate_click_id"
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
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Payout</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="form-control"
                                            name="payout"
                                            value={formData.payout}
                                            onChange={handleChange}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className="affiliate-form-row two-col">
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            className="form-control"
                                            name="status"
                                            value={formData.status}
                                            onChange={handleChange}
                                        >
                                            <option value="approved">Approved</option>
                                            <option value="pending">Pending</option>
                                            <option value="rejected">Rejected</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Transaction ID (Optional)</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="txid"
                                            value={formData.txid}
                                            onChange={handleChange}
                                            placeholder="tx_123456"
                                        />
                                    </div>
                                </div>

                                <div className="affiliate-form-row two-col">
                                    <div className="form-group">
                                        <label className="form-label">Method</label>
                                        <select
                                            className="form-control"
                                            name="method"
                                            value={formData.method}
                                            onChange={handleChange}
                                        >
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                        </select>
                                    </div>
                                    <div className="form-group checkbox-wrapper">
                                        <label className="checkbox-item">
                                            <input
                                                type="checkbox"
                                                name="dryRun"
                                                checked={formData.dryRun}
                                                onChange={handleChange}
                                            />
                                            <span>Dry Run (Do not fire)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="affiliate-form-actions">
                                <button type="submit" className="btn btn-primary" disabled={loading || !formData.affiliateId}>
                                    {loading ? 'Processing...' : (formData.dryRun ? 'Simulate Postback' : 'Fire Test Postback')}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Results Panel */}
                <div className="postback-results-panel">
                    {result ? (
                        <div className={`postback-result-card ${result.success ? 'success' : 'error'} ${result.mode === 'DRY_RUN' ? 'dry-run' : ''}`}>
                            <div className="result-header">
                                <h3>Test Results</h3>
                                <div className="result-meta">
                                    {result.mode === 'DRY_RUN' && <span className="badge dry-run">DRY RUN</span>}
                                    <span className="timestamp">{new Date(result.timestamp).toLocaleTimeString()}</span>
                                </div>
                            </div>

                            <div className="result-body">
                                <div className="result-item">
                                    <label>Fired URL</label>
                                    <div className="code-block url">
                                        {result.url}
                                        <button className="copy-btn" onClick={() => copyToClipboard(result.url)}>
                                            <CopyIcon />
                                        </button>
                                    </div>
                                </div>

                                <div className="result-row-flex">
                                    <div className="result-item">
                                        <label>Method</label>
                                        <div className="value-box">{result.method}</div>
                                    </div>
                                    <div className="result-item">
                                        <label>Status Code</label>
                                        <div className={`value-box ${result.status >= 200 && result.status < 300 ? 'green' : 'red'}`}>
                                            {result.status || 'N/A'}
                                        </div>
                                    </div>
                                    <div className="result-item">
                                        <label>Duration</label>
                                        <div className="value-box">{result.duration ? `${result.duration}ms` : 'N/A'}</div>
                                    </div>
                                </div>

                                <div className="result-item">
                                    <label>Response Body</label>
                                    <pre className="code-block response">
                                        {result.body || result.error || '(No response body)'}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">⇋</div>
                            <h3>Ready to Test</h3>
                            <p>Configure the test parameters on the left and click Fire to see results here.</p>
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
                .postback-result-card.dry-run { border-top: 4px solid #f59e0b; }
                
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
                
                .badge.dry-run {
                    background: #fffbeb;
                    color: #d97706;
                    padding: 2px 8px;
                    border-radius: 99px;
                    font-weight: 600;
                    border: 1px solid #fbbf24;
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
                
                @media (max-width: 1024px) {
                    .postback-layout { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}

export default PostbackTest;
