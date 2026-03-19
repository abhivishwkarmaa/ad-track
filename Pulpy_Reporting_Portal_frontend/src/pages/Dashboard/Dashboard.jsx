import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRefresh } from '../../context/RefreshContext';
import { dashboardAPI } from '../../services/api';
import { formatDateIST } from '../../utils/dateTime';
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
            <DashboardContent />
        </>
    );
}

function DashboardContent() {
    const { user } = useAuth();
    const { refreshKey } = useRefresh();

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
    const [pubPage, setPubPage] = useState(1);
    const [totalPublishers, setTotalPublishers] = useState(0);

    const cardsRequestSeqRef = useRef(0);

    // Date range calculator (current period + previous period for comparison)
    const { dateRange, previousRange, periodLabels } = useMemo(() => {
        const current = getTimelineRange(dateFilter, customRange);
        const fromDate = current.from ? new Date(current.from) : null;
        const toDate = current.to ? new Date(current.to) : null;

        let previous = null;
        if (fromDate && toDate) {
            const dayMs = 24 * 60 * 60 * 1000;
            const days = Math.max(1, Math.floor((toDate - fromDate) / dayMs) + 1);
            const prevTo = new Date(fromDate);
            prevTo.setDate(prevTo.getDate() - 1);
            const prevFrom = new Date(prevTo);
            prevFrom.setDate(prevFrom.getDate() - (days - 1));
            const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            previous = { from: toYmd(prevFrom), to: toYmd(prevTo) };
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
    }, [dateFilter, customRange]);

    const groupBy = (dateFilter === 'today' || dateFilter === 'yesterday') ? 'hour' : 'day';
    const baseParams = { date_from: dateRange.from, date_to: dateRange.to, limit: 10 };

    // 1. Core Dashboard Data (Cards, Charts, Summary) - Depends on Date Range
    useEffect(() => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;

        let cancelled = false;
        const mountCheck = () => !cancelled;
        const cardsReqId = ++cardsRequestSeqRef.current;

        setLoadingCards(true);
        setLoadingPerformance(true);
        setLoadingSummary(true);
        setLoadingLiveOffers(true);
        setLoadingComparison(true);

        // Fetch Cards
        dashboardAPI.getDashboardCards(baseParams)
            .then(res => {
                const isStale = cardsReqId !== cardsRequestSeqRef.current;
                if (mountCheck() && !isStale && res.success) setCards(res.data || {});
            })
            .catch(err => mountCheck() && console.error('Cards error:', err))
            .finally(() => {
                if (mountCheck() && cardsReqId === cardsRequestSeqRef.current) setLoadingCards(false);
            });

        // Fetch Chart
        dashboardAPI.getPerformance({ ...baseParams, group_by: groupBy })
            .then(res => mountCheck() && res.success && setPerformanceChart(res.data || []))
            .catch(err => mountCheck() && console.error('Performance error:', err))
            .finally(() => mountCheck() && setLoadingPerformance(false));

        // Fetch Summary
        dashboardAPI.getPerformanceSummary(baseParams)
            .then(res => mountCheck() && res.success && setSummary(res.data || {}))
            .catch(err => mountCheck() && console.error('Summary error:', err))
            .finally(() => mountCheck() && setLoadingSummary(false));

        if (previousRange) {
            dashboardAPI.getPerformanceSummary({ date_from: previousRange.from, date_to: previousRange.to })
                .then(res => mountCheck() && res.success && setSummaryPrevious(res.data || null))
                .catch(err => mountCheck() && console.error('Summary previous error:', err));
        } else {
            setSummaryPrevious(null);
        }

        // Fetch Live Offers (Static limit)
        dashboardAPI.getLiveOffers({ limit: 5 })
            .then(res => mountCheck() && res.success && setLiveOffers(res.data || []))
            .catch(err => mountCheck() && console.error('Live offers error:', err))
            .finally(() => mountCheck() && setLoadingLiveOffers(false));

        // Fetch Comparison
        if (previousRange) {
            const prevParams = { previous_from: previousRange.from, previous_to: previousRange.to };
            dashboardAPI.getPerformanceComparison({ ...baseParams, ...prevParams, group_by: groupBy })
                .then(res => mountCheck() && res.success && setPerformanceComparison(res.data || []))
                .catch(err => mountCheck() && console.error('Comparison error:', err))
                .finally(() => mountCheck() && setLoadingComparison(false));
        } else {
            setPerformanceComparison([]);
            setLoadingComparison(false);
        }

        return () => { cancelled = true; };
    }, [dateRange.from, dateRange.to, previousRange?.from, previousRange?.to, refreshKey]);

    // 2. Offer Statistics - Depends on sorting and page
    useEffect(() => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;
        let cancelled = false;
        setLoadingOfferStats(true);
        dashboardAPI.getOfferStatistics({ ...baseParams, sort_by: offerSort.by, order_by: offerSort.order, page: offerPage })
            .then(res => {
                if (!cancelled && res.success) {
                    setOfferStatistics(res.data.data || []);
                    setTotalOffers(res.data.total || 0);
                }
            })
            .catch(err => !cancelled && console.error('Offer stats error:', err))
            .finally(() => !cancelled && setLoadingOfferStats(false));
        return () => { cancelled = true; };
    }, [dateRange.from, dateRange.to, offerSort, offerPage, refreshKey]);

    // 3. Publisher Statistics - Depends on sorting and page
    useEffect(() => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;
        let cancelled = false;
        setLoadingPublisherStats(true);
        dashboardAPI.getPublisherStatistics({ ...baseParams, sort_by: pubSort.by, order_by: pubSort.order, page: pubPage })
            .then(res => {
                if (!cancelled && res.success) {
                    setPublisherStatistics(res.data.data || []);
                    setTotalPublishers(res.data.total || 0);
                }
            })
            .catch(err => !cancelled && console.error('Publisher stats error:', err))
            .finally(() => !cancelled && setLoadingPublisherStats(false));
        return () => { cancelled = true; };
    }, [dateRange.from, dateRange.to, pubSort, pubPage, refreshKey]);

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

    const todayStr = formatDateIST(new Date(), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }, 'en-US');

    const statCardsConfig = [
        {
            key: 'total-clicks',
            className: 'stat-item-purple',
            icon: <ClickIcon />,
            value: formatNumber(cardsData.clicks?.total || 0),
            label: 'Total Clicks'
        },
        {
            key: 'total-conversions',
            className: 'stat-item-teal',
            icon: <ConversionIcon />,
            value: formatNumber(cardsData.conversions?.total || 0),
            label: 'Total Conversions'
        },
        {
            key: 'approved-conversions',
            className: 'stat-item-green',
            icon: <ConversionIcon />,
            value: formatNumber(cardsData.conversions?.approved || 0),
            label: 'Approved Conversions'
        },
        {
            key: 'pending-conversions',
            className: 'stat-item-amber',
            icon: <ConversionIcon />,
            value: formatNumber(cardsData.conversions?.pending || 0),
            label: 'Pending Conversions'
        },
        {
            key: 'click-expired',
            className: 'stat-item-neutral',
            icon: <ConversionIcon />,
            value: formatNumber(cardsData.conversions?.click_expired || cardsData.conversions?.click_expired_conversions || 0),
            label: 'Click Expired'
        },
        {
            key: 'total-revenue',
            className: 'stat-item-red',
            icon: <RevenueIcon />,
            value: formatCurrency(cardsData.revenue?.total || 0),
            label: 'Total Revenue'
        },
        {
            key: 'approved-payout',
            className: 'stat-item-green',
            icon: <RevenueIcon />,
            value: formatCurrency(cardsData.revenue?.approved_payout || 0),
            label: 'Approved Payout'
        },
        {
            key: 'profit',
            className: 'stat-item-profit',
            icon: <RevenueIcon />,
            value: formatCurrency((cardsData.revenue?.total || 0) - (cardsData.revenue?.approved_payout || 0)),
            label: 'Profit'
        }
    ];

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-header-left">
                    <h1>Dashboard</h1>
                    <p className="dashboard-date"><CalendarIcon /> {todayStr}</p>
                </div>
                <div className="dashboard-header-right">

                    <TimelineFilter
                        value={dateFilter}
                        customRange={customRange}
                        onPresetChange={setDateFilter}
                        onCustomRangeChange={setCustomRange}
                        className="date-filter-container"
                    />
                    <span className="welcome-text">Welcome, <strong>{user?.name || user?.fullName || 'User'}</strong></span>
                </div>
            </div>

            {/* Quick Actions - Static, on top */}
            <div className="quick-actions-row">
                <Link to="/offer/new" className="action-btn">
                    <div className="action-icon blue"><PlusIcon /></div>
                    <span>New Offer</span>
                </Link>
                <Link to="/affiliate/new" className="action-btn">
                    <div className="action-icon green"><AffiliateIcon /></div>
                    <span>Add Publisher</span>
                </Link>
                <Link to="/advertiser/new" className="action-btn">
                    <div className="action-icon orange"><AdvertiserIcon /></div>
                    <span>Add Advertiser</span>
                </Link>
                <Link to="/offer/list" className="action-btn">
                    <div className="action-icon purple"><ListIcon /></div>
                    <span>View All Offers</span>
                </Link>
            </div>

            {/* KPI Cards - One box like Quick Actions */}
            <div className="stats-cards-box">
                <div className="stats-cards-inner">
                    {statCardsConfig.map((card) => (
                        <StatCard
                            key={card.key}
                            loading={loadingCards}
                            className={card.className}
                            icon={card.icon}
                            value={card.value}
                            label={card.label}
                        />
                    ))}
                </div>
            </div>

            <div className="dashboard-content">
                {/* Performance Chart */}
                <div className="dashboard-card chart-card">
                    <div className="card-header">
                        <h3>Performance Chart</h3>
                        <span className="period-indicator">{periodLabels.current}</span>
                    </div>
                    <div className="chart-wrapper">
                        {loadingPerformance ? (
                            <SkeletonChart />
                        ) : (
                            <ResponsiveContainer debounce={300}>
                                <AreaChart data={processedPerformanceChart}>
                                    <defs>
                                        <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="clicks" stroke="#8884d8" strokeWidth={3} fillOpacity={1} fill="url(#colorClicks)" animationDuration={1000} animationEasing="ease-out" />
                                    <Area type="monotone" dataKey="conversions" stroke="#82ca9d" strokeWidth={3} fillOpacity={1} fill="url(#colorConversions)" animationDuration={1000} animationEasing="ease-out" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>



                {/* Live Offers */}
                <div className="dashboard-card recent-offers-card">
                    <div className="card-header">
                        <h3>Live Offers</h3>
                        <Link to="/offer/list" className="view-all">View All</Link>
                    </div>
                    {loadingLiveOffers ? (
                        <SkeletonList rows={5} />
                    ) : liveOffers && liveOffers.length > 0 ? (
                        <div className="offers-list">
                            {liveOffers.slice(0, 5).map(offer => (
                                <Link to={`/offer/detail/${offer.id}`} key={offer.id} className="offer-row" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
                                    <div className="offer-info">
                                        <span className="offer-name">{offer.name}</span>
                                        <span className="offer-id">ID: {offer.display_id || offer.id}</span>
                                    </div>
                                    <div className="offer-meta">
                                        <span className="offer-payout">${offer.payout}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : <div className="no-data">No live offers</div>}
                </div>

                {/* Summary — current period vs previous period */}
                <div className="dashboard-card summary-reports-card">
                    <div className="card-header">
                        <h3>Performance Summary</h3>
                        <span className="period-indicator">{periodLabels.current} vs {periodLabels.previous}</span>
                    </div>

                    {/* Performance Comparison Chart (NOW AT TOP) */}
                    {loadingComparison ? (
                        <div className="chart-container summary-chart">
                            <SkeletonChart />
                        </div>
                    ) : performanceComparison && performanceComparison.length > 0 ? (
                        <div className="chart-container summary-chart">
                            <ResponsiveContainer width="100%" height="100%" debounce={300}>
                                <AreaChart data={processedComparisonChart} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0088FE" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#0088FE" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorPrevious" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#d1d5db" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#d1d5db" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        interval="preserveStartEnd"
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#fff',
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                        }}
                                        labelStyle={{ color: '#1e293b', fontWeight: 600, marginBottom: '4px' }}
                                        formatter={(value, name) => [value, name === 'clicks_current' ? periodLabels.current : periodLabels.previous]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="clicks_current"
                                        name="clicks_current"
                                        stroke="#0088FE"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorCurrent)"
                                        animationDuration={1000}
                                        animationEasing="ease-out"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="clicks_previous"
                                        name="clicks_previous"
                                        stroke="#9ca3af"
                                        strokeWidth={3}
                                        strokeDasharray="4 4"
                                        fillOpacity={1}
                                        fill="url(#colorPrevious)"
                                        animationDuration={1000}
                                        animationEasing="ease-out"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : <div className="no-data summary-no-data">No comparison data available</div>}

                    {/* KPI Stats (BELOW CHART - COMPACT) */}
                    {loadingSummary ? (
                        <SkeletonSummary />
                    ) : (
                        <div className="summary-grid summary-kpi-grid">
                            <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                                <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Unique Clicks</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span className="summary-value" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatNumber(summary.unique_clicks)}</span>
                                    {summaryPrevious != null && (
                                        <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            prev: {formatNumber(summaryPrevious.unique_clicks)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                                <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Conversions</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span className="summary-value" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatNumber(summary.conversions)}</span>
                                    {summaryPrevious != null && (
                                        <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            prev: {formatNumber(summaryPrevious.conversions)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                                <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Revenue</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span className="summary-value" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatCurrency(summary.revenue)}</span>
                                    {summaryPrevious != null && (
                                        <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            prev: {formatCurrency(summaryPrevious.revenue)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                                <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Profit</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span className="summary-value profit" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatCurrency(summary.profit)}</span>
                                    {summaryPrevious != null && (
                                        <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            prev: {formatCurrency(summaryPrevious.profit)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Offer Statistics (Moved Here) */}
                <div className="dashboard-card offer-stats-card">
                    <div className="card-header">
                        <h3>Offer Statistics</h3>
                        <Link to="/reports" className="view-all">View Full Report</Link>
                    </div>
                    <ProgressBar visible={loadingOfferStats} />
                    {loadingOfferStats && offerStatistics.length === 0 ? (
                        <SkeletonTable rows={5} cols={8} className="stats-table stats-table-offer" />
                    ) : offerStatistics && offerStatistics.length > 0 ? (
                        <>
                            <div className="activity-table stats-table stats-table-offer">
                                <div className="table-header">
                                <div className="sortable-header align-left" style={{ cursor: 'default', display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>Offer</div>
                                    <SortableHeader label="Clicks" field="clicks" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                    <SortableHeader label="Total Conv" field="conversions" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                    <SortableHeader label="Approved" field="approved_conversions" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                    <SortableHeader label="Pending" field="pending_conversions" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                    <SortableHeader label="CR" field="conversion_ratio" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                    <SortableHeader label="Payout" field="affiliate_payout" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                    <SortableHeader label="Profit" field="profit" currentSort={offerSort} onSort={handleOfferSort} align="center" />
                                </div>
                                {offerStatistics.map((stat, index) => (
                                    <Link
                                        to={`/offer/detail/${stat.display_id || stat.offer_id}`}
                                        key={stat.offer_id || index}
                                        className="table-row table-row-link"
                                    >
                                        <div className="offer-name-cell align-left" title={stat.offer_name}>
                                            <span className="id-badge">{stat.display_id}</span> {stat.offer_name}
                                        </div>
                                        <span className="align-center">{formatNumber(stat.clicks)}</span>
                                        <span className="align-center">{formatNumber(stat.conversions)}</span>
                                        <span className="align-center" style={{ color: 'green' }}>{formatNumber(stat.approved_conversions || 0)}</span>
                                        <span className="align-center" style={{ color: '#ffb800' }}>{formatNumber(stat.pending_conversions || 0)}</span>
                                        <span className="align-center">{stat.conversion_ratio}%</span>
                                        <span className="align-center">{formatCurrency(stat.affiliate_payout)}</span>
                                        <span className="align-center" style={{ color: stat.profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)', fontWeight: '600' }}>
                                            {formatCurrency(stat.profit)}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                            <Pagination 
                                current={offerPage} 
                                total={totalOffers} 
                                limit={10} 
                                onPageChange={setOfferPage} 
                            />
                        </>
                    ) : <div className="no-data">No offer statistics available</div>}
                </div>

                {/* Publisher Statistics */}
                <div className="dashboard-card publisher-stats-card">
                    <div className="card-header">
                        <h3>Publisher Statistics</h3>
                        <Link to="/reports" className="view-all">View Full Report</Link>
                    </div>
                    <ProgressBar visible={loadingPublisherStats} />
                    {loadingPublisherStats && publisherStatistics.length === 0 ? (
                        <SkeletonTable rows={5} cols={8} className="stats-table stats-table-publisher" />
                    ) : publisherStatistics && publisherStatistics.length > 0 ? (
                        <>
                            <div className="activity-table stats-table stats-table-publisher">
                                <div className="table-header">
                                <div className="sortable-header align-left" style={{ cursor: 'default', display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>Publisher</div>
                                    <SortableHeader label="Clicks" field="clicks" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                    <SortableHeader label="Total Conv" field="conversions" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                    <SortableHeader label="Approved" field="approved_conversions" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                    <SortableHeader label="Pending" field="pending_conversions" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                    <SortableHeader label="Pub Rev" field="affiliate_payout" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                    <SortableHeader label="Revenue" field="total_revenue" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                    <SortableHeader label="Profit" field="profit" currentSort={pubSort} onSort={handlePubSort} align="center" />
                                </div>
                                {publisherStatistics.map((stat, index) => (
                                    <div
                                        key={stat.publisher_id || index}
                                        className="table-row"
                                    >
                                        <div className="offer-name-cell align-left" title={stat.publisher_name}>
                                            <span className="id-badge">{stat.public_id}</span> {stat.publisher_name}
                                        </div>
                                        <span className="align-center">{formatNumber(stat.clicks)}</span>
                                        <span className="align-center">{formatNumber(stat.conversions)}</span>
                                        <span className="align-center" style={{ color: 'green' }}>{formatNumber(stat.approved_conversions)}</span>
                                        <span className="align-center" style={{ color: '#ffb800' }}>{formatNumber(stat.pending_conversions)}</span>
                                        <span className="align-center">{formatCurrency(stat.affiliate_payout)}</span>
                                        <span className="align-center">{formatCurrency(stat.total_revenue)}</span>
                                        <span className="align-center" style={{ color: stat.profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)', fontWeight: '600' }}>
                                            {formatCurrency(stat.profit)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <Pagination 
                                current={pubPage} 
                                total={totalPublishers} 
                                limit={10} 
                                onPageChange={setPubPage} 
                            />
                        </>
                    ) : <div className="no-data">No publisher statistics available</div>}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
