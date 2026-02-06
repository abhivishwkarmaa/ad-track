import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRefresh } from '../../context/RefreshContext';
import { dashboardAPI } from '../../services/api';
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

const ArrowUpIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="18 15 12 9 6 15" />
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
const TrendIndicator = ({ current, previous }) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    const isPositive = change >= 0;
    return (
        <div className={`stat-trend ${isPositive ? 'up' : 'down'}`}>
            <ArrowUpIcon style={{ transform: isPositive ? 'none' : 'rotate(180deg)' }} />
            <span>{Math.abs(change).toFixed(1)}%</span>
        </div>
    );
};

const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    return `$${parseFloat(amount).toFixed(2)}`;
};

// --- MAIN DASHBOARD COMPONENT ---
function Dashboard() {
    const { user } = useAuth();
    const { refreshKey, triggerRefresh } = useRefresh();

    // Single consolidated state
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateFilter, setDateFilter] = useState('today');

    // Date range calculator (current period + previous period for comparison)
    const { dateRange, previousRange, periodLabels } = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const formatDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const ranges = {
            today: { from: formatDate(today), to: formatDate(today) },
            yesterday: (() => {
                const d = new Date(today);
                d.setDate(d.getDate() - 1);
                return { from: formatDate(d), to: formatDate(d) };
            })(),
            this_week: (() => {
                const d = new Date(today);
                d.setDate(d.getDate() - d.getDay());
                return { from: formatDate(d), to: formatDate(today) };
            })(),
            this_month: (() => {
                const d = new Date(today.getFullYear(), today.getMonth(), 1);
                return { from: formatDate(d), to: formatDate(today) };
            })(),
            last_month: (() => {
                const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const end = new Date(today.getFullYear(), today.getMonth(), 0);
                return { from: formatDate(start), to: formatDate(end) };
            })()
        };

        // Previous period ranges for comparison (today vs yesterday, this week vs previous week, etc.)
        const prevRanges = {
            today: (() => {
                const d = new Date(today);
                d.setDate(d.getDate() - 1);
                return { from: formatDate(d), to: formatDate(d) };
            })(),
            yesterday: (() => {
                const d = new Date(today);
                d.setDate(d.getDate() - 2);
                return { from: formatDate(d), to: formatDate(d) };
            })(),
            this_week: (() => {
                const weekStart = new Date(today);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                const prevEnd = new Date(weekStart);
                prevEnd.setDate(prevEnd.getDate() - 1);
                const prevStart = new Date(prevEnd);
                prevStart.setDate(prevStart.getDate() - 6);
                return { from: formatDate(prevStart), to: formatDate(prevEnd) };
            })(),
            this_month: (() => {
                const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const end = new Date(today.getFullYear(), today.getMonth(), 0);
                return { from: formatDate(start), to: formatDate(end) };
            })(),
            last_month: (() => {
                const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
                const end = new Date(today.getFullYear(), today.getMonth() - 1, 0);
                return { from: formatDate(start), to: formatDate(end) };
            })()
        };

        const labels = {
            today: { current: 'Today', previous: 'Yesterday' },
            yesterday: { current: 'Yesterday', previous: 'Day before' },
            this_week: { current: 'This Week', previous: 'Previous Week' },
            this_month: { current: 'This Month', previous: 'Previous Month' },
            last_month: { current: 'Last Month', previous: 'Month before' }
        };

        const current = ranges[dateFilter] || ranges.today;
        const previous = prevRanges[dateFilter] || null;
        const labelsForPeriod = labels[dateFilter] || { current: dateFilter.replace('_', ' '), previous: 'Previous' };

        return {
            dateRange: current,
            previousRange: previous,
            periodLabels: labelsForPeriod
        };
    }, [dateFilter]);

    // ✅ SINGLE API CALL
    useEffect(() => {
        let isMounted = true;

        const fetchDashboard = async () => {
            try {
                setLoading(true);
                setError(null);

                // One call to get EVERYTHING (include previous period for Performance Summary comparison)
                const params = {
                    date_from: dateRange.from,
                    date_to: dateRange.to,
                    group_by: (dateFilter === 'today' || dateFilter === 'yesterday') ? 'hour' : 'day',
                    limit: 10
                };
                if (previousRange) {
                    params.previous_from = previousRange.from;
                    params.previous_to = previousRange.to;
                }
                const response = await dashboardAPI.getDashboard(params);

                if (isMounted) {
                    if (response.success && response.data) {
                        setDashboardData(response.data);
                    } else {
                        throw new Error(response.message || 'Failed to load dashboard data');
                    }
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Dashboard Load Error:', err);
                    setError(err.message || 'Failed to connect to server');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchDashboard();

        return () => { isMounted = false; };
    }, [dateRange, refreshKey]);

    // Safely extract data parts with defaults
    const {
        cards = {},
        topOffers = [],
        performanceChart = [],
        topAffiliates = {},
        summary = {},
        summary_previous = null, // Previous period summary for comparison
        liveOffers = [], // Live offers list
        recentActivity = [], // Detailed activity
        offerStatistics = [], // Offer stats table
        performanceComparison = [] // Comparison chart data
    } = dashboardData || {};

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

    // For Top Publishers list (Handle different structure if any)
    const publisherList = topAffiliates.data || [];

    if (loading && !dashboardData) {
        return (
            <div className="dashboard">
                <div className="dashboard-loading">
                    <div className="spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error && !dashboardData) {
        return (
            <div className="dashboard">
                <div className="dashboard-error">
                    <p>Error: {error}</p>
                    <button onClick={() => window.location.reload()}>Retry</button>
                </div>
            </div>
        );
    }



    const todayStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-header-left">
                    <h1>Dashboard</h1>
                    <p className="dashboard-date"><CalendarIcon /> {todayStr}</p>
                </div>
                <div className="dashboard-header-right">
                    <button
                        className="refresh-btn"
                        onClick={() => triggerRefresh && triggerRefresh()}
                        title="Refresh Data"
                        style={{
                            marginRight: '12px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                    </button>
                    <div className="date-filter-container">
                        <label htmlFor="date-filter">Filter:</label>
                        <select
                            id="date-filter"
                            className="date-filter-select"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        >
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                            <option value="last_month">Last Month</option>
                        </select>
                    </div>
                    <span className="welcome-text">Welcome, <strong>{user?.name || user?.fullName || 'User'}</strong></span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid">
                <div className="stat-card blue">
                    <div className="stat-icon"><OfferIcon /></div>
                    <div className="stat-info">
                        <span className="stat-value">{cards.offers?.total || 0}</span>
                        <span className="stat-label">Total Offers</span>
                    </div>
                    <div className="stat-badge">{cards.offers?.active || 0} Active</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-icon"><AffiliateIcon /></div>
                    <div className="stat-info">
                        <span className="stat-value">{cards.publishers?.total || 0}</span>
                        <span className="stat-label">Publishers</span>
                    </div>
                    <div className="stat-badge">{cards.publishers?.active || 0} Active</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-icon"><ClickIcon /></div>
                    <div className="stat-info">
                        <span className="stat-value">{formatNumber(cards.clicks?.total || 0)}</span>
                        <span className="stat-label">Total Clicks</span>
                    </div>
                    <TrendIndicator current={cards.clicks?.total || 0} previous={cards.clicks?.yesterday || 0} />
                    <div className="stat-badge">{formatNumber(cards.clicks?.unique || 0)} Unique</div>
                </div>

                <div className="stat-card teal">
                    <div className="stat-icon"><ConversionIcon /></div>
                    <div className="stat-info">
                        <span className="stat-value">{formatNumber(cards.conversions?.total || 0)}</span>
                        <span className="stat-label">Conversions</span>
                    </div>
                    <TrendIndicator current={cards.conversions?.total || 0} previous={cards.conversions?.yesterday || 0} />
                    <div className="stat-badge">
                        {cards.conversions?.approved || 0} Approved
                    </div>
                </div>

                <div className="stat-card red">
                    <div className="stat-icon"><RevenueIcon /></div>
                    <div className="stat-info">
                        <span className="stat-value">{formatCurrency(cards.revenue?.total || 0)}</span>
                        <span className="stat-label">Total Revenue</span>
                    </div>
                    <div className="stat-badge">
                        Profit: {formatCurrency(cards.revenue?.profit || 0)}
                    </div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-icon"><AdvertiserIcon /></div>
                    <div className="stat-info">
                        <span className="stat-value">{cards.advertisers?.total || 0}</span>
                        <span className="stat-label">Advertisers</span>
                    </div>
                    <div className="stat-badge">{cards.advertisers?.active || 0} Active</div>
                </div>
            </div>

            <div className="dashboard-content">
                {/* Quick Actions */}
                <div className="dashboard-card quick-actions-card">
                    <div className="card-header"><h3>Quick Actions</h3></div>
                    <div className="quick-actions-grid">
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
                </div>

                {/* Performance Chart */}
                <div className="dashboard-card chart-card">
                    <div className="card-header">
                        <h3>Performance Chart</h3>
                        <span className="period-indicator">{periodLabels.current}</span>
                    </div>
                    <div style={{ width: '100%', height: 300, minHeight: 300 }}> {/* Ensure explicit minHeight */}
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
                    </div>
                </div>



                {/* Live Offers */}
                <div className="dashboard-card recent-offers-card">
                    <div className="card-header">
                        <h3>Live Offers</h3>
                        <Link to="/offer/list" className="view-all">View All</Link>
                    </div>
                    {liveOffers && liveOffers.length > 0 ? (
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

                {/* Top Publishers */}
                <div className="dashboard-card affiliates-card">
                    <div className="card-header">
                        <h3>Top Publishers</h3>
                        <Link to="/affiliate/manage" className="view-all">View All</Link>
                    </div>
                    {publisherList && publisherList.length > 0 ? (
                        <div className="affiliates-list">
                            {publisherList.map((aff, idx) => (
                                <div key={aff.publisher_id || idx} className="affiliate-row">
                                    <div className="affiliate-rank">#{idx + 1}</div>
                                    <div className="affiliate-info">
                                        <span className="affiliate-name">{aff.publisher_name}</span>
                                        <span className="affiliate-email">{formatNumber(aff.conversions)} conv</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div className="no-data">No active publishers</div>}
                </div>

                {/* Summary — current period vs previous period */}
                <div className="dashboard-card summary-reports-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-header">
                        <h3>Performance Summary</h3>
                        <span className="period-indicator">{periodLabels.current} vs {periodLabels.previous}</span>
                    </div>

                    {/* Performance Comparison Chart (NOW AT TOP) */}
                    {performanceComparison && performanceComparison.length > 0 ? (
                        <div className="chart-container" style={{ marginTop: '0px', marginBottom: '16px', height: '280px', width: '100%', flexShrink: 0, minHeight: 280 }}> {/* explicit minHeight */}
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
                    ) : <div className="no-data" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No comparison data available</div>}

                    {/* KPI Stats (BELOW CHART - COMPACT) */}
                    <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: 'auto' }}>
                        <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                            <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Unique Clicks</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="summary-value" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatNumber(summary.unique_clicks)}</span>
                                {summary_previous != null && (
                                    <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        prev: {formatNumber(summary_previous.unique_clicks)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                            <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Conversions</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="summary-value" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatNumber(summary.conversions)}</span>
                                {summary_previous != null && (
                                    <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        prev: {formatNumber(summary_previous.conversions)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                            <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Revenue</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="summary-value" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatCurrency(summary.revenue)}</span>
                                {summary_previous != null && (
                                    <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        prev: {formatCurrency(summary_previous.revenue)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="summary-item" style={{ padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                            <div className="summary-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Profit</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="summary-value profit" style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatCurrency(summary.profit)}</span>
                                {summary_previous != null && (
                                    <span className="summary-previous" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        prev: {formatCurrency(summary_previous.profit)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Offer Statistics (Moved Here) */}
                <div className="dashboard-card offer-stats-card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <h3>Offer Statistics</h3>
                        <Link to="/reports" className="view-all">View Full Report</Link>
                    </div>
                    {offerStatistics && offerStatistics.length > 0 ? (
                        <div className="activity-table">
                            <div className="table-header" style={{ gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr 1fr 1fr 1fr' }}>
                                <span>Offer</span>
                                <span>Clicks</span>
                                <span>Conv</span>
                                <span>CR</span>
                                <span>Payout</span>
                                <span>Profit</span>
                            </div>
                            {offerStatistics.map((stat, index) => (
                                <div key={stat.offer_id || index} className="table-row" style={{ gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr 1fr 1fr 1fr' }}>
                                    <Link to={`/offer/detail/${stat.display_id || stat.offer_id}`} className="offer-name-cell" title={stat.offer_name}>
                                        <span className="id-badge">{stat.display_id}</span> {stat.offer_name}
                                    </Link>
                                    <span>{formatNumber(stat.clicks)}</span>
                                    <span>{formatNumber(stat.conversions)}</span>
                                    <span>{stat.conversion_ratio}%</span>
                                    <span>{formatCurrency(stat.affiliate_payout)}</span>
                                    <span className={stat.profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                                        {formatCurrency(stat.profit)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : <div className="no-data">No offer statistics available</div>}
                </div>

                {/* Recent Activity */}
                <div className="dashboard-card recent-activity-card">
                    <div className="card-header">
                        <h3>Recent Activity</h3>
                        <Link to="/reports" className="view-all">Detailed Reports</Link>
                    </div>
                    {recentActivity && recentActivity.length > 0 ? (
                        <div className="activity-table">
                            <div className="table-header">
                                <span>Time</span>
                                <span>Offer</span>
                                <span>Publisher</span>
                                <span>Status</span>
                                <span>Rev</span>
                            </div>
                            {recentActivity.map((item, index) => (
                                <div key={item.id || index} className="table-row">
                                    <span>{new Date(item.time).toLocaleTimeString()}</span>
                                    <span>
                                        <Link to={`/offer/detail/${item.offer?.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                            {item.offer?.name}
                                        </Link>
                                    </span>
                                    <span>{item.publisher}</span>
                                    <span className={`status-pill ${item.conversion_status.toLowerCase()}`}>{item.conversion_status}</span>
                                    <span>${item.revenue}</span>
                                </div>
                            ))}
                        </div>
                    ) : <div className="no-data">No recent activity</div>}
                </div>
            </div>
        </div >
    );
}

export default Dashboard;
