import { useState, useEffect } from 'react';
import { publisherAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import {
    EntityListHeader,
    EntityListPagination,
    EntityListSearch,
    EntityListToolbar,
} from '../../shared/ui/EntityList';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import { SkeletonList } from '../../components/Skeleton/Skeleton';
import './PublisherOffers.css';

export default function PublisherOffers() {
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, limit: LIST_PAGE_SIZE, total: 0, totalPages: 1 });
    const [selectedOffer, setSelectedOffer] = useState(null);
    const { refreshKey } = useRefresh();
    const [customParams, setCustomParams] = useState({ click_id: '{affiliate_click_id}', sub1: '', sub2: '' });
    const { showToast } = useToast();

    const fetchOffers = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await publisherAPI.getOffers({ search, page, limit: LIST_PAGE_SIZE });
            if (res.success && res.data) {
                setOffers(res.data);
                setPagination(res.pagination || { page, limit: LIST_PAGE_SIZE, total: res.data.length, totalPages: 1 });
                if (res.data.length > 0 && !selectedOffer) {
                    setSelectedOffer(res.data[0]);
                } else if (res.data.length > 0 && selectedOffer) {
                    const stillExists = res.data.find(o => o.assignment_id === selectedOffer.assignment_id);
                    if (stillExists) setSelectedOffer(stillExists);
                    else setSelectedOffer(res.data[0]);
                }
            } else {
                setError(res.message || 'Failed to load offers');
            }
        } catch (err) {
            setError(err.message || 'Error fetching offers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOffers();
    }, [search, page, refreshKey]);

    const copyToClipboard = (text, label = 'Link') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard!`, 'success');
    };

    // Build personalized link with custom macros (always keep literal {macro} unencoded for tracking systems)
    const getBuiltTrackingUrl = (offer) => {
        if (!offer || !offer.tracking_url) return '';
        try {
            // Normalize any existing encoded brackets in base tracking URL
            const cleanBase = offer.tracking_url.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
            const urlObj = new URL(cleanBase);

            // Apply custom click_id macro or parameter
            if (customParams.click_id && customParams.click_id.trim()) {
                urlObj.searchParams.set('click_id', customParams.click_id.trim());
            }

            // Apply optional sub parameters
            if (customParams.sub1 && customParams.sub1.trim()) {
                urlObj.searchParams.set('sub1', customParams.sub1.trim());
            } else {
                urlObj.searchParams.delete('sub1');
            }

            if (customParams.sub2 && customParams.sub2.trim()) {
                urlObj.searchParams.set('sub2', customParams.sub2.trim());
            } else {
                urlObj.searchParams.delete('sub2');
            }

            // Standard URL.toString() encodes { and } into %7B and %7D.
            // Performance tracking platforms require literal curly braces for macro tokens.
            return urlObj.toString()
                .replace(/%7B/gi, '{')
                .replace(/%7D/gi, '}');
        } catch (e) {
            let fallback = offer.tracking_url.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
            if (customParams.click_id && customParams.click_id.trim()) {
                fallback = fallback.replace(/click_id=[^&]*/, `click_id=${customParams.click_id.trim()}`);
            }
            if (customParams.sub1 && customParams.sub1.trim()) {
                fallback += `&sub1=${customParams.sub1.trim()}`;
            }
            if (customParams.sub2 && customParams.sub2.trim()) {
                fallback += `&sub2=${customParams.sub2.trim()}`;
            }
            return fallback.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
        }
    };

    return (
        <div className="pub-offers-view">
            <EntityListHeader
                title="Assigned Offers"
                subtitle="Offers assigned to your account, with tracking links."
            />
            <EntityListToolbar>
                <EntityListSearch
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search by offer name or ID"
                    onClear={() => { setSearch(''); setPage(1); }}
                />
            </EntityListToolbar>

            {loading ? (
                <SkeletonList rows={6} />
            ) : error ? (
                <div className="pub-error-state">
                    <p>{error}</p>
                    <button type="button" className="pub-btn-primary" onClick={fetchOffers}>Try Again</button>
                </div>
            ) : offers.length === 0 ? (
                <div className="pub-empty-card">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="empty-icon">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <h3>No Offers Assigned</h3>
                    <p>You currently do not have any active campaigns assigned. Please contact your account manager to get campaigns enabled for your account.</p>
                </div>
            ) : (
                <div className="pub-offers-layout">
                    <div>
                    {/* Left List */}
                    <div className="pub-offers-sidebar-list">
                        {offers.map((offer) => {
                            const isSelected = selectedOffer?.assignment_id === offer.assignment_id;
                            return (
                                <div
                                    key={offer.assignment_id}
                                    className={`pub-offer-row-card ${isSelected ? 'selected' : ''}`}
                                    onClick={() => setSelectedOffer(offer)}
                                >
                                    <div className="row-card-info">
                                        <div className="row-card-top">
                                            <span className="row-offer-id">#{offer.public_offer_id}</span>
                                            <span className="row-status-pill">{offer.status}</span>
                                        </div>
                                        <h4 className="row-offer-name">{offer.name}</h4>
                                        <span className="row-offer-cat">{offer.category || 'Standard Campaign'}</span>
                                    </div>
                                    <div className="row-card-payout">
                                        <span className="payout-micro">Payout</span>
                                        <span className="payout-bold">${Number(offer.payout).toFixed(2)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <EntityListPagination
                        currentPage={Number(pagination.page) || page}
                        totalPages={Number(pagination.totalPages) || 1}
                        total={Number(pagination.total) || 0}
                        itemsPerPage={Number(pagination.limit) || LIST_PAGE_SIZE}
                        onPageChange={setPage}
                    />
                    </div>

                    {/* Right Details Panel */}
                    {selectedOffer && (
                        <div className="pub-offer-detail-panel">
                            {/* Panel Top Hero */}
                            <div className="detail-hero">
                                <div>
                                    <div className="detail-tags-row">
                                        <span className="tag-id">Offer #{selectedOffer.public_offer_id}</span>
                                        <span className="tag-status">Active</span>
                                        <span className="tag-category">{selectedOffer.category || 'General'}</span>
                                    </div>
                                    <h3 className="detail-offer-title">{selectedOffer.name}</h3>
                                </div>
                                <div className="detail-payout-badge">
                                    <span className="payout-badge-label">Your Payout</span>
                                    <span className="payout-badge-val">${Number(selectedOffer.payout).toFixed(2)}</span>
                                    <span className="payout-badge-sub">per conversion</span>
                                </div>
                            </div>

                            {selectedOffer.description && (
                                <div className="detail-desc-box">
                                    <p>{selectedOffer.description}</p>
                                </div>
                            )}

                            {/* Tracking Link Box */}
                            <div className="detail-tracking-box">
                                <div className="box-header-row">
                                    <label className="box-title">Your Generated Tracking Link</label>
                                    <span className="box-badge">Click to Copy</span>
                                </div>
                                <div className="tracking-input-group">
                                    <input
                                        type="text"
                                        readOnly
                                        className="tracking-input"
                                        value={getBuiltTrackingUrl(selectedOffer)}
                                    />
                                    <button
                                        type="button"
                                        className="pub-btn-primary"
                                        onClick={() => copyToClipboard(getBuiltTrackingUrl(selectedOffer), 'Tracking URL')}
                                    >
                                        Copy Link
                                    </button>
                                </div>
                                <span className="tracking-caption">
                                    Send traffic to this URL. Pass your tracker's click ID in the <code>click_id</code> query parameter to receive postback callbacks.
                                </span>
                            </div>

                            {/* Parameter Customizer */}
                            <div className="detail-params-customizer">
                                <h4 className="customizer-heading">Tracking Link Parameters Builder</h4>
                                <div className="params-fields-row">
                                    <div className="param-field">
                                        <label className="param-lbl">Click ID Macro / Parameter</label>
                                        <input
                                            type="text"
                                            className="pub-input"
                                            placeholder="{affiliate_click_id}"
                                            value={customParams.click_id}
                                            onChange={(e) => setCustomParams({ ...customParams, click_id: e.target.value })}
                                        />
                                        <span className="param-hint">e.g. {'{affiliate_click_id}'} or {'{click_id}'}</span>
                                    </div>
                                    <div className="param-field">
                                        <label className="param-lbl">Sub ID 1 (Optional)</label>
                                        <input
                                            type="text"
                                            className="pub-input"
                                            placeholder="e.g. facebook"
                                            value={customParams.sub1}
                                            onChange={(e) => setCustomParams({ ...customParams, sub1: e.target.value })}
                                        />
                                        <span className="param-hint">Sub-campaign tracking</span>
                                    </div>
                                    <div className="param-field">
                                        <label className="param-lbl">Sub ID 2 (Optional)</label>
                                        <input
                                            type="text"
                                            className="pub-input"
                                            placeholder="e.g. adset01"
                                            value={customParams.sub2}
                                            onChange={(e) => setCustomParams({ ...customParams, sub2: e.target.value })}
                                        />
                                        <span className="param-hint">Creative or targeting ID</span>
                                    </div>
                                </div>
                            </div>

                            {/* Macro Table */}
                            <div className="detail-macros-table">
                                <h4 className="customizer-heading">Supported Tracking Macros</h4>
                                <div className="pub-table-responsive">
                                    <table className="pub-table">
                                        <thead>
                                            <tr>
                                                <th>Macro Name</th>
                                                <th>Description</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td><code>{'{affiliate_click_id}'}</code></td>
                                                <td>Your click ID from your tracking software (Recommended)</td>
                                            </tr>
                                            <tr>
                                                <td><code>{'{click_id}'}</code></td>
                                                <td>Standard click ID placeholder</td>
                                            </tr>
                                            <tr>
                                                <td><code>{'{sub1}'} ... {'{sub5}'}</code></td>
                                                <td>Custom sub parameters for source, placement, keyword tracking</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
