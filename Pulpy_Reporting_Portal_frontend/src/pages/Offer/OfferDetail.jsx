import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { offersAPI, publishersAPI, assignmentsAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { useReportTimezone } from '../../context/ReportTimezoneContext';
import { copyToClipboard as safeCopyToClipboard } from '../../utils/clipboard';
import { formatDateTimeInTimeZone, parseDate } from '../../utils/dateTime';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import TimelineFilter from '../../components/TimelineFilter/TimelineFilter';
import { getTimelineRange } from '../../utils/timelineRange';
import {
    buildDashboardApiParams,
    formatYmdInTimeZone,
    REPORT_TIMEZONE_OPTIONS,
    userRangeYmdToBackendIstRange,
    userRangeYmdToBackendUtcMysqlRange,
} from '../../utils/reportTimezone';
import './Offer.css';

const ArrowLeftIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

const EditIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const LinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const ShareIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.7" y1="10.7" x2="15.3" y2="6.3" />
        <line x1="8.7" y1="13.3" x2="15.3" y2="17.7" />
    </svg>
);

const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const ExternalLinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const ClickIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
);

const ConversionIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
    </svg>
);

const RevenueIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
);

const RateIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
);

const OfferStatCard = ({ loading, icon, value, label, className }) => (
    <div className={`offer-stat-item ${className}`}>
        <div className="offer-stat-item-icon">
            {loading ? <span className="skeleton offer-stat-icon-skeleton" /> : icon}
        </div>
        <div className="offer-stat-item-content">
            {loading ? (
                <>
                    <span className="skeleton offer-stat-value-skeleton" />
                    <span className="skeleton offer-stat-label-skeleton" />
                </>
            ) : (
                <>
                    <span className="offer-stat-item-value">{value}</span>
                    <span className="offer-stat-item-label">{label}</span>
                </>
            )}
        </div>
    </div>
);

