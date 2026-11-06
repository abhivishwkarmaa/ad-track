import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRefresh } from '../../context/RefreshContext';
import { dashboardAPI } from '../../services/api';
import { isAbortError } from '../../hooks/useAbortableRequest';
import { formatDateInTimeZone } from '../../utils/dateTime';
import { useReportTimezone } from '../../context/ReportTimezoneContext';
import {
    addDaysToYmdInTimeZone,
    buildDashboardApiParams,
    countInclusiveYmdRange,
    userRangeYmdToBackendIstRange,
    userRangeYmdToBackendUtcMysqlRange,
} from '../../utils/reportTimezone';
import { getTimelineRange } from '../../utils/timelineRange';
import TimelineFilter from '../../components/TimelineFilter/TimelineFilter';
import './Dashboard.css';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- ICONS ---
const OfferIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
);

const AffiliateIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
);

const AdvertiserIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
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

const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const CalendarIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const ListIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
);

// --- HELPER COMPONENTS ---
const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    return `$${parseFloat(amount).toFixed(2)}`;
};

const StatCard = ({ loading, icon, value, label, className = '' }) => (
    <div className={`stat-item ${className}`}>
        <div className="stat-item-icon">
            {loading ? <span className="skeleton stat-icon-skeleton" /> : icon}
        </div>
        <div className="stat-item-content">
            {loading ? (
                <>
                    <span className="skeleton stat-value-skeleton" />
                    <span className="skeleton stat-label-skeleton" />
                </>
            ) : (
                <>
                    <span className="stat-item-value">{value}</span>
                    <span className="stat-item-label">{label}</span>
                </>
            )}
        </div>
    </div>
);

// --- SKELETON COMPONENTS ---
const SkeletonStatCard = () => (
    <div className="stat-card skeleton-stat-card">
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 6, marginBottom: 10 }} />
        <div className="skeleton" />
        <div className="skeleton" />
    </div>
);

const SkeletonChart = () => (
    <div className="skeleton-chart">
        <div className="skeleton" style={{ width: '100%', height: '100%' }} />
    </div>
);

const SkeletonList = ({ rows = 5 }) => (
    <div className="offers-list">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="skeleton-list-item">
                <div className="skeleton" />
                <div className="skeleton" />
            </div>
        ))}
    </div>
);

const ProgressBar = ({ visible }) => (
    <div style={{
        height: '2px',
        width: '100%',
        backgroundColor: '#e2e8f0',
        overflow: 'hidden',
        visibility: visible ? 'visible' : 'hidden',
        position: 'absolute',
        top: 0,
        left: 0,
    }}>
        <div className="progress-bar-animate" style={{
            height: '100%',
            backgroundColor: 'var(--primary-color)',
            width: '30%',
            animation: 'progressBarAnim 1s infinite alternate ease-in-out'
        }} />
    </div>
);

const SkeletonTable = ({ rows = 5, cols = 8, className = "" }) => (
    <div className={`activity-table ${className}`}>
        <div className="table-header">
            {Array.from({ length: cols }).map((_, i) => (
                <span key={i} className="skeleton" style={{ height: 12, display: 'block' }} />
            ))}
        </div>
        {Array.from({ length: rows }).map((_, ri) => (
            <div key={ri} className="skeleton-table-row table-row">
                {Array.from({ length: cols }).map((_, ci) => (
                    <div key={ci} className="skeleton" style={{ height: 12 }} />
                ))}
            </div>
        ))}
    </div>
);

const SkeletonSummary = () => (
    <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: 'auto' }}>
        {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-summary-item summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div className="skeleton" />
                <div className="skeleton" />
            </div>
        ))}
    </div>
);

const SortableHeader = ({ label, field, currentSort, onSort, align = 'left' }) => {
    const isActive = currentSort.by === field;
    const isAsc = isActive && currentSort.order === 'ASC';

    return (
        <div 
            className={`sortable-header ${isActive ? 'active' : ''} align-${align}`} 
            onClick={() => onSort(field)}
            style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                gap: '6px', 
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                borderRadius: '4px',
                userSelect: 'none',
                width: '100%',
                height: '100%'
            }}
        >
            <span style={{ fontWeight: isActive ? '700' : 'normal', color: isActive ? 'var(--primary-color)' : 'inherit' }}>
                {label}
            </span>
            <span style={{ fontSize: '12px', opacity: isActive ? 1 : 0.4, transition: 'transform 0.2s ease' }}>
                {isActive ? (isAsc ? '▲' : '▼') : '↕'}
            </span>
        </div>
    );
};

