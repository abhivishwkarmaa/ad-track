import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { offersAPI } from '../../services/api';
import { isAbortError } from '../../hooks/useAbortableRequest';
import { useToast } from '../../context/ToastContext';
import {
    useOfferDetail,
    useOffersList,
    useOfferAssignments,
    useOfferStats,
    useOfferPublisherStats,
} from '../../hooks/queries/useOffersQuery';
import { usePublishersList } from '../../hooks/queries/usePublishersQuery';
import {
    useCreateOrUpdateAssignments,
    useAssignmentsTrackingUrls,
    getAssignmentTrackingUrlQueryOptions,
} from '../../hooks/queries/useAssignmentsQuery';
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
import { parseListTargetingField } from './utils/offerFormTargeting';
import { formatScheduleTimeForDisplay } from './utils/offerFormPayload';
import { getTrackingUrlString } from './utils/trackingUrlUtils';
import TrackingUrlPanel from './components/TrackingUrlPanel';
import {
    ArrowLeftIcon,
    EditIcon,
    LinkIcon,
    CopyIcon,
    ShareIcon,
    ExternalLinkIcon,
    SearchIcon,
    ClickIcon,
    ConversionIcon,
    RevenueIcon,
    RateIcon,
    DocumentIcon,
    WalletIcon,
    ShieldIcon,
    TargetIcon,
    GlobeIcon,
    MobileIcon,
    MonitorIcon,
    ZapIcon,
    InfoIcon,
    BuildingIcon,
    UserIcon,
    UsersIcon,
    TrendingUpIcon,
    ClockIcon,
    CircleSlashIcon,
} from '../../shared/ui/icons';
import './Offer.css';

