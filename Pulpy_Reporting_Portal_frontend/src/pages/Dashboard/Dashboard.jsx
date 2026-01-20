import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { dashboardAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ErrorFallback from '../../components/ErrorBoundary/ErrorFallback';
import './Dashboard.css';

// Icons
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const ClockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const ArrowDownIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const ArrowUpIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="18 15 12 9 6 15" />
    </svg>
);

const ImpressionsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
);

const ClickIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
);

const RevenueIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
);

const PayoutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
    </svg>
);

const ProfitIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
    </svg>
);

const ConversionIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
    </svg>
);

const BookIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
);

const DocumentIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
);

const UserIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const LinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
);

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
);

const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0114.85 3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
);

const COLORS = ['#E9A248', '#1BB6B8', '#A85D5D', '#1A273D', '#9BA3AC', '#F4F4F4'];

function Dashboard() {
    const { user } = useAuth();
    const toast = useToast();
    const [dashboardCards, setDashboardCards] = useState(null);
    const [topOffers, setTopOffers] = useState([]);
    const [performanceData, setPerformanceData] = useState([]);
    const [topAffiliates, setTopAffiliates] = useState([]);
    const [topCountries, setTopCountries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateFilter, setDateFilter] = useState('today');
    const [topOffersTab, setTopOffersTab] = useState('offers');

    // Fetch all dashboard data
    useEffect(() => {
        const fetchAllData = async () => {
            try {
                setLoading(true);
                setError(null);
                const [cardsRes, offersRes, performanceRes, affiliatesRes, countriesRes] = await Promise.all([
                    dashboardAPI.getDashboardCards(),
                    dashboardAPI.getTopOffers({ limit: 10 }),
                    dashboardAPI.getPerformance({ date_from: getDateFromFilter('today'), group_by: 'day' }),
                    dashboardAPI.getTopAffiliates({ limit: 10 }),
                    dashboardAPI.getTopCountries({ limit: 10 })
                ]);

                if (cardsRes.success) setDashboardCards(cardsRes.data);
                if (offersRes.success) setTopOffers(offersRes.data || []);
                if (performanceRes.success) setPerformanceData(performanceRes.data || []);
                if (affiliatesRes.success) setTopAffiliates(affiliatesRes.data || []);
                if (countriesRes.success) setTopCountries(countriesRes.data || []);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
                
                // Check if it's an auth/permission error
                const errorMessage = err?.message || err?.toString() || '';
                const isAuthError = errorMessage.includes('subdomain') || 
                                   errorMessage.includes('Unauthorized') || 
                                   errorMessage.includes('Forbidden') || 
                                   errorMessage.includes('suspended') ||
                                   errorMessage.includes('expired') ||
                                   errorMessage.includes('401') ||
                                   errorMessage.includes('403');
                
                if (isAuthError) {
                    // Show error fallback for auth errors
                    setError(err);
                } else {
                    // Show toast for other errors
                    toast.error('Failed to load dashboard data');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, []);

    const getDateFromFilter = (filter) => {
        const today = new Date();
        const dateFrom = new Date();
        switch (filter) {
            case 'today':
                return today.toISOString().split('T')[0];
            case 'yesterday':
                dateFrom.setDate(dateFrom.getDate() - 1);
                return dateFrom.toISOString().split('T')[0];
            case 'week':
                dateFrom.setDate(dateFrom.getDate() - 7);
                return dateFrom.toISOString().split('T')[0];
            case 'month':
                dateFrom.setMonth(dateFrom.getMonth() - 1);
                return dateFrom.toISOString().split('T')[0];
            default:
                return today.toISOString().split('T')[0];
        }
    };

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '0.00';
        return parseFloat(amount).toFixed(2);
    };

    const calculateTrend = (current, previous) => {
        if (!previous || previous === 0) return { value: '0', isPositive: true };
        const change = ((current - previous) / previous) * 100;
        return {
            value: Math.abs(change).toFixed(0),
            isPositive: change >= 0
        };
    };

    const handleCopyLink = (link) => {
        navigator.clipboard.writeText(link);
        toast.success('Link copied to clipboard');
    };

    const stats = dashboardCards || {};

    // Show error fallback for auth/permission errors
    if (error) {
        return <ErrorFallback error={error} resetError={() => window.location.reload()} />;
    }

    if (loading) {
        return (
            <div className="dashboard">
                <div className="dashboard-loading">
                    <div className="spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            {/* Onboarding Steps */}
            <div className="onboarding-section">
                <div className="onboarding-header">
                    <CheckIcon />
                    <span>onBoarding Steps</span>
                </div>
                <div className="onboarding-steps">
                    <div className="onboarding-step completed">
                        <div className="step-icon completed">
                            <CheckIcon />
                        </div>
                        <span>Step 1 SMTP Setup</span>
                    </div>
                    <div className="onboarding-step completed">
                        <div className="step-icon completed">
                            <CheckIcon />
                        </div>
                        <span>Step 2 Create Affiliate</span>
                    </div>
                    <div className="onboarding-step completed">
                        <div className="step-icon completed">
                            <CheckIcon />
                        </div>
                        <span>Step 3 Create Advertiser</span>
                    </div>
                    <div className="onboarding-step completed">
                        <div className="step-icon completed">
                            <CheckIcon />
                        </div>
                        <span>Step 4 Create Offer</span>
                    </div>
                </div>
            </div>

            {/* Main Dashboard Grid */}
            <div className="dashboard-main-grid">
                {/* Left Column - KPI Cards */}
                <div className="dashboard-left-column">
                    {/* Conversions Card - Large */}
                    <div className="kpi-card conversions-card large">
                        <div className="kpi-header">
                            <div className="kpi-title">
                                <ConversionIcon />
                                <span>Conversions</span>
                            </div>
                        </div>
                        <div className="kpi-value-large">{formatNumber(stats.conversions?.today || stats.conversions?.total || 0)}</div>
                        <div className="kpi-trend">
                            {(() => {
                                const trend = calculateTrend(
                                    stats.conversions?.today || stats.conversions?.total || 0,
                                    stats.conversions?.yesterday || 0
                                );
                                return (
                                    <span className={`trend-badge ${trend.isPositive ? 'up' : 'down'}`}>
                                        {trend.isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                        {trend.value}% {trend.isPositive ? 'Up' : 'Down'} from yesterday
                                    </span>
                                );
                            })()}
                        </div>
                        <div className="kpi-meta">
                                <span className="conversion-rate">
                                CR: {stats.conversions?.conversion_rate ? stats.conversions.conversion_rate.toFixed(3) : '0.000'}%
                            </span>
                        </div>
                        <div className="top-offers-section">
                            <div className="top-offers-tabs">
                                <button
                                    className={topOffersTab === 'offers' ? 'active' : ''}
                                    onClick={() => setTopOffersTab('offers')}
                                >
                                    Offers
                                </button>
                                <button
                                    className={topOffersTab === 'conversions' ? 'active' : ''}
                                    onClick={() => setTopOffersTab('conversions')}
                                >
                                    Conversions
                                </button>
                            </div>
                            <div className="top-offers-list">
                                {topOffers.slice(0, 5).map((offer, idx) => (
                                    <div key={offer.offer_id} className="top-offer-item">
                                        <span className="offer-id">{offer.offer_id}</span>
                                        <span className="offer-conversions">{formatNumber(offer.conversions || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Other KPI Cards */}
                    <div className="kpi-cards-grid">
                        {/* Impressions */}
                        <div className="kpi-card">
                            <div className="kpi-icon red">
                                <ImpressionsIcon />
                            </div>
                            <div className="kpi-content">
                                <div className="kpi-value">{formatNumber(stats.impressions?.today || stats.impressions?.total || 0)}</div>
                                <div className="kpi-label">Impressions</div>
                                <div className="kpi-mtd">MTD {formatNumber(stats.impressions?.mtd || 0)}</div>
                                {(() => {
                                    const trend = calculateTrend(
                                        stats.impressions?.today || stats.impressions?.total || 0,
                                        stats.impressions?.yesterday || 0
                                    );
                                    return (
                                        <div className={`kpi-trend-small ${trend.isPositive ? 'up' : 'down'}`}>
                                            {trend.isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            {trend.value}% {trend.isPositive ? 'Up' : 'Down'} from yesterday
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Clicks */}
                        <div className="kpi-card">
                            <div className="kpi-icon orange">
                                <ClickIcon />
                            </div>
                            <div className="kpi-content">
                                <div className="kpi-value">{formatNumber(stats.clicks?.today || stats.clicks?.total || 0)}</div>
                                <div className="kpi-label">Clicks</div>
                                <div className="kpi-mtd">MTD {formatNumber(stats.clicks?.mtd || 0)}</div>
                                {(() => {
                                    const trend = calculateTrend(
                                        stats.clicks?.today || stats.clicks?.total || 0,
                                        stats.clicks?.yesterday || 0
                                    );
                                    return (
                                        <div className={`kpi-trend-small ${trend.isPositive ? 'up' : 'down'}`}>
                                            {trend.isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            {trend.value}% {trend.isPositive ? 'Up' : 'Down'} from yesterday
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Revenue */}
                        <div className="kpi-card">
                            <div className="kpi-icon blue">
                                <RevenueIcon />
                            </div>
                            <div className="kpi-content">
                                <div className="kpi-value">{formatCurrency(stats.revenue?.today || stats.revenue?.total || 0)} USD</div>
                                <div className="kpi-label">Revenue</div>
                                <div className="kpi-mtd">MTD {formatCurrency(stats.revenue?.mtd || 0)} USD</div>
                                {(() => {
                                    const trend = calculateTrend(
                                        stats.revenue?.today || stats.revenue?.total || 0,
                                        stats.revenue?.yesterday || 0
                                    );
                                    return (
                                        <div className={`kpi-trend-small ${trend.isPositive ? 'up' : 'down'}`}>
                                            {trend.isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            {trend.value}% {trend.isPositive ? 'Up' : 'Down'} from yesterday
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Payout */}
                        <div className="kpi-card">
                            <div className="kpi-icon purple">
                                <PayoutIcon />
                            </div>
                            <div className="kpi-content">
                                <div className="kpi-value">{formatCurrency(stats.revenue?.payout_today || stats.revenue?.payout || 0)} USD</div>
                                <div className="kpi-label">Payout</div>
                                <div className="kpi-mtd">MTD {formatCurrency((stats.revenue?.mtd || 0) - (stats.revenue?.payout_mtd || 0))} USD</div>
                                {(() => {
                                    const trend = calculateTrend(
                                        stats.revenue?.payout_today || stats.revenue?.payout || 0,
                                        stats.revenue?.payout_yesterday || 0
                                    );
                                    return (
                                        <div className={`kpi-trend-small ${trend.isPositive ? 'up' : 'down'}`}>
                                            {trend.isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            {trend.value}% {trend.isPositive ? 'Up' : 'Down'} from yesterday
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Profit */}
                        <div className="kpi-card">
                            <div className="kpi-icon green">
                                <ProfitIcon />
                            </div>
                            <div className="kpi-content">
                                <div className="kpi-value">{formatCurrency((stats.revenue?.today || stats.revenue?.total || 0) - (stats.revenue?.payout_today || stats.revenue?.payout || 0))} USD</div>
                                <div className="kpi-label">Profit</div>
                                <div className="kpi-mtd">MTD {formatCurrency((stats.revenue?.mtd || 0) - (stats.revenue?.payout_mtd || 0))} USD</div>
                                {(() => {
                                    const profit = (stats.revenue?.today || stats.revenue?.total || 0) - (stats.revenue?.payout_today || stats.revenue?.payout || 0);
                                    const profitYesterday = (stats.revenue?.yesterday || 0) - (stats.revenue?.payout_yesterday || 0);
                                    const trend = calculateTrend(profit, profitYesterday);
                                    return (
                                        <div className={`kpi-trend-small ${trend.isPositive ? 'up' : 'down'}`}>
                                            {trend.isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            {trend.value}% {trend.isPositive ? 'Up' : 'Down'} from yesterday
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Filter/Summary Card */}
                    <div className="summary-filter-card">
                        <div className="filter-controls">
                            <select className="filter-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                            </select>
                            <select className="filter-select">
                                <option value="all">All</option>
                            </select>
                        </div>
                        <div className="summary-stats">
                            <div className="summary-stat">
                                <span className="summary-label">Active Offers:</span>
                                <span className="summary-value">{stats.offers?.active || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
            </div>

            {/* Bottom Section - Charts */}
            <div className="dashboard-charts-section">
                {/* Top Countries - World Map */}
                <div className="chart-card countries-card">
                    <h3>Top Countries</h3>
                    <div className="countries-map">
                        {/* Simplified world map visualization */}
                        <div className="countries-list">
                            {topCountries.slice(0, 10).map((country, idx) => (
                                <div key={country.country_code} className="country-item">
                                    <div className="country-bar" style={{ width: `${(country.conversions / (topCountries[0]?.conversions || 1)) * 100}%` }}></div>
                                    <span className="country-name">{country.country_name}</span>
                                    <span className="country-value">{formatNumber(country.conversions)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Performance Chart */}
                <div className="chart-card performance-card">
                    <div className="chart-header">
                        <h3>Performance</h3>
                        <button className="forecast-btn">
                            <RefreshIcon />
                            Forecast Report
                        </button>
                    </div>
                    {performanceData && performanceData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={performanceData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis
                                    dataKey="date"
                                    stroke="var(--text-secondary)"
                                    style={{ fontSize: '12px' }}
                                    tickFormatter={(value) => {
                                        // Format date for display
                                        if (value && value.length > 10) {
                                            return value.substring(5, 10); // Show MM-DD
                                        }
                                        return value;
                                    }}
                                />
                                <YAxis
                                    yAxisId="left"
                                    stroke="var(--primary-color)"
                                    style={{ fontSize: '12px' }}
                                    label={{ value: 'Clicks', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    stroke="var(--success-color)"
                                    style={{ fontSize: '12px' }}
                                    label={{ value: 'Conversions', angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        color: 'var(--text-primary)'
                                    }}
                                    labelStyle={{ color: 'var(--text-primary)' }}
                                />
                                <Legend />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="clicks"
                                    stroke="var(--primary-color)"
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: 'var(--primary-color)' }}
                                    name="Clicks"
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="conversions"
                                    stroke="var(--success-color)"
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: 'var(--success-color)' }}
                                    name="Conversions"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="no-data" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No performance data available
                        </div>
                    )}
                </div>

                {/* Top Affiliates - Donut Chart */}
                <div className="chart-card affiliates-chart-card">
                    <h3>Top Affiliates</h3>
                    <div className="affiliates-chart-container">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={topAffiliates.slice(0, 6)}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="conversions"
                                >
                                    {topAffiliates.slice(0, 6).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="affiliates-legend">
                            <div className="legend-total">Total Conversions: {formatNumber(topAffiliates.reduce((sum, aff) => sum + (aff.conversions || 0), 0))}</div>
                            {topAffiliates.slice(0, 6).map((aff, idx) => (
                                <div key={aff.publisher_id} className="legend-item">
                                    <div className="legend-color" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    <span>{aff.publisher_name || 'Unknown'}</span>
                                    <span className="legend-value">{formatNumber(aff.conversions || 0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