const Pagination = ({ current, total, limit, onPageChange }) => {
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return null;

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
            <button 
                className={`secondary-button ${current === 1 ? 'disabled' : ''}`}
                onClick={() => current > 1 && onPageChange(current - 1)}
                disabled={current === 1}
                style={{ padding: '6px 12px', fontSize: '13px' }}
            >
                Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Page {current} of {totalPages}
            </span>
            <button 
                className={`secondary-button ${current === totalPages ? 'disabled' : ''}`}
                onClick={() => current < totalPages && onPageChange(current + 1)}
                disabled={current === totalPages}
                style={{ padding: '6px 12px', fontSize: '13px' }}
            >
                Next
            </button>
        </div>
    );
};

// --- MAIN DASHBOARD COMPONENT ---
function Dashboard() {
    const { timezoneRevision } = useReportTimezone();
    return (
        <>
            <style>
                {`
                    @keyframes progressBarAnim {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(333%); }
                    }
                    .dashboard-card { position: relative; overflow: hidden; }
                `}
            </style>
            {/* Remount when report timezone changes so all ranges + fetches align (Settings saves revision). */}
            <DashboardContent key={timezoneRevision} />
        </>
    );
}

function DashboardContent() {
    const { user } = useAuth();
    const { refreshKey } = useRefresh();
    const { reportTimezone, timezoneRevision } = useReportTimezone();

    const [dateFilter, setDateFilter] = useState('today');
    const [customRange, setCustomRange] = useState({ from: '', to: '' });

    // Per-section state for progressive loading - show data as each API returns
    const [cards, setCards] = useState(null);
    const [loadingCards, setLoadingCards] = useState(true);
    const [performanceChart, setPerformanceChart] = useState([]);
    const [loadingPerformance, setLoadingPerformance] = useState(true);
    const [summary, setSummary] = useState({});
    const [summaryPrevious, setSummaryPrevious] = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [liveOffers, setLiveOffers] = useState([]);
    const [loadingLiveOffers, setLoadingLiveOffers] = useState(true);
    const [publisherStatistics, setPublisherStatistics] = useState([]);
    const [loadingPublisherStats, setLoadingPublisherStats] = useState(true);
    const [offerStatistics, setOfferStatistics] = useState([]);
    const [loadingOfferStats, setLoadingOfferStats] = useState(true);
    const [performanceComparison, setPerformanceComparison] = useState([]);
    const [loadingComparison, setLoadingComparison] = useState(true);

    // Sorting state for statistics tables
    const [offerSort, setOfferSort] = useState({ by: 'clicks', order: 'DESC' });
    const [pubSort, setPubSort] = useState({ by: 'conversions', order: 'DESC' });

    // Pagination state
    const [offerPage, setOfferPage] = useState(1);
    const [totalOffers, setTotalOffers] = useState(0);
    const [offerSearchInput, setOfferSearchInput] = useState('');
    const [offerSearchApplied, setOfferSearchApplied] = useState('');
    const [showOfferSearch, setShowOfferSearch] = useState(false);
    const [pubPage, setPubPage] = useState(1);
    const [totalPublishers, setTotalPublishers] = useState(0);

    const cardsRequestSeqRef = useRef(0);

    // Date range calculator (current period + previous period for comparison)
    const { dateRange, previousRange, periodLabels } = useMemo(() => {
        const current = getTimelineRange(dateFilter, customRange, reportTimezone);
        const fromYmd = current.from;
        const toYmd = current.to;

        let previous = null;
        if (fromYmd && toYmd) {
            const n = countInclusiveYmdRange(fromYmd, toYmd, reportTimezone);
            const prevToYmd = addDaysToYmdInTimeZone(fromYmd, -1, reportTimezone);
            const prevFromYmd = addDaysToYmdInTimeZone(prevToYmd, -(n - 1), reportTimezone);
            previous = { from: prevFromYmd, to: prevToYmd };
        }

        const labels = {
            today: { current: 'Today', previous: 'Yesterday' },
            yesterday: { current: 'Yesterday', previous: 'Day before' },
            this_week: { current: 'This Week', previous: 'Previous Week' },
            last_week: { current: 'Last Week', previous: 'Week before' },
            this_month: { current: 'This Month', previous: 'Previous Month' },
            last_month: { current: 'Last Month', previous: 'Month before' },
            custom: { current: 'Custom Range', previous: 'Previous Range' }
        };

        const labelsForPeriod = labels[dateFilter] || { current: dateFilter.replace('_', ' '), previous: 'Previous' };

        return {
            dateRange: current,
            previousRange: previous,
            periodLabels: labelsForPeriod
        };
    }, [dateFilter, customRange, reportTimezone]);

    const apiDateRange = useMemo(
        () => userRangeYmdToBackendIstRange(dateRange.from, dateRange.to, reportTimezone),
        [dateRange.from, dateRange.to, reportTimezone]
    );

    const apiPreviousRange = useMemo(
        () =>
            previousRange
                ? userRangeYmdToBackendIstRange(previousRange.from, previousRange.to, reportTimezone)
                : null,
        [previousRange, reportTimezone]
    );

    const utcRange = useMemo(
        () => userRangeYmdToBackendUtcMysqlRange(dateRange.from, dateRange.to, reportTimezone),
        [dateRange.from, dateRange.to, reportTimezone]
    );

    const previousUtcRange = useMemo(
        () =>
            previousRange
                ? userRangeYmdToBackendUtcMysqlRange(previousRange.from, previousRange.to, reportTimezone)
                : null,
        [previousRange, reportTimezone]
    );

    const groupBy = (dateFilter === 'today' || dateFilter === 'yesterday') ? 'hour' : 'day';

    const baseParams = useMemo(
        () =>
            buildDashboardApiParams(
                {
                    date_from: apiDateRange.date_from,
                    date_to: apiDateRange.date_to,
                    ...(utcRange.range_start_utc && utcRange.range_end_utc
                        ? {
                            range_start_utc: utcRange.range_start_utc,
                            range_end_utc: utcRange.range_end_utc,
                        }
                        : {}),
                    ...(previousUtcRange?.range_start_utc && previousUtcRange?.range_end_utc
                        ? {
                            previous_range_start_utc: previousUtcRange.range_start_utc,
                            previous_range_end_utc: previousUtcRange.range_end_utc,
                        }
                        : {}),
                    limit: 10,
                },
                reportTimezone
            ),
        [
            apiDateRange.date_from,
            apiDateRange.date_to,
            utcRange.range_start_utc,
            utcRange.range_end_utc,
            previousUtcRange?.range_start_utc,
            previousUtcRange?.range_end_utc,
            reportTimezone,
        ]
    );

    // 1. Core Dashboard Data (Cards, Charts, Summary) - Depends on Date Range
    useEffect(() => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;

        const controller = new AbortController();
        const { signal } = controller;
        const mountCheck = () => !signal.aborted;
        const cardsReqId = ++cardsRequestSeqRef.current;
        const requestOptions = { signal };

        setLoadingCards(true);
        setLoadingPerformance(true);
        setLoadingSummary(true);
        setLoadingLiveOffers(true);
        setLoadingComparison(true);

        // Fetch Cards
        dashboardAPI.getDashboardCards(baseParams, requestOptions)
            .then(res => {
                const isStale = cardsReqId !== cardsRequestSeqRef.current;
                if (mountCheck() && !isStale && res.success) setCards(res.data || {});
            })
            .catch(err => mountCheck() && !isAbortError(err) && console.error('Cards error:', err))
            .finally(() => {
                if (mountCheck() && cardsReqId === cardsRequestSeqRef.current) setLoadingCards(false);
            });

        // Fetch Chart
        dashboardAPI.getPerformance({ ...baseParams, group_by: groupBy }, requestOptions)
            .then(res => mountCheck() && res.success && setPerformanceChart(res.data || []))
            .catch(err => mountCheck() && !isAbortError(err) && console.error('Performance error:', err))
            .finally(() => mountCheck() && setLoadingPerformance(false));

        // Fetch Summary
        dashboardAPI.getPerformanceSummary(baseParams, requestOptions)
            .then(res => mountCheck() && res.success && setSummary(res.data || {}))
            .catch(err => mountCheck() && !isAbortError(err) && console.error('Summary error:', err))
            .finally(() => mountCheck() && setLoadingSummary(false));

        if (apiPreviousRange?.date_from && apiPreviousRange?.date_to) {
            dashboardAPI.getPerformanceSummary(
                buildDashboardApiParams(
                    {
                        date_from: apiPreviousRange.date_from,
                        date_to: apiPreviousRange.date_to,
                        ...(previousUtcRange?.range_start_utc && previousUtcRange?.range_end_utc
                            ? {
                                range_start_utc: previousUtcRange.range_start_utc,
                                range_end_utc: previousUtcRange.range_end_utc,
                            }
                            : {}),
                    },
                    reportTimezone
                ),
                requestOptions
            )
                .then(res => mountCheck() && res.success && setSummaryPrevious(res.data || null))
                .catch(err => mountCheck() && !isAbortError(err) && console.error('Summary previous error:', err));
        } else {
            setSummaryPrevious(null);
        }

        // Fetch Live Offers (Static limit)
        dashboardAPI.getLiveOffers(buildDashboardApiParams({ limit: 5 }, reportTimezone), requestOptions)
            .then(res => mountCheck() && res.success && setLiveOffers(res.data || []))
            .catch(err => mountCheck() && !isAbortError(err) && console.error('Live offers error:', err))
            .finally(() => mountCheck() && setLoadingLiveOffers(false));

        // Fetch Comparison
        if (apiPreviousRange?.date_from && apiPreviousRange?.date_to) {
            const prevParams = {
                previous_from: apiPreviousRange.date_from,
                previous_to: apiPreviousRange.date_to,
            };
            dashboardAPI.getPerformanceComparison({ ...baseParams, ...prevParams, group_by: groupBy }, requestOptions)
                .then(res => mountCheck() && res.success && setPerformanceComparison(res.data || []))
                .catch(err => mountCheck() && !isAbortError(err) && console.error('Comparison error:', err))
                .finally(() => mountCheck() && setLoadingComparison(false));
        } else {
            setPerformanceComparison([]);
            setLoadingComparison(false);
        }

        return () => controller.abort();
    }, [
        apiDateRange.date_from,
        apiDateRange.date_to,
        apiPreviousRange?.date_from,
        apiPreviousRange?.date_to,
        utcRange.range_start_utc,
        utcRange.range_end_utc,
        previousUtcRange?.range_start_utc,
        previousUtcRange?.range_end_utc,
        refreshKey,
        dateFilter,
        groupBy,
        reportTimezone,
        timezoneRevision,
    ]);

    // 2. Offer Statistics - Depends on sorting and page
    useEffect(() => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;
        const controller = new AbortController();
        const { signal } = controller;
        setLoadingOfferStats(true);
        dashboardAPI.getOfferStatistics({
            ...baseParams,
            sort_by: offerSort.by,
            order_by: offerSort.order,
            page: offerPage,
            ...(offerSearchApplied.length > 0 ? { search: offerSearchApplied } : {}),
        }, { signal })
            .then(res => {
                if (!signal.aborted && res.success) {
                    setOfferStatistics(res.data.data || []);
                    setTotalOffers(res.data.total || 0);
                }
            })
            .catch(err => !signal.aborted && !isAbortError(err) && console.error('Offer stats error:', err))
            .finally(() => !signal.aborted && setLoadingOfferStats(false));
        return () => controller.abort();
    }, [apiDateRange.date_from, apiDateRange.date_to, utcRange.range_start_utc, utcRange.range_end_utc, offerSort, offerPage, offerSearchApplied, refreshKey, dateFilter, reportTimezone, timezoneRevision]);

    // Debounced auto-search (~350ms after user stops typing)
    useEffect(() => {
        const timer = setTimeout(() => {
            const term = offerSearchInput.trim();
            const nextApplied = term.length > 0 ? term : '';
            setOfferSearchApplied((prev) => {
                if (prev !== nextApplied) setOfferPage(1);
                return nextApplied;
            });
        }, 350);
        return () => clearTimeout(timer);
    }, [offerSearchInput]);

    const handleClearOfferSearch = () => {
        setOfferSearchInput('');
        setOfferSearchApplied('');
        setOfferPage(1);
        setShowOfferSearch(false);
    };

    // 3. Publisher Statistics - Depends on sorting and page
    useEffect(() => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;
        const controller = new AbortController();
        const { signal } = controller;
        setLoadingPublisherStats(true);
        dashboardAPI.getPublisherStatistics({ ...baseParams, sort_by: pubSort.by, order_by: pubSort.order, page: pubPage }, { signal })
            .then(res => {
                if (!signal.aborted && res.success) {
                    setPublisherStatistics(res.data.data || []);
                    setTotalPublishers(res.data.total || 0);
                }
            })
            .catch(err => !signal.aborted && !isAbortError(err) && console.error('Publisher stats error:', err))
            .finally(() => !signal.aborted && setLoadingPublisherStats(false));
        return () => controller.abort();
    }, [apiDateRange.date_from, apiDateRange.date_to, utcRange.range_start_utc, utcRange.range_end_utc, pubSort, pubPage, refreshKey, dateFilter, reportTimezone, timezoneRevision]);

    const handleOfferSort = (field) => {
        setOfferPage(1); // Reset to page 1 on sort change
        setOfferSort(prev => ({
            by: field,
            order: prev.by === field && prev.order === 'DESC' ? 'ASC' : 'DESC'
        }));
    };

    const handlePubSort = (field) => {
        setPubPage(1); // Reset to page 1 on sort change
        setPubSort(prev => ({
            by: field,
            order: prev.by === field && prev.order === 'DESC' ? 'ASC' : 'DESC'
        }));
    };
    const processChartData = (data) => {
        if (!data || data.length === 0) return [];
        if (data.length === 1) {
            // Duplicate the single point to create a flat line across the chart
            // We append a space to the label to ensure uniqueness for Recharts while keeping it visually similar
            return [
                { ...data[0], label: data[0].label || data[0].date },
                { ...data[0], label: (data[0].label || data[0].date) + ' ' }
            ];
        }
        return data;
    };

    const processedPerformanceChart = useMemo(() => processChartData(performanceChart), [performanceChart]);
    const processedComparisonChart = useMemo(() => processChartData(performanceComparison), [performanceComparison]);

    const cardsData = cards || {};

    const todayStr = formatDateInTimeZone(new Date(), reportTimezone, {}, 'en-US');

    const getDelta = (curr, prev) => {
        if (prev === null || prev === undefined || Number(prev) === 0) return null;
        const diff = Number(curr) - Number(prev);
        const pct = ((Math.abs(diff) / Number(prev)) * 100).toFixed(1);
        const isUp = diff >= 0;
        return {
            isUp,
            pct,
            prevVal: prev
        };
    };

    const revenueVal = Number(summary.revenue ?? cardsData.revenue?.total ?? 0);
    const revenuePrevVal = summaryPrevious ? Number(summaryPrevious.revenue ?? 0) : null;
    const revenueDelta = getDelta(revenueVal, revenuePrevVal);

    const profitVal = Number(summary.profit ?? ((cardsData.revenue?.total || 0) - (cardsData.revenue?.approved_payout || 0)));
    const profitPrevVal = summaryPrevious ? Number(summaryPrevious.profit ?? 0) : null;
    const profitDelta = getDelta(profitVal, profitPrevVal);

    const clicksTotal = Number(cardsData.clicks?.total || summary.clicks || 0);
    const clicksPrevVal = summaryPrevious ? Number(summaryPrevious.clicks ?? 0) : null;
    const clicksDelta = getDelta(clicksTotal, clicksPrevVal);

    const convTotal = Number(cardsData.conversions?.total || summary.conversions || 0);
    const convPrevVal = summaryPrevious ? Number(summaryPrevious.conversions ?? 0) : null;
    const convDelta = getDelta(convTotal, convPrevVal);

    const approvedCount = cardsData.conversions?.approved ?? summary.approved_conversions ?? 0;
    const pendingCount = cardsData.conversions?.pending ?? summary.pending_conversions ?? 0;
    const approvedPayout = cardsData.revenue?.approved_payout ?? 0;
    const clicksExpired = cardsData.conversions?.click_expired || cardsData.conversions?.click_expired_conversions || 0;

    const todayFormatted = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
    const welcomeName = user?.company_name || user?.companyName || user?.name || user?.fullName || 'Panzcon';

    return (
        <main className="wrap dashboard">
            {/* Top Bar */}
            <div className="dashboard-topbar">
                <div>
                    <h1 className="dashboard-title">Dashboard</h1>
                    <div className="dashboard-sub">
                        {todayFormatted} · Welcome, {welcomeName}
                    </div>
                </div>
                <div className="header-actions">
                    <TimelineFilter
                        value={dateFilter}
                        customRange={customRange}
                        onPresetChange={setDateFilter}
                        onCustomRangeChange={setCustomRange}
                        className="date-filter-container"
                    />
                    <Link to="/offer/new" className="btn-modern pri">+ New offer</Link>
                    <Link to="/affiliate/new" className="btn-modern">Add publisher</Link>
                    <Link to="/advertiser/new" className="btn-modern">Add advertiser</Link>
                    <Link to="/offer/list" className="btn-modern">All offers</Link>
                </div>
            </div>

            {/* Section 1: Key Metrics (4 cards) */}
            <section className="grid4" aria-label="Key metrics">
                <div className="card">
                    <div className="lbl">Revenue</div>
                    <div className="num">{loadingSummary ? '...' : formatCurrency(revenueVal)}</div>
                    {revenueDelta ? (
                        <div className={revenueDelta.isUp ? 'up' : 'dn'}>
                            {revenueDelta.isUp ? '▲' : '▼'} {revenueDelta.pct}% vs {formatCurrency(revenueDelta.prevVal)}
                        </div>
                    ) : (
                        <div className="sub">{periodLabels.current}</div>
                    )}
                </div>
                <div className="card">
                    <div className="lbl">Profit</div>
                    <div className="num" style={{ color: '#1B6B36' }}>
                        {loadingSummary ? '...' : formatCurrency(profitVal)}
                    </div>
                    {profitDelta ? (
                        <div className={profitDelta.isUp ? 'up' : 'dn'}>
                            {profitDelta.isUp ? '▲' : '▼'} {profitDelta.pct}% vs {formatCurrency(profitDelta.prevVal)}
                        </div>
                    ) : (
                        <div className="sub">{periodLabels.current}</div>
                    )}
                </div>
                <div className="card">
                    <div className="lbl">Total clicks</div>
                    <div className="num">{loadingCards ? '...' : formatNumber(clicksTotal)}</div>
                    {clicksDelta ? (
                        <div className={clicksDelta.isUp ? 'up' : 'dn'}>
                            {clicksDelta.isUp ? '▲' : '▼'} {clicksDelta.pct}% vs {formatNumber(clicksDelta.prevVal)}
                        </div>
                    ) : (
                        <div className="sub">{periodLabels.current}</div>
                    )}
                </div>
                <div className="card">
                    <div className="lbl">Total Conversions</div>
                    <div className="num">{loadingCards ? '...' : formatNumber(convTotal)}</div>
                    {convDelta ? (
                        <div className={convDelta.isUp ? 'up' : 'dn'}>
                            {convDelta.isUp ? '▲' : '▼'} {convDelta.pct}% vs {formatNumber(convDelta.prevVal)}
                        </div>
                    ) : (
                        <div className="sub">{periodLabels.current}</div>
                    )}
                </div>
            </section>

            {/* Section 2: Conversion Status (4 cards) */}
            <section className="grid4" style={{ marginTop: '16px' }} aria-label="Conversion status">
                <div className="card">
                    <div className="lbl">Approved Conversions</div>
                    <div className="num" style={{ fontSize: '22px', color: '#1B6B36' }}>
                        {loadingCards ? '...' : formatNumber(approvedCount)}
                    </div>
                </div>
                <div className="card">
                    <div className="lbl">Pending Conversions</div>
                    <div className="num" style={{ fontSize: '22px', color: '#9A5B00' }}>
                        {loadingCards ? '...' : formatNumber(pendingCount)}
                    </div>
                </div>
                <div className="card">
                    <div className="lbl">Approved payout</div>
                    <div className="num" style={{ fontSize: '22px' }}>
                        {loadingCards ? '...' : formatCurrency(approvedPayout)}
                    </div>
                </div>
                <div className="card">
                    <div className="lbl">Clicks expired</div>
                    <div className="num" style={{ fontSize: '22px' }}>
                        {loadingCards ? '...' : formatNumber(clicksExpired)}
                    </div>
                </div>
            </section>

            {/* Section 3: Single Unified Comparison Chart */}
            <section className="card card-chart" style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                        Clicks by {groupBy === 'hour' ? 'hour' : 'day'}: {periodLabels.current?.toLowerCase() || 'today'} vs {periodLabels.previous?.toLowerCase() || 'yesterday'}
                    </h2>
                    <div className="sub" style={{ margin: 0 }}>
                        <span style={{ color: '#1565C0', fontWeight: 600 }}>━ {periodLabels.current}</span>
                        &nbsp;&nbsp;
                        <span style={{ color: '#6B7480', fontWeight: 600 }}>┅ {periodLabels.previous}</span>
                    </div>
                </div>
                {loadingComparison ? (
                    <SkeletonChart />
                ) : processedComparisonChart.length > 0 ? (
                    <div style={{ width: '100%', height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%" debounce={300}>
                            <AreaChart data={processedComparisonChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="chartColorCurrent" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#1565C0" stopOpacity={0.18} />
                                        <stop offset="95%" stopColor="#1565C0" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3E7EC" />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#5B6572', fontSize: 11, fontFamily: 'inherit' }}
                                    interval="preserveStartEnd"
                                    minTickGap={25}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#5B6572', fontSize: 11, fontFamily: 'inherit' }}
                                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#fff',
                                        borderRadius: '8px',
                                        border: '1px solid #E3E7EC',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                                        fontFamily: 'inherit'
                                    }}
                                    labelStyle={{ color: '#1E293B', fontWeight: 600, marginBottom: '4px' }}
                                    formatter={(value, name) => [
                                        formatNumber(value),
                                        name === 'clicks_current' ? periodLabels.current : periodLabels.previous
                                    ]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="clicks_previous"
                                    name="clicks_previous"
                                    stroke="#6B7480"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    fill="none"
                                    animationDuration={1000}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="clicks_current"
                                    name="clicks_current"
                                    stroke="#1565C0"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#chartColorCurrent)"
                                    animationDuration={1000}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="no-data">No comparison data available</div>
                )}
            </section>

            {/* Section 4: Two-column Section (Live offers + Top publishers) */}
            <div className="two" style={{ marginTop: '16px' }}>
                {/* Live offers */}
                <section className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h2>Live offers</h2>
                        <Link to="/offer/list" style={{ color: '#0B7F7B', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>View all</Link>
                    </div>
                    {loadingLiveOffers ? (
                        <SkeletonList rows={5} />
                    ) : liveOffers && liveOffers.length > 0 ? (
                        <div>
                            {liveOffers.slice(0, 5).map((offer, idx) => (
                                <Link
                                    to={`/offer/detail/${offer.id}`}
                                    key={offer.id || idx}
                                    className="row"
                                    style={idx === Math.min(liveOffers.length, 5) - 1 ? { border: 0 } : {}}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <span className="id">{offer.display_id || offer.id}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offer.name}</span>
                                    </span>
                                    <span className="pill">${Number(offer.payout || 0).toFixed(2)}</span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">No live offers available</div>
                    )}
                </section>

                {/* Top publishers */}
                <section className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h2>Top publishers</h2>
                        <Link to="/reports" style={{ color: '#0B7F7B', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>Full report</Link>
                    </div>
                    <ProgressBar visible={loadingPublisherStats} />
                    {loadingPublisherStats && publisherStatistics.length === 0 ? (
                        <SkeletonTable rows={4} cols={6} />
                    ) : publisherStatistics && publisherStatistics.length > 0 ? (
                        <>
                            <div className="scroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Publisher</th>
                                            <th className="align-right pointer" onClick={() => handlePubSort('conversions')}>Conv {pubSort.by === 'conversions' ? (pubSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                            <th className="align-right pointer" onClick={() => handlePubSort('approved_conversions')}>Approved {pubSort.by === 'approved_conversions' ? (pubSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                            <th className="align-right pointer" onClick={() => handlePubSort('pending_conversions')}>Pending {pubSort.by === 'pending_conversions' ? (pubSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                            <th className="align-right pointer" onClick={() => handlePubSort('affiliate_payout')}>Pub rev {pubSort.by === 'affiliate_payout' ? (pubSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                            <th className="align-right pointer" onClick={() => handlePubSort('total_revenue')}>Revenue {pubSort.by === 'total_revenue' ? (pubSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {publisherStatistics
                                            .filter(stat => (stat.conversions || 0) > 0 || totalPublishers <= 5)
                                            .slice(0, 7)
                                            .map((stat, idx) => (
                                            <tr key={stat.publisher_id || idx}>
                                                <td>
                                                    <span className="id">{stat.public_id}</span>
                                                    <strong>{stat.publisher_name}</strong>
                                                </td>
                                                <td className="align-right font-mono">{formatNumber(stat.conversions)}</td>
                                                <td className="align-right font-mono" style={{ color: '#1B6B36', fontWeight: 600 }}>{formatNumber(stat.approved_conversions)}</td>
                                                <td className="align-right font-mono" style={{ color: '#9A5B00', fontWeight: 600 }}>{formatNumber(stat.pending_conversions)}</td>
                                                <td className="align-right font-mono font-bold">{formatCurrency(stat.affiliate_payout ?? stat.publisher_revenue)}</td>
                                                <td className="align-right font-mono">{formatCurrency(stat.total_revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="sub" style={{ marginTop: '10px' }}>Inactive publishers (0 conversions) are hidden.</div>
                        </>
                    ) : (
                        <div className="no-data">No publisher statistics available</div>
                    )}
                </section>
            </div>

            {/* Section 5: Offer statistics */}
            <section className="card" style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                    <h2>Offer statistics</h2>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label htmlFor="so" className="lbl" style={{ margin: 0, textTransform: 'none', fontSize: '13px' }}>Search</label>
                        <input
                            id="so"
                            placeholder="Offer name..."
                            value={offerSearchInput}
                            onChange={(e) => setOfferSearchInput(e.target.value)}
                            style={{
                                minHeight: '38px',
                                padding: '0 12px',
                                border: '1px solid #D5DAE0',
                                borderRadius: '8px',
                                fontFamily: 'inherit',
                                fontSize: '14px',
                                outline: 'none',
                                minWidth: '200px'
                            }}
                        />
                        {offerSearchApplied && (
                            <button
                                type="button"
                                className="btn-modern"
                                onClick={handleClearOfferSearch}
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                            >
                                Clear
                            </button>
                        )}
                        <Link to="/reports" style={{ color: '#0B7F7B', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>Full report</Link>
                    </div>
                </div>
                <ProgressBar visible={loadingOfferStats} />
                {loadingOfferStats && offerStatistics.length === 0 ? (
                    <SkeletonTable rows={5} cols={7} />
                ) : offerStatistics && offerStatistics.length > 0 ? (
                    <>
                        <div className="scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Offer</th>
                                        <th className="align-right pointer" onClick={() => handleOfferSort('clicks')}>Clicks {offerSort.by === 'clicks' ? (offerSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                        <th className="align-right pointer" onClick={() => handleOfferSort('conversions')}>Conv {offerSort.by === 'conversions' ? (offerSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                        <th className="align-right pointer" onClick={() => handleOfferSort('approved_conversions')}>Approved {offerSort.by === 'approved_conversions' ? (offerSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                        <th className="align-right pointer" onClick={() => handleOfferSort('conversion_ratio')}>CVR {offerSort.by === 'conversion_ratio' ? (offerSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                        <th className="align-right pointer" onClick={() => handleOfferSort('affiliate_payout')}>Payout {offerSort.by === 'affiliate_payout' ? (offerSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                        <th className="align-right pointer" onClick={() => handleOfferSort('profit')}>Profit {offerSort.by === 'profit' ? (offerSort.order === 'ASC' ? '▲' : '▼') : ''}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offerStatistics.map((stat, idx) => (
                                        <tr key={stat.offer_id || idx}>
                                            <td>
                                                <Link to={`/offer/detail/${stat.display_id || stat.offer_id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
                                                    <span className="id">{stat.display_id || stat.offer_id}</span>
                                                    <span style={{ fontWeight: 600 }}>{stat.offer_name}</span>
                                                </Link>
                                            </td>
                                            <td className="align-right font-mono">{formatNumber(stat.clicks)}</td>
                                            <td className="align-right font-mono font-bold">{formatNumber(stat.conversions)}</td>
                                            <td className="align-right font-mono" style={{ color: '#1B6B36', fontWeight: 600 }}>{formatNumber(stat.approved_conversions || 0)}</td>
                                            <td className="align-right font-mono">{stat.conversion_ratio}%</td>
                                            <td className="align-right font-mono">{formatCurrency(stat.affiliate_payout ?? stat.publisher_revenue)}</td>
                                            <td className="align-right font-mono" style={{ color: stat.profit >= 0 ? '#1B6B36' : '#DC2626', fontWeight: 600 }}>
                                                {formatCurrency(stat.profit)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination 
                            current={offerPage} 
                            total={totalOffers} 
                            limit={10} 
                            onPageChange={setOfferPage} 
                        />
                    </>
                ) : (
                    <div className="no-data">
                        {offerSearchApplied
                            ? `No offers found matching "${offerSearchApplied}"`
                            : 'No offer statistics available'}
                    </div>
                )}
            </section>
        </main>
    );
}

export default Dashboard;