const OfferStatCard = ({ loading, icon, value, label, className }) => (
    <div className={`offer-stat-item ${className || ''}`}>
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
    const queryClient = useQueryClient();
    const { reportTimezone } = useReportTimezone();
    const createOrUpdateAssignmentsMutation = useCreateOrUpdateAssignments();

    const {
        data: offer,
        isLoading: loading,
        error: offerQueryError,
    } = useOfferDetail(id);
    const { data: publishersResult, isLoading: loadingPublishers } = usePublishersList({ status: 'active', limit: 100 });
    const { data: offersResult } = useOffersList({ limit: 100 });
    const {
        data: assignmentRows = [],
        isLoading: loadingAssignments,
        refetch: refetchAssignments,
    } = useOfferAssignments(id, { enabled: Boolean(id) });

    const publishers = publishersResult?.data ?? [];
    const offers = offersResult?.data ?? [];
    const error = offerQueryError?.message ?? null;

    const [publisherAssignments, setPublisherAssignments] = useState([]);
    const [editingAssignmentIndex, setEditingAssignmentIndex] = useState(null);
    const [savingAssignments, setSavingAssignments] = useState(false);

    const [selectedRange, setSelectedRange] = useState('today');
    const [customRange, setCustomRange] = useState({ from: '', to: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const searchContainerRef = useRef(null);

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

    const statsQueryEnabled = Boolean(id) && !(
        selectedRange === 'custom' && (!selectedTimelineRange.from || !selectedTimelineRange.to)
    );

    const { data: stats = null, isLoading: loadingStats } = useOfferStats(
        id,
        offerStatsQueryParams,
        { enabled: statsQueryEnabled }
    );
    const { data: publisherStats = [], isLoading: loadingPublisherStats } = useOfferPublisherStats(
        id,
        offerStatsQueryParams,
        { enabled: statsQueryEnabled }
    );

    const trackingUrlParams = useMemo(
        () => ({ for_offer_public_id: id }),
        [id]
    );
    const assignmentIdsForTracking = useMemo(
        () => publisherAssignments.map((assignment) => assignment.assignment_id).filter(Boolean),
        [publisherAssignments]
    );
    const { byAssignmentId: trackingUrlByAssignmentId, loadingByAssignmentId: loadingTrackingUrls } =
        useAssignmentsTrackingUrls(assignmentIdsForTracking, trackingUrlParams, { enabled: Boolean(id) });

    const getAssignmentTrackingMeta = (assignment) =>
        trackingUrlByAssignmentId[assignment.assignment_id] ??
        (assignment.tracking_url ? { tracking_url: assignment.tracking_url, offer_params: [], required_params: [] } : null);

    const resolveAssignmentTrackingUrl = (assignment) =>
        getTrackingUrlString(getAssignmentTrackingMeta(assignment));

    useEffect(() => {
        if (!id || !assignmentRows.length) {
            setPublisherAssignments([]);
            return undefined;
        }

        const initialAssignments = assignmentRows.map((assignment) => ({
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
            tracking_url: '',
            selectedTokens: [],
        }));

        setPublisherAssignments(initialAssignments);
    }, [id, assignmentRows]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 350);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        const controller = new AbortController();

        const fetchSearchResults = async () => {
            if (!debouncedSearchTerm || debouncedSearchTerm.length < 3) {
                setSearchResults([]);
                setSearchLoading(false);
                return;
            }

            try {
                setSearchLoading(true);
                const response = await offersAPI.searchOffers(
                    { q: debouncedSearchTerm, limit: 8 },
                    { signal: controller.signal }
                );
                if (controller.signal.aborted) return;
                if (response.success) {
                    setSearchResults(response.data || []);
                } else {
                    setSearchResults([]);
                }
            } catch (searchError) {
                if (!isAbortError(searchError)) {
                    console.error('Error searching offers:', searchError);
                    setSearchResults([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSearchLoading(false);
                }
            }
        };

        fetchSearchResults();
        return () => controller.abort();
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

    const buildAssignmentShareText = (offerObj, assignmentObj) => {
        const conversionModel = offerObj?.advertiser_model || offerObj?.affiliate_model || '-';
        const country = offerObj?.country || '-';
        const carrierName = offerObj?.carrier_name && String(offerObj.carrier_name).trim();
        const carrierParsed = parseListTargetingField(offerObj?.carrier_targeting_json, 'carriers');
        const carrierFromTargeting = carrierParsed.list ? carrierParsed.list : null;
        const carrier = carrierName || carrierFromTargeting || '-';

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
        return `${offer.offer_currency || 'USD'} ${amount.toFixed(2)}`;
    };

    const formatCappingType = (type) => {
        const map = {
            none: 'No Capping',
            budget: 'Budget Cap (Revenue)',
            conversion: 'Conversion Cap (Count)',
        };
        return map[type] || type || 'No Capping';
    };

    const formatCappingAction = (action) => {
        const map = {
            stop: 'Stop Traffic (404)',
            reject: 'Reject (Payout 0)',
            fallback: 'Fallback (Redirect)',
        };
        return map[action] || action || '-';
    };

    const formatCappingDuration = (duration) => {
        if (!duration) return '-';
        return duration.charAt(0).toUpperCase() + duration.slice(1);
    };

    const getOfferCapAmount = (offerObj) => {
        if (!offerObj || !offerObj.capping_type || offerObj.capping_type === 'none') return null;
        if (offerObj.capping_type === 'budget') {
            return offerObj.budget_cap != null && offerObj.budget_cap !== '' ? offerObj.budget_cap : null;
        }
        if (offerObj.capping_type === 'conversion') {
            return offerObj.conversion_cap != null && offerObj.conversion_cap !== '' ? offerObj.conversion_cap : null;
        }
        return null;
    };

    const getFallbackOfferLabel = (offerObj) => {
        if (!offerObj?.fallback_offer_id) return null;
        const fallbackOffer = offers.find((o) =>
            String(o.id) === String(offerObj.fallback_offer_id) ||
            String(o.public_offer_id) === String(offerObj.fallback_offer_id)
        );
        if (!fallbackOffer) return `Offer #${offerObj.fallback_offer_id}`;
        return `${fallbackOffer.name} (${fallbackOffer.public_offer_id || fallbackOffer.display_id || fallbackOffer.id})`;
    };

    const capAmount = getOfferCapAmount(offer);
    const isInstantRedirect = offer.capping_action === 'fallback'
        && capAmount != null
        && Number(capAmount) === 0
        && offer.capping_type
        && offer.capping_type !== 'none';

    const parseTargetingList = (jsonStr, key) => {
        if (!jsonStr) return [];
        try {
            const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
            return Array.isArray(parsed?.[key]) ? parsed[key] : [];
        } catch {
            return [];
        }
    };

    const browserTargetingList = parseTargetingList(offer?.browser_targeting_json, 'browser');
    const deviceTargetingList = parseTargetingList(offer?.device_targeting_json, 'device');
    const osTargetingList = parseTargetingList(offer?.os_targeting_json, 'os');

    const statsCards = [
        { key: 'clicks', label: 'Total Clicks', value: formatNumber(stats?.total_clicks), className: 'stat-item-purple', icon: <ClickIcon size={14} /> },
        { key: 'conversions', label: 'Total Conversions', value: formatNumber(stats?.total_conversions), className: 'stat-item-teal', icon: <ConversionIcon size={14} /> },
        { key: 'approved', label: 'Approved Conversions', value: formatNumber(stats?.approved_conversions), className: 'stat-item-green', icon: <ConversionIcon size={14} /> },
        { key: 'pending', label: 'Pending Conversions', value: formatNumber(stats?.pending_conversions), className: 'stat-item-amber', icon: <ConversionIcon size={14} /> },
        { key: 'rejected', label: 'Rejected Conversions', value: formatNumber(stats?.rejected_conversions), className: 'stat-item-red', icon: <CircleSlashIcon size={14} /> },
        { key: 'click-expired', label: 'Click Expired', value: formatNumber(stats?.click_expired_conversions || stats?.click_expired || 0), className: 'stat-item-neutral', icon: <ClockIcon size={14} /> },
        { key: 'conversion-rate', label: 'Conversion Rate', value: `${Number(stats?.conversion_rate || 0).toFixed(2)}%`, className: 'stat-item-amber', icon: <RateIcon size={14} /> },
        { key: 'revenue', label: 'Total Revenue', value: formatCurrency(stats?.total_revenue), className: 'stat-item-red', icon: <RevenueIcon size={14} /> },
        { key: 'payout', label: 'Payout', value: formatCurrency(stats?.approved_payout), className: 'stat-item-green', icon: <WalletIcon size={14} /> },
        { key: 'profit', label: 'Total Profit', value: formatCurrency(stats?.total_profit), className: 'stat-item-profit', icon: <TrendingUpIcon size={14} /> },
    ];

    return (
        <div className="offer-page">
            {/* Header Navigation & Breadcrumbs */}
            <div className="offer-page-nav">
                <button
                    type="button"
                    className="offer-back-btn"
                    onClick={() => navigate('/offer/list')}
                >
                    <ArrowLeftIcon size={14} />
                    <span>Back</span>
                </button>
                <div className="offer-breadcrumb">
                    <span className="breadcrumb-item" onClick={() => navigate('/offer/list')}>Offers</span>
                    <span className="breadcrumb-separator">/</span>
                    <span className="breadcrumb-item current">{offer.name}</span>
                </div>
            </div>

            {/* 1. Bento Hero Banner */}
            <div className="offer-bento-hero">
                <div className="offer-bento-hero-top">
                    <div className="offer-bento-hero-title-group">
                        <h1>
                            <span>{offer.name}</span>
                            <span className="offer-detail-id-pill">#{offer.public_offer_id || offer.display_id}</span>
                            <span className={`offer-status ${offer.status?.toLowerCase()}`}>{offer.status}</span>
                        </h1>
                        <div className="offer-bento-hero-tags">
                            <span className="offer-bento-tag primary">
                                <DocumentIcon size={13} />
                                {offer.category || 'General'}
                            </span>
                            <span className="offer-bento-tag">
                                <GlobeIcon size={13} />
                                {offer.country || 'Global'}
                            </span>
                            <span className="offer-bento-tag">
                                {offer.offer_currency || 'USD'}
                            </span>
                            {offer.carrier_name && (
                                <span className="offer-bento-tag">
                                    Carrier: {offer.carrier_name}
                                </span>
                            )}
                            <span className="offer-bento-tag">
                                {offer.billing_flow || 'Standard Flow'} • {offer.billing_type || 'Billable'}
                            </span>
                        </div>
                    </div>

                    <div className="offer-header-actions">
                        <div className="offer-search offer-detail-search" ref={searchContainerRef}>
                            <SearchIcon size={15} />
                            <input
                                type="text"
                                placeholder="Jump to offer..."
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
                            <EditIcon size={15} />
                            <span>Edit Offer</span>
                        </Link>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                const element = document.getElementById('publisherSection');
                                if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }}
                        >
                            <UsersIcon size={15} />
                            <span>Publishers</span>
                        </button>
                    </div>
                </div>

                {offer.description && (
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.4' }}>
                        {offer.description}
                    </p>
                )}

                {/* Hero Financials Ribbon */}
                <div className="offer-bento-hero-financials">
                    <div className="bento-hero-metric">
                        <span className="bento-hero-metric-label">Advertiser Revenue</span>
                        <span className="bento-hero-metric-value primary">
                            {offer.offer_currency || 'USD'} {Number(offer.advertiser_amount || 0).toFixed(2)}
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '4px' }}>
                                {offer.advertiser_model}
                            </span>
                        </span>
                    </div>

                    <div className="bento-hero-metric">
                        <span className="bento-hero-metric-label">Publisher Payout</span>
                        <span className="bento-hero-metric-value success">
                            {offer.offer_currency || 'USD'} {Number(offer.affiliate_amount || 0).toFixed(2)}
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '4px' }}>
                                {offer.affiliate_model}
                            </span>
                        </span>
                    </div>

                    <div className="bento-hero-metric">
                        <span className="bento-hero-metric-label">Net Profit / Conv</span>
                        <span className="bento-hero-metric-value primary">
                            +{offer.offer_currency || 'USD'} {(Number(offer.advertiser_amount || 0) - Number(offer.affiliate_amount || 0)).toFixed(2)}
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success-color)', marginLeft: '4px' }}>
                                ({Number(offer.advertiser_amount) > 0
                                    ? `${(((Number(offer.advertiser_amount) - Number(offer.affiliate_amount)) / Number(offer.advertiser_amount)) * 100).toFixed(1)}%`
                                    : '0%'})
                            </span>
                        </span>
                    </div>

                    <div className="bento-hero-metric">
                        <span className="bento-hero-metric-label">Active Safeguard</span>
                        <span className="bento-hero-metric-value" style={{ fontSize: '13px', color: offer.capping_type && offer.capping_type !== 'none' ? 'var(--brand-amber-dark)' : 'var(--text-secondary)' }}>
                            {offer.capping_type && offer.capping_type !== 'none'
                                ? `${capAmount || 0} (${offer.capping_type}) / ${offer.capping_duration || 'daily'}`
                                : 'Unlimited Traffic (No Cap)'}
                        </span>
                    </div>
                </div>

                {/* Direct Landing Link Strip */}
                <div className="detail-url-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <LinkIcon size={15} style={{ color: 'var(--brand-blue)' }} />
                        <code className="detail-url-code">{offer.offer_url}</code>
                    </div>
                    <div className="detail-url-actions">
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                safeCopyToClipboard(offer.offer_url);
                                toast.success('Offer landing URL copied!');
                            }}
                            title="Copy Landing URL"
                        >
                            <CopyIcon size={14} />
                            <span>Copy</span>
                        </button>
                        <a
                            href={offer.offer_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            title="Open in new tab"
                        >
                            <ExternalLinkIcon size={14} />
                            <span>Test URL</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* Performance Overview Bento Tile */}
            <div className="offer-form-card u-mb-24">
                <div className="offer-form-card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div className="card-header-icon amber">
                            <ZapIcon size={20} />
                        </div>
                        <div className="card-header-text">
                            <h3>Performance Overview</h3>
                            <p>Metrics use {reportTzLabel} day boundaries</p>
                        </div>
                    </div>
                    <TimelineFilter
                        value={selectedRange}
                        options={OFFER_TIMELINE_OPTIONS}
                        customRange={customRange}
                        onPresetChange={setSelectedRange}
                        onCustomRangeChange={setCustomRange}
                    />
                </div>
                <div className="offer-form-card-body">
                    <div className="offer-stats-cards-grid">
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
                    {!loadingStats && !stats && (
                        <div className="offer-detail-empty-state u-mt-14">
                            <InfoIcon size={20} />
                            <span>No performance data recorded for this timeline.</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Bento Layout (12-column Grid) */}
            <div className="offer-bento-layout">
                {/* Tile 1: Schedule & Delivery (4 cols) */}
                <div className="bento-card bento-col-4">
                    <div className="bento-card-header">
                        <div className="bento-card-header-left">
                            <ClockIcon size={18} style={{ color: 'var(--brand-blue)' }} />
                            <h3>Schedule & Delivery</h3>
                        </div>
                    </div>
                    <div className="bento-card-body">
                        <div className="bento-tile-grid-2">
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label"><ClockIcon size={12} /> Daily Hours</span>
                                <span className="bento-mini-tile-value">
                                    {formatScheduleTimeForDisplay(offer.start_time)
                                        ? `${formatScheduleTimeForDisplay(offer.start_time)} - ${formatScheduleTimeForDisplay(offer.end_time)}`
                                        : '24/7 Active'}
                                </span>
                            </div>
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label"><GlobeIcon size={12} /> Timezone</span>
                                <span className="bento-mini-tile-value" style={{ fontSize: '11px' }}>{offer.timezone || 'UTC'}</span>
                            </div>
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label">Start Date</span>
                                <span className="bento-mini-tile-value">{formatDate(offer.start_date)}</span>
                            </div>
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label">End Date</span>
                                <span className="bento-mini-tile-value">{formatDate(offer.end_date)}</span>
                            </div>
                        </div>

                        <div className="bento-mini-tile" style={{ marginTop: 'auto' }}>
                            <span className="bento-mini-tile-label">Visibility & Delivery</span>
                            <span className="bento-mini-tile-value" style={{ fontSize: '11.5px', fontWeight: 600 }}>
                                {offer.offer_visibility?.toUpperCase() || 'PUBLIC'} • {offer.billing_flow || 'Standard'} ({offer.billing_type || 'Billable'})
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tile 2: Advertiser Partner (4 cols) */}
                <div className="bento-card bento-col-4">
                    <div className="bento-card-header">
                        <div className="bento-card-header-left">
                            <BuildingIcon size={16} style={{ color: 'var(--brand-amber-dark)' }} />
                            <h3>Advertiser Account</h3>
                        </div>
                        {offer.advertiser && (
                            <span className={`offer-status ${offer.advertiser.status?.toLowerCase()}`}>
                                {offer.advertiser.status}
                            </span>
                        )}
                    </div>
                    <div className="bento-card-body">
                        {offer.advertiser ? (
                            <>
                                <div className="bento-mini-tile">
                                    <span className="bento-mini-tile-label"><UserIcon size={11} /> Contact Name</span>
                                    <span className="bento-mini-tile-value">{offer.advertiser.name}</span>
                                </div>
                                <div className="bento-mini-tile">
                                    <span className="bento-mini-tile-label"><BuildingIcon size={11} /> Company</span>
                                    <span className="bento-mini-tile-value">{offer.advertiser.company_name}</span>
                                </div>
                                <div className="bento-mini-tile">
                                    <span className="bento-mini-tile-label">Email</span>
                                    <span className="bento-mini-tile-value" style={{ fontSize: '11.5px', wordBreak: 'break-all' }}>{offer.advertiser.email}</span>
                                </div>
                            </>
                        ) : (
                            <div className="offer-detail-empty-state">
                                <BuildingIcon size={18} />
                                <span>Direct Network Offer (No Advertiser Assigned)</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tile 3: Capping & Fail-Safe Protection (4 cols) */}
                <div className="bento-card bento-col-4">
                    <div className="bento-card-header">
                        <div className="bento-card-header-left">
                            <ShieldIcon size={16} style={{ color: 'var(--danger-color)' }} />
                            <h3>Capping & Smart Fallback</h3>
                        </div>
                        {isInstantRedirect && (
                            <span className="offer-bento-tag primary" style={{ fontSize: '9.5px' }}>Instant Redirect</span>
                        )}
                    </div>
                    <div className="bento-card-body">
                        <div className="bento-tile-grid-2">
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label">Capping Type</span>
                                <span className="bento-mini-tile-value">{formatCappingType(offer.capping_type)}</span>
                            </div>
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label">Duration</span>
                                <span className="bento-mini-tile-value">{formatCappingDuration(offer.capping_duration)}</span>
                            </div>
                        </div>

                        <div className="bento-mini-tile">
                            <span className="bento-mini-tile-label">Limit & Overflow Action</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                <span style={{ fontSize: '12.5px', fontWeight: 700 }}>
                                    {capAmount != null
                                        ? (offer.capping_type === 'budget'
                                            ? `${offer.offer_currency || 'USD'} ${Number(capAmount).toFixed(2)}`
                                            : formatNumber(capAmount))
                                        : 'Unlimited'}
                                </span>
                                <span className={`targeting-action-tag ${offer.capping_action === 'stop' ? 'block' : 'allow'}`}>
                                    {formatCappingAction(offer.capping_action)}
                                </span>
                            </div>
                        </div>

                        {offer.capping_action === 'fallback' && (
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label">Fallback Destination</span>
                                <span className="bento-mini-tile-value" style={{ fontSize: '11px' }}>
                                    {offer.fallback_type === 'custom'
                                        ? (offer.fallback_url ? <a href={offer.fallback_url} target="_blank" rel="noopener noreferrer" className="detail-link-break">{offer.fallback_url}</a> : 'Custom URL')
                                        : (getFallbackOfferLabel(offer) || 'Fallback Offer')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tile 4: Precision Targeting Rules (6 cols) */}
                <div className="bento-card bento-col-6">
                    <div className="bento-card-header">
                        <div className="bento-card-header-left">
                            <TargetIcon size={18} style={{ color: 'var(--brand-blue)' }} />
                            <h3>Precision Targeting Rules</h3>
                        </div>
                    </div>
                    <div className="bento-card-body">
                        <div className="bento-targeting-block">
                            <div className="bento-targeting-header">
                                <span className="bento-targeting-title"><MonitorIcon size={14} /> Browsers</span>
                                <span className={`targeting-action-tag ${browserTargetingList.length === 0 || browserTargetingList.includes('all') ? 'allow' : (offer.browser_action === 'allow' ? 'allow' : 'block')}`}>
                                    {browserTargetingList.length === 0 || browserTargetingList.includes('all') ? 'ALL' : offer.browser_action?.toUpperCase() || 'ALLOW'}
                                </span>
                            </div>
                            <div className="detail-targeting-pills">
                                {browserTargetingList.length === 0 || browserTargetingList.includes('all') ? (
                                    <span className="targeting-pill all">All Browsers Allowed</span>
                                ) : (
                                    browserTargetingList.map((b) => <span key={b} className="targeting-pill">{b}</span>)
                                )}
                            </div>
                        </div>

                        <div className="bento-targeting-block">
                            <div className="bento-targeting-header">
                                <span className="bento-targeting-title"><MobileIcon size={14} /> Devices</span>
                                <span className={`targeting-action-tag ${deviceTargetingList.length === 0 || deviceTargetingList.includes('all') ? 'allow' : (offer.device_action === 'allow' ? 'allow' : 'block')}`}>
                                    {deviceTargetingList.length === 0 || deviceTargetingList.includes('all') ? 'ALL' : offer.device_action?.toUpperCase() || 'ALLOW'}
                                </span>
                            </div>
                            <div className="detail-targeting-pills">
                                {deviceTargetingList.length === 0 || deviceTargetingList.includes('all') ? (
                                    <span className="targeting-pill all">All Devices Allowed</span>
                                ) : (
                                    deviceTargetingList.map((d) => <span key={d} className="targeting-pill">{d.replace(/_/g, ' ')}</span>)
                                )}
                            </div>
                        </div>

                        <div className="bento-targeting-block">
                            <div className="bento-targeting-header">
                                <span className="bento-targeting-title"><MonitorIcon size={14} /> Operating Systems</span>
                                <span className={`targeting-action-tag ${osTargetingList.length === 0 || osTargetingList.includes('all') ? 'allow' : (offer.os_action === 'allow' ? 'allow' : 'block')}`}>
                                    {osTargetingList.length === 0 || osTargetingList.includes('all') ? 'ALL' : offer.os_action?.toUpperCase() || 'ALLOW'}
                                </span>
                            </div>
                            <div className="detail-targeting-pills">
                                {osTargetingList.length === 0 || osTargetingList.includes('all') ? (
                                    <span className="targeting-pill all">All Operating Systems Allowed</span>
                                ) : (
                                    osTargetingList.map((o) => <span key={o} className="targeting-pill">{o}</span>)
                                )}
                            </div>
                        </div>

                        {offer.country_list && (
                            <div className="bento-targeting-block">
                                <div className="bento-targeting-header">
                                    <span className="bento-targeting-title"><GlobeIcon size={14} /> Country Filter</span>
                                    <span className={`targeting-action-tag ${offer.country_action === 'allow' ? 'allow' : 'block'}`}>
                                        {offer.country_action?.toUpperCase() || 'ALLOW'}
                                    </span>
                                </div>
                                <div className="detail-targeting-pills">
                                    {offer.country_list.split(',').map((c) => (
                                        <span key={c} className="targeting-pill">{c.trim()}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tile 5: Destination & Parameters Hub (6 cols) */}
                <div className="bento-card bento-col-6">
                    <div className="bento-card-header">
                        <div className="bento-card-header-left">
                            <LinkIcon size={18} style={{ color: 'var(--brand-blue)' }} />
                            <h3>Tracking & Parameters Hub</h3>
                        </div>
                    </div>
                    <div className="bento-card-body">
                        {offer.preview_url && (
                            <div className="bento-mini-tile">
                                <span className="bento-mini-tile-label">Preview Landing URL</span>
                                <div className="detail-url-row" style={{ marginTop: '3px' }}>
                                    <code className="detail-url-code" title={offer.preview_url}>{offer.preview_url}</code>
                                    <div className="detail-url-actions">
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => {
                                                safeCopyToClipboard(offer.preview_url);
                                                toast.success('Preview URL copied!');
                                            }}
                                            title="Copy Preview URL"
                                        >
                                            <CopyIcon size={12} />
                                        </button>
                                        <a href={offer.preview_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" title="Open Preview URL">
                                            <ExternalLinkIcon size={12} />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bento-targeting-block" style={{ flex: 1 }}>
                            <span className="bento-targeting-title">
                                Dynamic URL Parameters ({offer.offer_params?.length || 0})
                            </span>
                            {Array.isArray(offer.offer_params) && offer.offer_params.length > 0 ? (
                                <div className="offer-table-container" style={{ margin: 0, maxHeight: '180px', overflowY: 'auto' }}>
                                    <table className="offer-table">
                                        <thead>
                                            <tr>
                                                <th>Parameter</th>
                                                <th>Type</th>
                                                <th>Required</th>
                                                <th>Default</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {offer.offer_params.map((p) => (
                                                <tr key={p.param_key}>
                                                    <td><code>{p.param_key}</code></td>
                                                    <td><span className="targeting-pill">{p.param_type || 'text'}</span></td>
                                                    <td>
                                                        <span className={`targeting-action-tag ${p.is_required ? 'block' : 'allow'}`}>
                                                            {p.is_required ? 'YES' : 'NO'}
                                                        </span>
                                                    </td>
                                                    <td>{p.default_value || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', padding: '6px 0' }}>
                                    No custom tracking parameters defined for this campaign.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tile 6: Event Goals & Conversion Funnel (12 cols) if present */}
                {Array.isArray(offer.offer_events) && offer.offer_events.length > 0 && (
                    <div className="bento-card bento-col-12">
                        <div className="bento-card-header">
                            <div className="bento-card-header-left">
                                <TargetIcon size={18} style={{ color: 'var(--brand-blue)' }} />
                                <h3>Event Goals & Conversion Funnel</h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className="targeting-pill all">
                                    👑 1 Primary Goal
                                </span>
                                {offer.offer_events.filter(e => !e.is_primary).length > 0 && (
                                    <span className="targeting-pill">
                                        ⚡ {offer.offer_events.filter(e => !e.is_primary).length} Funnel Signals
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="bento-card-body">
                            <div className="offer-table-container" style={{ margin: 0 }}>
                                <table className="offer-table">
                                    <thead>
                                        <tr>
                                            <th>Goal Role</th>
                                            <th>Event Code</th>
                                            <th>Display Title</th>
                                            <th>Advertiser Rev</th>
                                            <th>Affiliate Payout</th>
                                            <th>Accounting & Caps</th>
                                            <th>Per Click Rule</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {offer.offer_events.map((ev) => {
                                            const isPrimary = Boolean(ev.is_primary);
                                            return (
                                                <tr key={ev.event_name} style={{ background: isPrimary ? 'rgba(22, 163, 74, 0.04)' : undefined }}>
                                                    <td>
                                                        <span className={`targeting-action-tag ${isPrimary ? 'allow' : 'block'}`} style={!isPrimary ? { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' } : {}}>
                                                            {isPrimary ? '👑 PRIMARY GOAL' : '⚡ FUNNEL SIGNAL'}
                                                        </span>
                                                    </td>
                                                    <td><code>{ev.event_name}</code></td>
                                                    <td><strong>{ev.title || ev.event_name}</strong></td>
                                                    <td style={{ color: 'var(--success-color)', fontWeight: 700 }}>
                                                        {offer.offer_currency || '$'} {Number(ev.advertiser_amount).toFixed(2)}
                                                    </td>
                                                    <td style={{ color: 'var(--brand-blue)', fontWeight: 700 }}>
                                                        {offer.offer_currency || '$'} {Number(ev.affiliate_amount).toFixed(2)}
                                                    </td>
                                                    <td style={{ fontSize: '12px' }}>
                                                        {isPrimary ? (
                                                            <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>Counts as 1 Conversion</span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Funnel only</span>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '12px' }}>{ev.allow_multiple ? 'Repeat allowed' : '1 per click'}</td>
                                                    <td>
                                                        <span className={`offer-status ${ev.status?.toLowerCase()}`}>{ev.status}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="detail-url-row" style={{ marginTop: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                    <strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Advertiser Postback URL:</strong>
                                    <code className="detail-url-code">
                                        https://{window.location.hostname}/postback?click_id={'{click_id}'}&event={'{event_name}'}&amount={'{amount}'}
                                    </code>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                        safeCopyToClipboard(`https://${window.location.hostname}/postback?click_id={click_id}&event={event_name}&amount={amount}`);
                                        toast.success('Copied advertiser postback URL');
                                    }}
                                >
                                    <CopyIcon size={13} />
                                    <span>Copy</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tile 7: Event Goals Performance Breakdown (if available) */}
                {stats?.event_stats && stats.event_stats.length > 0 && (
                    <div className="bento-card bento-col-12">
                        <div className="bento-card-header">
                            <div className="bento-card-header-left">
                                <TrendingUpIcon size={18} style={{ color: 'var(--brand-blue)' }} />
                                <h3>Event Performance Breakdown</h3>
                            </div>
                            <span className="offer-bento-tag">{stats.event_stats.length} Tracked Events</span>
                        </div>
                        <div className="bento-card-body">
                            <div className="offer-table-container" style={{ margin: 0 }}>
                                <table className="offer-table">
                                    <thead>
                                        <tr>
                                            <th>Event Name</th>
                                            <th>Total Conv</th>
                                            <th>Approved Conv</th>
                                            <th>Pending Conv</th>
                                            <th>Rejected Conv</th>
                                            <th>Revenue</th>
                                            <th>Payout</th>
                                            <th>Profit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.event_stats.map((ev) => (
                                            <tr key={ev.event_name}>
                                                <td><code>{ev.event_name}</code></td>
                                                <td>{formatNumber(ev.total_conversions)}</td>
                                                <td>{formatNumber(ev.approved_conversions)}</td>
                                                <td>{formatNumber(ev.pending_conversions)}</td>
                                                <td>{formatNumber(ev.rejected_conversions)}</td>
                                                <td>{formatCurrency(ev.total_revenue)}</td>
                                                <td>{formatCurrency(ev.approved_payout)}</td>
                                                <td style={{ color: ev.total_profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)', fontWeight: 700 }}>
                                                    {formatCurrency(ev.total_profit)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tile 8: Publisher Stats (12 cols) */}
                <div className="bento-card bento-col-12">
                    <div className="bento-card-header">
                        <div className="bento-card-header-left">
                            <TrendingUpIcon size={18} style={{ color: 'var(--success-color)' }} />
                            <h3>Publisher Performance Analytics</h3>
                        </div>
                    </div>
                    <div className="bento-card-body">
                        {loadingPublisherStats ? (
                            <div className="loading-spinner-small" style={{ display: 'block', margin: '20px auto' }}></div>
                        ) : publisherStats.length > 0 ? (
                            <div className="offer-table-container" style={{ margin: 0 }}>
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
                                                <td><strong>{pub.publisher_name || pub.publisher_email || '-'}</strong></td>
                                                <td>{formatNumber(pub.clicks)}</td>
                                                <td>{formatNumber(pub.conversions)}</td>
                                                <td>{formatNumber(pub.pending_conversions)}</td>
                                                <td>{formatNumber(pub.approved_conversions)}</td>
                                                <td>{formatCurrency(pub.approved_payout)}</td>
                                                <td style={{ color: 'var(--success-color)', fontWeight: 700 }}>{formatCurrency(pub.total_profit)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="offer-detail-empty-state">
                                <InfoIcon size={20} />
                                <span>No publisher stats recorded for this timeline.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Publisher Assignments Management */}
            <div id="publisherSection" className="offer-form-card u-mt-24">
                <div className="offer-form-card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div className="card-header-icon purple">
                            <UsersIcon size={20} />
                        </div>
                        <div className="card-header-text">
                            <h3>Publisher Assignments & Access</h3>
                            <p>Manage affiliate access, custom payouts, and specific traffic capping</p>
                        </div>
                    </div>
                    <span className="offer-form-badge-currency">{publisherAssignments.length} Publisher(s)</span>
                </div>
                <div className="offer-form-card-body">

                {/* Add Publisher Dropdown */}
                <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Add Publisher</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <select
                            className="form-control u-flex-1"
                            value={''}
                            onChange={(e) => {
                                if (e.target.value) {
                                    const publisherId = e.target.value;
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
                        >
                            <option value="">Select Publisher to Add</option>
                            {publishers
                                .filter(p => !publisherAssignments.find(a => String(a.publisher_id) === String(p.public_publisher_id)))
                                .map(p => (
                                    <option key={p.id} value={p.public_publisher_id}>
                                        {p.first_name} {p.last_name || ''} ({p.email}) - {p.company_name}
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
                                String(p.id) === String(assignment.publisher_id)
                            );
                            const isEditing = editingAssignmentIndex === index;

                            if (isEditing) {
                                return (
                                    <div key={index} className="publisher-row editing">
                                        <div className="edit-form-grid">
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
                                                    value={assignment.payout_override ?? ''}
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
                                                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', marginTop: '10px', color: 'var(--text-secondary)' }}>Capping & Budget</h4>
                                                <div className="offer-grid-row three-col">
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
                                                    <div className="form-group u-mt-10">
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
                                    {/* Column 1: Info */}
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
                                                    <span className="meta-badge" style={{ color: 'var(--brand-blue)', background: 'var(--brand-blue-dim)' }}>
                                                        Payout: {offer.offer_currency || 'USD'} {assignment.payout_override}
                                                    </span>
                                                ) : (
                                                    <span className="meta-badge">Default Payout</span>
                                                )}
                                            </span>
                                            {assignment.capping_type && assignment.capping_type !== 'none' && (
                                                <>
                                                    <span className="meta-badge" style={{ color: 'var(--brand-amber-dark)', background: 'var(--brand-amber-dim)' }}>
                                                        {assignment.capping_type === 'budget' ? 'Budget' : 'Conv'} Cap: {assignment.capping_amount} ({assignment.capping_duration})
                                                    </span>
                                                    <span className="meta-badge" style={{ color: 'var(--danger-color)', background: 'var(--danger-dim)' }}>
                                                        Action: {assignment.capping_action}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 2: Tracking URL */}
                                    <div className="tracking-col">
                                        {assignment.assignment_id ? (
                                            <TrackingUrlPanel
                                                trackingMeta={getAssignmentTrackingMeta(assignment)}
                                                loading={loadingTrackingUrls[assignment.assignment_id]}
                                                compact
                                                onGenerate={
                                                    !getAssignmentTrackingMeta(assignment)
                                                        ? async () => {
                                                              try {
                                                                  await queryClient.fetchQuery(
                                                                      getAssignmentTrackingUrlQueryOptions(
                                                                          assignment.assignment_id,
                                                                          trackingUrlParams
                                                                      )
                                                                  );
                                                              } catch (err) {
                                                                  console.error(err);
                                                                  toast.error('Failed to generate link');
                                                              }
                                                          }
                                                        : undefined
                                                }
                                            />
                                        ) : (
                                            <div className="tracking-url-placeholder">
                                                Save changes to generate link
                                            </div>
                                        )}
                                    </div>

                                    {/* Column 3: Actions */}
                                    <div className="actions-col">
                                        <button
                                            type="button"
                                            className="icon-btn"
                                            onClick={async () => {
                                                try {
                                                    const text = buildAssignmentShareText(offer, {
                                                        ...assignment,
                                                        tracking_url: resolveAssignmentTrackingUrl(assignment),
                                                    });
                                                    const result = await safeCopyToClipboard(text);

                                                    if (navigator?.share) {
                                                        const textForNativeShare = text.startsWith('Offer:')
                                                            ? text.split('\n').slice(1).join('\n').trim()
                                                            : text;
                                                        try {
                                                            await navigator.share({
                                                                title: `Offer: ${offer?.name || ''}`,
                                                                text: textForNativeShare,
                                                            });
                                                            return;
                                                        } catch (shareError) {
                                                            if (shareError?.name === 'AbortError') {
                                                                if (result.success) {
                                                                    toast.success('Offer details copied. You can paste and share.');
                                                                }
                                                                return;
                                                            }
                                                            throw shareError;
                                                        }
                                                    }

                                                    if (result.success) {
                                                        toast.success('Offer details copied. You can paste and share.');
                                                    } else {
                                                        toast.error(result.error || 'Failed to copy share text');
                                                    }
                                                } catch (shareErr) {
                                                    console.error(shareErr);
                                                    toast.error('Failed to share details');
                                                }
                                            }}
                                            title="Share Offer Details"
                                        >
                                            <ShareIcon size={16} />
                                        </button>

                                        <button
                                            type="button"
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
                                            <EditIcon size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="offer-detail-empty-state">
                        <UsersIcon size={20} />
                        <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>No publishers assigned yet.</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Use the dropdown above to add publishers.</p>
                        </div>
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
                                            capping_amount: assignment.capping_amount !== '' && assignment.capping_amount != null
                                                ? parseFloat(assignment.capping_amount)
                                                : null,
                                            capping_action: assignment.capping_action,
                                            callback_url: assignment.callback_url || null,
                                            offer_url: assignment.offer_url || null,
                                            notes: assignment.notes || null,
                                            status: assignment.status
                                        }))
                                    };

                                    await createOrUpdateAssignmentsMutation.mutateAsync(assignmentData);
                                    toast.success('Assignments saved successfully!');
                                    setEditingAssignmentIndex(null);
                                    await refetchAssignments();
                                } catch (saveErr) {
                                    console.error('Error saving assignments:', saveErr);
                                    toast.error(saveErr.message || 'Failed to save assignments');
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
            </div>

            {/* Recent Clicks */}
            {offer.recent_clicks && offer.recent_clicks.length > 0 && (
                <div className="offer-detail-section-card u-mt-24">
                    <h2>Recent Clicks</h2>
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
                                    <tr
                                        key={click.id}
                                        className="logs-row-clickable"
                                        onClick={() => click.click_uuid && navigate(`/logs/click/${encodeURIComponent(click.click_uuid)}`)}
                                        title={click.click_uuid ? 'View click detail' : undefined}
                                        style={{ cursor: click.click_uuid ? 'pointer' : 'default' }}
                                    >
                                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>
                                            {click.click_uuid ? (
                                                <Link
                                                    to={`/logs/click/${encodeURIComponent(click.click_uuid)}`}
                                                    className="log-row-link"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {click.click_uuid}
                                                </Link>
                                            ) : '—'}
                                        </td>
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
                <div className="offer-detail-section-card u-mt-24">
                    <h2>Recent Conversions</h2>
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
                                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>{conversion.conversion_uuid}</td>
                                        <td>{conversion.publisher_email}</td>
                                        <td>
                                            <span className={`offer-status ${getStatusClass(conversion.status)}`}>
                                                {formatConversionStatus(conversion.status)}
                                            </span>
                                        </td>
                                        <td>{offer.offer_currency || 'USD'} {conversion.amount}</td>
                                        <td>{offer.offer_currency || 'USD'} {conversion.payout}</td>
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