function OfferDetail() {
    const OFFER_TIMELINE_OPTIONS = [
        { id: 'since_created', label: 'Since Created' },
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'this_week', label: 'This Week' },
        { id: 'last_week', label: 'Last Week' },
        { id: 'this_month', label: 'This Month' },
        { id: 'last_month', label: 'Last Month' },
        { id: 'custom', label: 'Custom Range' },
    ];

    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const { reportTimezone, timezoneRevision } = useReportTimezone();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [offer, setOffer] = useState(null);
    const [publishers, setPublishers] = useState([]);
    const [loadingPublishers, setLoadingPublishers] = useState(false);
    const [offers, setOffers] = useState([]);
    const [, setAssignments] = useState([]);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [publisherAssignments, setPublisherAssignments] = useState([]);
    const [editingAssignmentIndex, setEditingAssignmentIndex] = useState(null);
    const [savingAssignments, setSavingAssignments] = useState(false);
    const [loadingTrackingUrls, setLoadingTrackingUrls] = useState({});

    // New states for granular data
    const [stats, setStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [publisherStats, setPublisherStats] = useState([]);
    const [loadingPublisherStats, setLoadingPublisherStats] = useState(false);
    const [selectedRange, setSelectedRange] = useState('today');
    const [customRange, setCustomRange] = useState({ from: '', to: '' });
    const [copiedId, setCopiedId] = useState(null); // Feedback state for copy button
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const searchContainerRef = useRef(null);
    const statsRequestRef = useRef(0);
    const publisherStatsRequestRef = useRef(0);
    const selectedTimelineRange = useMemo(() => {
        if (selectedRange === 'since_created') {
            const toUserYmd = formatYmdInTimeZone(new Date(), reportTimezone);
            const fromUserYmd = offer?.created_at
                ? formatYmdInTimeZone(new Date(offer.created_at), reportTimezone)
                : toUserYmd;
            let from = fromUserYmd;
            let to = toUserYmd;
            if (from > to) [from, to] = [to, from];
            return { from, to };
        }
        return getTimelineRange(selectedRange, customRange, reportTimezone);
    }, [selectedRange, customRange, offer?.created_at, reportTimezone]);

    const statsApiRange = useMemo(() => {
        if (selectedRange === 'since_created') {
            const toUserYmd = formatYmdInTimeZone(new Date(), reportTimezone);
            const fromUserYmd = offer?.created_at
                ? formatYmdInTimeZone(new Date(offer.created_at), reportTimezone)
                : toUserYmd;
            let a = fromUserYmd;
            let b = toUserYmd;
            if (a > b) [a, b] = [b, a];
            return userRangeYmdToBackendIstRange(a, b, reportTimezone);
        }
        if (selectedRange === 'custom' && (!selectedTimelineRange.from || !selectedTimelineRange.to)) {
            return { date_from: '', date_to: '' };
        }
        return userRangeYmdToBackendIstRange(
            selectedTimelineRange.from,
            selectedTimelineRange.to,
            reportTimezone
        );
    }, [selectedRange, selectedTimelineRange, offer?.created_at, reportTimezone]);

    const statsUtcRange = useMemo(
        () =>
            userRangeYmdToBackendUtcMysqlRange(
                selectedTimelineRange.from,
                selectedTimelineRange.to,
                reportTimezone
            ),
        [selectedTimelineRange.from, selectedTimelineRange.to, reportTimezone]
    );

    const offerStatsQueryParams = useMemo(() => {
        const base = {
            date_from: statsApiRange.date_from,
            date_to: statsApiRange.date_to,
            ...(statsUtcRange.range_start_utc && statsUtcRange.range_end_utc
                ? {
                    range_start_utc: statsUtcRange.range_start_utc,
                    range_end_utc: statsUtcRange.range_end_utc,
                }
                : {}),
        };
        return buildDashboardApiParams(base, reportTimezone);
    }, [statsApiRange.date_from, statsApiRange.date_to, statsUtcRange, reportTimezone]);

    useEffect(() => {
        const fetchOfferDetails = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await offersAPI.getOffer(id);
                if (response.success && response.data) {
                    setOffer(response.data);
                } else {
                    setError('Offer not found');
                }
            } catch (err) {
                console.error('Fetch offer error:', err);
                setError(err.message || 'Failed to load offer details');
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchOfferDetails();
        }
    }, [id, refreshKey]);

    useEffect(() => {
        if (!id) return;
        if (selectedRange === 'custom' && (!selectedTimelineRange.from || !selectedTimelineRange.to)) {
            setStats(null);
            return;
        }

        const timer = setTimeout(async () => {
            const requestId = ++statsRequestRef.current;
            try {
                setLoadingStats(true);
                setStats(null);

                const response = await offersAPI.getOfferStats(id, offerStatsQueryParams);

                if (requestId !== statsRequestRef.current) return;
                if (response.success) {
                    setStats(response.data || null);
                } else {
                    setStats(null);
                }
            } catch (statsError) {
                if (requestId !== statsRequestRef.current) return;
                console.error('Error fetching offer stats:', statsError);
                setStats(null);
            } finally {
                if (requestId === statsRequestRef.current) {
                    setLoadingStats(false);
                }
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [id, refreshKey, selectedRange, offerStatsQueryParams, reportTimezone, timezoneRevision]);

    useEffect(() => {
        if (!id) return;
        if (selectedRange === 'custom' && (!selectedTimelineRange.from || !selectedTimelineRange.to)) {
            setPublisherStats([]);
            return;
        }

        const timer = setTimeout(async () => {
            const requestId = ++publisherStatsRequestRef.current;
            try {
                setLoadingPublisherStats(true);
                const response = await offersAPI.getOfferPublisherStats(id, offerStatsQueryParams);

                if (requestId !== publisherStatsRequestRef.current) return;
                if (response.success) {
                    setPublisherStats(Array.isArray(response.data) ? response.data : []);
                } else {
                    setPublisherStats([]);
                }
            } catch (publisherStatsError) {
                if (requestId !== publisherStatsRequestRef.current) return;
                console.error('Error fetching offer publisher stats:', publisherStatsError);
                setPublisherStats([]);
            } finally {
                if (requestId === publisherStatsRequestRef.current) {
                    setLoadingPublisherStats(false);
                }
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [id, refreshKey, selectedRange, offerStatsQueryParams, reportTimezone, timezoneRevision]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 350);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        const fetchSearchResults = async () => {
            if (!debouncedSearchTerm) {
                setSearchResults([]);
                setSearchLoading(false);
                return;
            }

            try {
                setSearchLoading(true);
                const response = await offersAPI.searchOffers({ q: debouncedSearchTerm, limit: 8 });
                if (response.success) {
                    setSearchResults(response.data || []);
                } else {
                    setSearchResults([]);
                }
            } catch (searchError) {
                console.error('Error searching offers:', searchError);
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        };

        fetchSearchResults();
    }, [debouncedSearchTerm]);

    useEffect(() => {
        const onDocumentClick = (event) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
                setShowSearchResults(false);
            }
        };

        document.addEventListener('mousedown', onDocumentClick);
        return () => document.removeEventListener('mousedown', onDocumentClick);
    }, []);

    // Fetch publishers
    useEffect(() => {
        const fetchPublishers = async () => {
            try {
                setLoadingPublishers(true);
                const [publishersRes, offersRes] = await Promise.all([
                    publishersAPI.getPublishers({ status: 'active', limit: 100 }),
                    offersAPI.getOffers({ limit: 100 })
                ]);
                if (publishersRes.success && publishersRes.data) {
                    setPublishers(publishersRes.data);
                }
                if (offersRes.success && Array.isArray(offersRes.data)) {
                    setOffers(offersRes.data);
                }
            } catch (error) {
                console.error('Error fetching publishers or offers:', error);
                toast.error('Failed to load publishers or offers');
            } finally {
                setLoadingPublishers(false);
            }
        };

        fetchPublishers();
    }, [toast, refreshKey]);

    // Fetch assignments for this offer only (use offer-specific endpoint so we only get this offer's assignments and correct tracking URLs)
    useEffect(() => {
        const fetchAssignments = async () => {
            if (!id) return;
            try {
                setLoadingAssignments(true);
                const response = await offersAPI.getOfferAssignments(id);
                if (response.success && response.data) {
                    setAssignments(response.data);
                    const initialAssignments = await Promise.all(
                        response.data.map(async (assignment) => {
                            let trackingUrl = '';
                            if (assignment.id) {
                                try {
                                    const trackingResponse = await assignmentsAPI.getTrackingUrl(assignment.id, { for_offer_public_id: id });
                                    if (trackingResponse.success) {
                                        trackingUrl = trackingResponse.data.tracking_url;
                                    }
                                } catch (error) {
                                    console.error(`Error fetching tracking URL for assignment ${assignment.id}:`, error);
                                }
                            }
                            return {
                                offer_id: assignment.offer_id?.toString() || '',
                                publisher_id: assignment.publisher_id,
                                publisher_email: assignment.publisher_email,
                                payout_override: assignment.payout_override ?? null,
                                conversion_approval_percentage: assignment.conversion_approval_percentage || '',
                                capping_type: assignment.capping_type || 'none',
                                capping_duration: assignment.capping_duration || 'daily',
                                capping_amount: assignment.capping_amount || '',
                                capping_action: assignment.capping_action || 'stop',
                                callback_url: assignment.callback_url || '',
                                offer_url: assignment.destination_url || assignment.offer_url || '',
                                notes: assignment.notes || '',
                                status: assignment.status || 'active',
                                assignment_id: assignment.id,
                                tracking_url: trackingUrl,
                                selectedTokens: []
                            };
                        })
                    );
                    setPublisherAssignments(initialAssignments);
                }
            } catch (error) {
                console.error('Error fetching assignments:', error);
                toast.error('Failed to load assignments');
            } finally {
                setLoadingAssignments(false);
            }
        };

        fetchAssignments();
    }, [id, toast, refreshKey]);

    if (loading) {
        return (
            <div className="offer-page">
                <SkeletonDetail sections={4} />
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div className="offer-page">
                <div className="error-state" style={{ textAlign: 'center', padding: '50px' }}>
                    <p style={{ color: '#F44336', marginBottom: '20px' }}>Error: {error || 'Offer not found'}</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/offer/list')}
                    >
                        Back to Offers
                    </button>
                </div>
            </div>
        );
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = parseDate(dateString);
        if (!date) return '-';
        return date.toLocaleDateString('en-US', {
            timeZone: reportTimezone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        return formatDateTimeInTimeZone(dateString, reportTimezone, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }, 'en-US');
    };

    const reportTzLabel =
        REPORT_TIMEZONE_OPTIONS.find((o) => o.id === reportTimezone)?.label ?? reportTimezone;

    const safeParseJson = (value) => {
        if (!value) return null;
        if (typeof value === 'object') return value;
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    };

    const buildAssignmentShareText = (offerObj, assignmentObj) => {
        const conversionModel = offerObj?.advertiser_model || offerObj?.affiliate_model || '-';
        const country = offerObj?.country || '-';
        const carrierName = offerObj?.carrier_name && String(offerObj.carrier_name).trim();
        const carrierJson = safeParseJson(offerObj?.carrier_targeting_json);
        const carrierFromJson =
            (carrierJson?.carrier && Array.isArray(carrierJson.carrier) && carrierJson.carrier.length > 0)
                ? carrierJson.carrier.join(', ')
                : null;
        const carrier = carrierName || carrierFromJson || '-';

        const payoutOverride = assignmentObj?.payout_override;
        const hasPayoutOverride =
            payoutOverride !== null &&
            payoutOverride !== undefined &&
            String(payoutOverride).trim() !== '';
        const payout = hasPayoutOverride ? payoutOverride : (offerObj?.affiliate_amount ?? '-');
        const categories = offerObj?.category || '-';
        const trackingLink = assignmentObj?.tracking_url || '-';
        const previewLink = offerObj?.preview_url || '-';
        const billingFlow = offerObj?.billing_flow || '-';
        const billingType = offerObj?.billing_type || '-';
        

        return [
            `Offer:  ${offerObj?.name || '-'}`,
            `Conversion model: ${conversionModel}`,
            `Country:  ${country}`,
            `Carrier:  ${carrier}`,
            `Payout: ${payout}`,
            `Billing flow: ${billingFlow}`,
            `Billing type: ${billingType}`,
            `Preview link: ${previewLink}`,
            `Categories: ${categories}`,
            `Tracking link: ${trackingLink}`,
        ].join('\n');
    };

    const formatConversionStatus = (status) => {
        if (!status) return '-';
        const normalized = String(status).toLowerCase();
        if (normalized === 'click_expired') return 'Rejected (Click Expired)';
        if (normalized === 'rejected_cap') return 'Rejected (Cap Hit)';
        return String(status).replace(/_/g, ' ');
    };

    const getStatusClass = (status) => {
        if (!status) return '';
        return String(status).toLowerCase().replace(/\s+/g, '_');
    };

    const formatNumber = (value) => {
        const num = Number(value || 0);
        return num.toLocaleString('en-US');
    };

    const formatCurrency = (value) => {
        const amount = Number(value || 0);
        return `${offer.offer_currency} ${amount.toFixed(2)}`;
    };

    const statsCards = [
        { key: 'clicks', label: 'Total Clicks', value: formatNumber(stats?.total_clicks), className: 'stat-item-purple', icon: <ClickIcon /> },
        { key: 'conversions', label: 'Total Conversions', value: formatNumber(stats?.total_conversions), className: 'stat-item-teal', icon: <ConversionIcon /> },
        { key: 'approved', label: 'Approved Conversions', value: formatNumber(stats?.approved_conversions), className: 'stat-item-green', icon: <ConversionIcon /> },
        { key: 'pending', label: 'Pending Conversions', value: formatNumber(stats?.pending_conversions), className: 'stat-item-amber', icon: <ConversionIcon /> },
        { key: 'rejected', label: 'Rejected Conversions', value: formatNumber(stats?.rejected_conversions), className: 'stat-item-red', icon: <ConversionIcon /> },
        { key: 'click-expired', label: 'Click Expired', value: formatNumber(stats?.click_expired_conversions || stats?.click_expired || 0), className: 'stat-item-neutral', icon: <ConversionIcon /> },
        { key: 'conversion-rate', label: 'Conversion Rate', value: `${Number(stats?.conversion_rate || 0).toFixed(2)}%`, className: 'stat-item-amber', icon: <RateIcon /> },
        { key: 'revenue', label: 'Total Revenue', value: formatCurrency(stats?.total_revenue), className: 'stat-item-red', icon: <RevenueIcon /> },
        { key: 'payout', label: 'Payout', value: formatCurrency(stats?.approved_payout), className: 'stat-item-green', icon: <RevenueIcon /> },
        { key: 'profit', label: 'Total Profit', value: formatCurrency(stats?.total_profit), className: 'stat-item-profit', icon: <RevenueIcon /> },
    ];

    return (
        <div className="offer-page">
            <div className="offer-header">
                <div className="offer-header-left">
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate(-1)}
                        style={{ marginRight: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <ArrowLeftIcon />
                        Back
                    </button>
                    <div>
                        <h1>{offer.name}</h1>
                        <p>Offer ID: {offer.public_offer_id || offer.display_id} | Status: <span className={`offer-status ${offer.status?.toLowerCase()}`}>{offer.status}</span></p>
                    </div>
                </div>
                <div className="offer-header-actions">
                    <div className="offer-search offer-detail-search" ref={searchContainerRef}>
                        <SearchIcon />
                        <input
                            type="text"
                            placeholder="Search offers and jump..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onFocus={() => setShowSearchResults(true)}
                        />
                        {showSearchResults && (
                            <div className="offer-detail-search-dropdown">
                                {searchLoading ? (
                                    <div className="offer-detail-search-item muted">Searching...</div>
                                ) : !debouncedSearchTerm ? (
                                    <div className="offer-detail-search-item muted">Type to search offers</div>
                                ) : debouncedSearchTerm && searchResults.length === 0 ? (
                                    <div className="offer-detail-search-item muted">No offers found</div>
                                ) : (
                                    searchResults.map((result) => {
                                        const offerPublicId = result.public_offer_id || result.display_id;
                                        return (
                                            <button
                                                key={result.id}
                                                type="button"
                                                className="offer-detail-search-item"
                                                onClick={() => {
                                                    setShowSearchResults(false);
                                                    setSearchTerm('');
                                                    setDebouncedSearchTerm('');
                                                    navigate(`/offer/detail/${offerPublicId}`);
                                                }}
                                            >
                                                <span className="result-name">{result.name}</span>
                                                <span className="result-meta">ID: {offerPublicId} | {result.status}</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                    <Link to={`/offer/edit/${offer.public_offer_id || offer.display_id}`} className="btn btn-primary">
                        <EditIcon />
                        <span>Edit Offer</span>
                    </Link>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            // Scroll to publisher section
                            const element = document.getElementById('publisherSection');
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }}
                    >
                        <EyeIcon />
                        View Publishers
                    </button>
                </div>
            </div>

            <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div>
                        <h2 style={{ marginBottom: '4px', fontSize: '20px', fontWeight: '600' }}>Performance Overview</h2>
                        <div style={{ color: '#64748b', fontSize: '12px' }}>Metrics use {reportTzLabel} day boundaries</div>
                    </div>
                    <TimelineFilter
                        value={selectedRange}
                        options={OFFER_TIMELINE_OPTIONS}
                        customRange={customRange}
                        onPresetChange={setSelectedRange}
                        onCustomRangeChange={setCustomRange}
                    />
                </div>

                <div className="offer-stats-cards-box">
                    <div className="offer-stats-cards-inner">
                        {statsCards.map((card) => (
                            <OfferStatCard
                                key={card.key}
                                loading={loadingStats}
                                icon={card.icon}
                                value={card.value}
                                label={card.label}
                                className={card.className}
                            />
                        ))}
                    </div>
                </div>
                {!loadingStats && !stats && (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', border: '1px dashed #d1d5db', borderRadius: '8px', marginTop: '12px' }}>
                        No data available for this timeline.
                    </div>
                )}
            </div>

            <div className="offer-two-column-grid">
                {/* Basic Information */}
                <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Basic Information</h2>
                    <div className="detail-grid" style={{ display: 'grid', gap: '15px' }}>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Name:</span>
                            <span className="detail-value" style={{ fontWeight: '500' }}>{offer.name}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Description:</span>
                            <span className="detail-value">{offer.description || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Category:</span>
                            <span className="detail-value">{offer.category}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Status:</span>
                            <span className={`offer-status ${offer.status?.toLowerCase()}`}>{offer.status}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Country:</span>
                            <span className="detail-value">{offer.country}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Currency:</span>
                            <span className="detail-value">{offer.offer_currency}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Billing Flow:</span>
                            <span className="detail-value">{offer.billing_flow || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Billing Type:</span>
                            <span className="detail-value">{offer.billing_type || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Carrier name:</span>
                            <span className="detail-value">{offer.carrier_name || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Start Date:</span>
                            <span className="detail-value">{formatDate(offer.start_date)}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>End Date:</span>
                            <span className="detail-value">{formatDate(offer.end_date)}</span>
                        </div>
                    </div>
                </div>

                {/* Pricing Information */}
                <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Pricing Information</h2>
                    <div className="detail-grid" style={{ display: 'grid', gap: '15px' }}>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Advertiser Model:</span>
                            <span className="detail-value">{offer.advertiser_model}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Advertiser Amount:</span>
                            <span className="detail-value" style={{ fontWeight: '600', color: '#2196F3' }}>{offer.offer_currency} {offer.advertiser_amount}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Publisher Model:</span>
                            <span className="detail-value">{offer.affiliate_model}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Publisher Amount:</span>
                            <span className="detail-value" style={{ fontWeight: '600', color: '#4CAF50' }}>{offer.offer_currency} {offer.affiliate_amount}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Offer URL:</span>
                            <span className="detail-value">
                                <a href={offer.offer_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2196F3' }}>
                                    {offer.offer_url}
                                </a>
                            </span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Preview offer URL:</span>
                            <span className="detail-value">
                                {offer.preview_url ? (
                                    <a href={offer.preview_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2196F3' }}>
                                        {offer.preview_url}
                                    </a>
                                ) : '-'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Advertiser Information */}
            {offer.advertiser && (
                <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Advertiser Information</h2>
                    <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Name:</span>
                            <span className="detail-value">{offer.advertiser.name}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Email:</span>
                            <span className="detail-value">{offer.advertiser.email}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Company:</span>
                            <span className="detail-value">{offer.advertiser.company_name}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label" style={{ color: '#666', fontSize: '14px' }}>Status:</span>
                            <span className={`offer-status ${offer.advertiser.status?.toLowerCase()}`}>{offer.advertiser.status}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Publisher Stats</h2>
                {loadingPublisherStats ? (
                    <div className="loading-spinner-small" style={{ display: 'block', margin: '20px auto' }}></div>
                ) : publisherStats.length > 0 ? (
                    <div className="offer-table-container">
                        <table className="offer-table">
                            <thead>
                                <tr>
                                    <th>Publisher</th>
                                    <th>Clicks</th>
                                    <th>Total Conv</th>
                                    <th>Pending Conv</th>
                                    <th>Approved Conv</th>
                                    <th>Approved Payout</th>
                                    <th>Total Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {publisherStats.map((pub) => (
                                    <tr key={pub.publisher_id}>
                                        <td>{pub.publisher_name || pub.publisher_email || '-'}</td>
                                        <td>{formatNumber(pub.clicks)}</td>
                                        <td>{formatNumber(pub.conversions)}</td>
                                        <td>{formatNumber(pub.pending_conversions)}</td>
                                        <td>{formatNumber(pub.approved_conversions)}</td>
                                        <td>{formatCurrency(pub.approved_payout)}</td>
                                        <td>{formatCurrency(pub.total_profit)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', border: '1px dashed #d1d5db', borderRadius: '8px' }}>
                        No publisher stats available for this timeline.
                    </div>
                )}
            </div>

            {/* Publisher Assignments Management */}
            <div id="publisherSection" className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Publisher Assignments</h2>
                    <span style={{ fontSize: '14px', color: '#666' }}>{publisherAssignments.length} Publisher(s)</span>
                </div>

                {/* Add Publisher */}
                <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">Add Publisher</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <select
                            className="form-control"
                            value={''}
                            onChange={(e) => {
                                if (e.target.value) {
                                    const publisherId = e.target.value; // Public ID is string/number
                                    const publisher = publishers.find(p => String(p.public_publisher_id) === String(publisherId));
                                    if (publisher && !publisherAssignments.find(a => String(a.publisher_id) === String(publisherId))) {
                                        setPublisherAssignments(prev => [...prev, {
                                            publisher_id: publisher.public_publisher_id,
                                            publisher_email: publisher.email,
                                            payout_override: '',
                                            conversion_approval_percentage: '',
                                            capping_type: 'none',
                                            capping_duration: 'daily',
                                            capping_amount: '',
                                            capping_action: 'stop',
                                            callback_url: '',
                                            offer_url: '',
                                            notes: '',
                                            status: 'active',
                                            assignment_id: null,
                                            tracking_url: '',
                                            selectedTokens: []
                                        }]);
                                    }
                                    e.target.value = '';
                                }
                            }}
                            disabled={loadingPublishers}
                            style={{ flex: 1 }}
                        >
                            <option value="">Select Publisher to Add</option>
                            {publishers
                                .filter(p => !publisherAssignments.find(a => String(a.publisher_id) === String(p.public_publisher_id)))
                                .map(p => (
                                    <option key={p.id} value={p.public_publisher_id}>
                                        {p.first_name} ({p.email}) - {p.company_name}
                                    </option>
                                ))}
                        </select>
                    </div>
                </div>

                {/* Publisher Assignments List */}
                {loadingAssignments ? (
                    <div className="loading-spinner-small" style={{ display: 'block', margin: '20px auto' }}></div>
                ) : publisherAssignments.length > 0 ? (
                    <div className="publisher-list-container">
                        <div className="publisher-list-header">
                            <div>Publisher Details</div>
                            <div>Tracking Link</div>
                            <div style={{ textAlign: 'right' }}>Actions</div>
                        </div>

                        {publisherAssignments.map((assignment, index) => {
                            const publisher = publishers.find(p =>
                                String(p.public_publisher_id) === String(assignment.publisher_id) ||
                                String(p.id) === String(assignment.publisher_id) // Fallback for old/internal ID
                            );
                            const isEditing = editingAssignmentIndex === index;
                            const assignmentId = assignment.assignment_id || `temp-${index}`;

                            if (isEditing) {
                                return (
                                    <div key={index} className="publisher-row editing">
                                        <div className="edit-form-grid">
                                            {/* Offer & Publisher selectors to mirror Assignment edit page */}
                                            <div className="form-group">
                                                <label className="form-label required">Offer</label>
                                                <select
                                                    className="form-control"
                                                    value={assignment.offer_id || (offer?.id?.toString() || '')}
                                                    onChange={(e) => {
                                                        const updated = [...publisherAssignments];
                                                        updated[index].offer_id = e.target.value;
                                                        setPublisherAssignments(updated);
                                                    }}
                                                >
                                                    <option value="">Select an offer</option>
                                                    {offers.map(o => (
                                                        <option key={o.id} value={o.id}>
                                                            {o.name} ({o.category})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label className="form-label required">Publisher</label>
                                                <select
                                                    className="form-control"
                                                    value={assignment.publisher_id || ''}
                                                    onChange={(e) => {
                                                        const updated = [...publisherAssignments];
                                                        updated[index].publisher_id = e.target.value;
                                                        setPublisherAssignments(updated);
                                                    }}
                                                >
                                                    <option value="">Select a publisher</option>
                                                    {publishers.map(p => (
                                                        <option key={p.id} value={p.public_publisher_id || p.id}>
                                                            {p.first_name} ({p.email})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label className="form-label">Payout Override</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-control"
                                                    value={assignment.payout_override}
                                                    onChange={(e) => {
                                                        const updated = [...publisherAssignments];
                                                        updated[index].payout_override = e.target.value;
                                                        setPublisherAssignments(updated);
                                                    }}
                                                    placeholder="Default"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Conv. Approval %</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-control"
                                                    value={assignment.conversion_approval_percentage}
                                                    onChange={(e) => {
                                                        const updated = [...publisherAssignments];
                                                        updated[index].conversion_approval_percentage = e.target.value;
                                                        setPublisherAssignments(updated);
                                                    }}
                                                    placeholder="Default"
                                                />
                                            </div>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', marginTop: '10px', color: '#555' }}>Capping & Budget</h4>
                                                <div className="offer-form-row three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label">Capping Type</label>
                                                        <select
                                                            className="form-control"
                                                            value={assignment.capping_type}
                                                            onChange={(e) => {
                                                                const updated = [...publisherAssignments];
                                                                updated[index].capping_type = e.target.value;
                                                                setPublisherAssignments(updated);
                                                            }}
                                                        >
                                                            <option value="none">None</option>
                                                            <option value="budget">Budget Cap</option>
                                                            <option value="conversion">Conversion Cap</option>
                                                        </select>
                                                    </div>
                                                    {assignment.capping_type !== 'none' && (
                                                        <>
                                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                                <label className="form-label">Duration</label>
                                                                <select
                                                                    className="form-control"
                                                                    value={assignment.capping_duration}
                                                                    onChange={(e) => {
                                                                        const updated = [...publisherAssignments];
                                                                        updated[index].capping_duration = e.target.value;
                                                                        setPublisherAssignments(updated);
                                                                    }}
                                                                >
                                                                    <option value="daily">Daily</option>
                                                                    <option value="weekly">Weekly</option>
                                                                    <option value="monthly">Monthly</option>
                                                                </select>
                                                            </div>
                                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                                <label className="form-label">Amount</label>
                                                                <input
                                                                    type="number"
                                                                    className="form-control"
                                                                    value={assignment.capping_amount}
                                                                    onChange={(e) => {
                                                                        const updated = [...publisherAssignments];
                                                                        updated[index].capping_amount = e.target.value;
                                                                        setPublisherAssignments(updated);
                                                                    }}
                                                                    placeholder="Limit"
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                {assignment.capping_type !== 'none' && (
                                                    <div className="form-group" style={{ marginTop: '10px' }}>
                                                        <label className="form-label">Action when Exceeded</label>
                                                        <select
                                                            className="form-control"
                                                            value={assignment.capping_action}
                                                            onChange={(e) => {
                                                                const updated = [...publisherAssignments];
                                                                updated[index].capping_action = e.target.value;
                                                                setPublisherAssignments(updated);
                                                            }}
                                                        >
                                                            <option value="stop">Stop (Traffic Blocked)</option>
                                                            <option value="reject">Reject (Conversions Rejected)</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Callback URL</label>
                                                <input
                                                    type="url"
                                                    className="form-control"
                                                    value={assignment.callback_url}
                                                    onChange={(e) => {
                                                        const updated = [...publisherAssignments];
                                                        updated[index].callback_url = e.target.value;
                                                        setPublisherAssignments(updated);
                                                    }}
                                                    placeholder="https://..."
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Status</label>
                                                <select
                                                    className="form-control"
                                                    value={assignment.status}
                                                    onChange={(e) => {
                                                        const updated = [...publisherAssignments];
                                                        updated[index].status = e.target.value;
                                                        setPublisherAssignments(updated);
                                                    }}
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                </select>
                                            </div>
                                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                                <button className="btn btn-primary btn-sm" onClick={() => setEditingAssignmentIndex(null)}>
                                                    Done Editing
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={index} className="publisher-row">
                                    {/* Column 1: Info (Secondary Hierarchy) */}
                                    <div className="publisher-info-col">
                                        <div className="publisher-main-info">
                                            <span className={`status-indicator ${assignment.status === 'active' ? 'active' : 'inactive'}`}></span>
                                            <div className="publisher-name">
                                                {publisher ? `${publisher.first_name} ${publisher.last_name || ''}` : assignment.publisher_email}
                                            </div>
                                        </div>
                                        {publisher && <div className="publisher-company">{publisher.company_name}</div>}

                                        <div className="publisher-meta-row">
                                            <span className="meta-item">
                                                {assignment.payout_override ? (
                                                    <span className="meta-badge" style={{ color: '#2196F3', background: 'rgba(33, 150, 243, 0.1)' }}>
                                                        Payout: {offer.offer_currency} {assignment.payout_override}
                                                    </span>
                                                ) : (
                                                    <span className="meta-badge">Default Payout</span>
                                                )}
                                            </span>
                                            {assignment.capping_type && assignment.capping_type !== 'none' && (
                                                <>
                                                    <span className="meta-badge" style={{ color: '#FF9800', background: 'rgba(255, 152, 0, 0.1)' }}>
                                                        {assignment.capping_type === 'budget' ? 'Budget' : 'Conv'} Cap: {assignment.capping_amount} ({assignment.capping_duration})
                                                    </span>
                                                    <span className="meta-badge" style={{ color: '#e91e63', background: 'rgba(233, 30, 99, 0.1)', marginLeft: '6px' }}>
                                                        Action: {assignment.capping_action}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 2: Tracking URL (Primary Visual) */}
                                    <div className="tracking-col">
                                        {assignment.assignment_id ? (
                                            loadingTrackingUrls[assignment.assignment_id] ? (
                                                <div className="url-skeleton"></div>
                                            ) : assignment.tracking_url ? (
                                                <div className={`tracking-url-wrapper has-url`}>
                                                    <div className="tracking-url-display">
                                                        {assignment.tracking_url}
                                                    </div>
                                                    <button
                                                        className={`copy-btn ${copiedId === assignmentId ? 'copied' : ''}`}
                                                        onClick={async () => {
                                                            const result = await safeCopyToClipboard(assignment.tracking_url);
                                                            if (result.success) {
                                                                setCopiedId(assignmentId);
                                                                setTimeout(() => setCopiedId(null), 2000);
                                                            } else {
                                                                toast.error('Failed to copy');
                                                            }
                                                        }}
                                                        title="Copy Tracking Link"
                                                    >
                                                        {copiedId === assignmentId ? (
                                                            <>
                                                                <CheckIcon />
                                                                <span>Copied</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CopyIcon />
                                                                <span>Copy</span>
                                                            </>
                                                        )}
                                                    </button>
                                                    <button
                                                        className="copy-btn generate"
                                                        onClick={() => window.open(assignment.tracking_url, '_blank')}
                                                        title="Open Tracking Link"
                                                        style={{ marginLeft: '8px' }}
                                                    >
                                                        <ExternalLinkIcon />
                                                        <span>Open</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="copy-btn generate"
                                                    onClick={async () => {
                                                        try {
                                                            setLoadingTrackingUrls(prev => ({ ...prev, [assignment.assignment_id]: true }));
                                                            const trackingResponse = await assignmentsAPI.getTrackingUrl(assignment.assignment_id, { for_offer_public_id: id });
                                                            if (trackingResponse.success && trackingResponse.data) {
                                                                const updated = [...publisherAssignments];
                                                                updated[index].tracking_url = trackingResponse.data.tracking_url;
                                                                setPublisherAssignments(updated);
                                                            }
                                                        } catch (error) {
                                                            console.error(error);
                                                            toast.error('Failed to generate link');
                                                        } finally {
                                                            setLoadingTrackingUrls(prev => ({ ...prev, [assignment.assignment_id]: false }));
                                                        }
                                                    }}
                                                >
                                                    <LinkIcon />
                                                    <span>Generate Link</span>
                                                </button>
                                            )
                                        ) : (
                                            <div className="tracking-url-placeholder">
                                                Save changes to generate link
                                            </div>
                                        )}
                                    </div>

                                    {/* Column 3: Actions */}
                                    <div className="actions-col">
                                        <button
                                            className="icon-btn"
                                            onClick={async () => {
                                                try {
                                                    const text = buildAssignmentShareText(offer, assignment);
                                                    const textForNativeShare = text.startsWith('Offer:')
                                                        ? text.split('\n').slice(1).join('\n').trim()
                                                        : text;

                                                    // Prefer native share when available (mobile)
                                                    if (navigator?.share) {
                                                        await navigator.share({
                                                            title: `Offer: ${offer?.name || ''}`,
                                                            text: textForNativeShare,
                                                        });
                                                        return;
                                                    }

                                                    const result = await safeCopyToClipboard(text);
                                                    if (result.success) {
                                                        toast.success('Offer details copied. You can paste and share.');
                                                    } else {
                                                        toast.error(result.error || 'Failed to copy share text');
                                                    }
                                                } catch (error) {
                                                    // If user cancels native share, ignore silently
                                                    if (error?.name === 'AbortError') return;
                                                    console.error(error);
                                                    toast.error('Failed to share details');
                                                }
                                            }}
                                            title="Share Offer Details"
                                        >
                                            <ShareIcon />
                                        </button>

                                        <button
                                            className="icon-btn"
                                            onClick={() => {
                                                if (assignment.assignment_id) {
                                                    const currentUrl = `${location.pathname}${location.search}${location.hash}`;
                                                    const returnToParam = encodeURIComponent(currentUrl);
                                                    navigate(`/assignment/edit/${assignment.assignment_id}?returnTo=${returnToParam}`, {
                                                        state: { returnTo: currentUrl }
                                                    });
                                                } else {
                                                    toast.error('Please save the assignment first before editing.');
                                                }
                                            }}
                                            title="Edit Assignment"
                                        >
                                            <EditIcon />
                                        </button>

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: '#666', padding: '40px', border: '1px dashed #ddd', borderRadius: '8px', marginTop: '20px' }}>
                        <p style={{ margin: 0 }}>No publishers assigned yet.</p>
                        <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>Use the dropdown above to add publishers.</p>
                    </div>
                )}

                {/* Save Assignments Button */}
                {publisherAssignments.length > 0 && (
                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            className="btn btn-success"
                            onClick={async () => {
                                try {
                                    setSavingAssignments(true);
                                    const assignmentData = {
                                        offer_id: parseInt(id),
                                        publishers: publisherAssignments.map(assignment => ({
                                            publisher_id: assignment.publisher_id,
                                            payout_override: assignment.payout_override ? parseFloat(assignment.payout_override) : null,
                                            conversion_approval_percentage: assignment.conversion_approval_percentage ? parseFloat(assignment.conversion_approval_percentage) : null,
                                            capping_type: assignment.capping_type,
                                            capping_duration: assignment.capping_duration,
                                            capping_amount: assignment.capping_amount ? parseFloat(assignment.capping_amount) : null,
                                            capping_action: assignment.capping_action,
                                            callback_url: assignment.callback_url || null,
                                            offer_url: assignment.offer_url || null,
                                            notes: assignment.notes || null,
                                            status: assignment.status
                                        }))
                                    };

                                    await assignmentsAPI.createOrUpdateAssignments(assignmentData);
                                    toast.success('Assignments saved successfully!');
                                    setEditingAssignmentIndex(null);

                                    // Reload assignments for this offer only (same endpoint as initial load)
                                    const response = await offersAPI.getOfferAssignments(id);
                                    if (response.success && response.data) {
                                        setAssignments(response.data);

                                        const updatedAssignments = await Promise.all(
                                            response.data.map(async (assignment) => {
                                                let trackingUrl = '';
                                                if (assignment.id) {
                                                    try {
                                                        // assignment.id is the public assignment id returned by the backend formatAssignment
                                                        const trackingResponse = await assignmentsAPI.getTrackingUrl(assignment.id, { for_offer_public_id: id });
                                                        if (trackingResponse.success) {
                                                            trackingUrl = trackingResponse.data.tracking_url;
                                                        }
                                                    } catch (error) {
                                                        console.error(`Error fetching tracking URL for assignment ${assignment.id}:`, error);
                                                    }
                                                }
                                                return {
                                                    offer_id: assignment.offer_id?.toString() || id?.toString(),
                                                    publisher_id: assignment.publisher_id,
                                                    publisher_email: assignment.publisher_email,
                                                    payout_override: assignment.payout_override ?? null,
                                                    conversion_approval_percentage: assignment.conversion_approval_percentage || '',
                                                    capping_type: assignment.capping_type || 'none',
                                                    capping_duration: assignment.capping_duration || 'daily',
                                                    capping_amount: assignment.capping_amount || '',
                                                    capping_action: assignment.capping_action || 'stop',
                                                    callback_url: assignment.callback_url || '',
                                                    offer_url: assignment.destination_url || assignment.offer_url || '',
                                                    notes: assignment.notes || '',
                                                    status: assignment.status || 'active',
                                                    assignment_id: assignment.id,
                                                    tracking_url: trackingUrl,
                                                    selectedTokens: []
                                                };
                                            })
                                        );
                                        setPublisherAssignments(updatedAssignments);
                                    }
                                } catch (error) {
                                    console.error('Error saving assignments:', error);
                                    toast.error(error.message || 'Failed to save assignments');
                                } finally {
                                    setSavingAssignments(false);
                                }
                            }}
                            disabled={savingAssignments}
                        >
                            {savingAssignments ? 'Saving...' : 'Save All Assignments'}
                        </button>
                    </div>
                )}
            </div>

            {/* Recent Clicks */}
            {offer.recent_clicks && offer.recent_clicks.length > 0 && (
                <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Recent Clicks</h2>
                    <div className="offer-table-container">
                        <table className="offer-table">
                            <thead>
                                <tr>
                                    <th>Click ID</th>
                                    <th>Publisher</th>
                                    <th>IP Address</th>
                                    <th>Device</th>
                                    <th>Browser</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offer.recent_clicks.slice(0, 10).map((click) => (
                                    <tr key={click.id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{click.click_uuid}</td>
                                        <td>{click.publisher_email}</td>
                                        <td>{click.ip}</td>
                                        <td>{click.device_type || '-'}</td>
                                        <td>{click.browser || '-'}</td>
                                        <td>{formatDateTime(click.timestamp)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Recent Conversions */}
            {offer.recent_conversions && offer.recent_conversions.length > 0 && (
                <div className="offer-detail-section" style={{ background: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Recent Conversions</h2>
                    <div className="offer-table-container">
                        <table className="offer-table">
                            <thead>
                                <tr>
                                    <th>Conversion ID</th>
                                    <th>Publisher</th>
                                    <th>Status</th>
                                    <th>Amount</th>
                                    <th>Payout</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offer.recent_conversions.map((conversion) => (
                                    <tr key={conversion.id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{conversion.conversion_uuid}</td>
                                        <td>{conversion.publisher_email}</td>
                                        <td>
                                            <span className={`offer-status ${getStatusClass(conversion.status)}`}>
                                                {formatConversionStatus(conversion.status)}
                                            </span>
                                        </td>
                                        <td>{offer.offer_currency} {conversion.amount}</td>
                                        <td>{offer.offer_currency} {conversion.payout}</td>
                                        <td>{formatDateTime(conversion.timestamp)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}

export default OfferDetail;

