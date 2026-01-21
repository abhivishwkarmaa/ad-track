import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardAPI, offersAPI, publishersAPI } from '../../services/api';
import './Dashboard.css';

// Icons
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

function Dashboard() {
    const { user } = useAuth();
    const [dashboardData, setDashboardData] = useState(null);
    const [dashboardCards, setDashboardCards] = useState(null);
    const [topOffers, setTopOffers] = useState([]);
    const [performanceData, setPerformanceData] = useState([]);
    const [topAffiliates, setTopAffiliates] = useState([]);
    const [topCountries, setTopCountries] = useState([]);
    const [summaryData, setSummaryData] = useState(null);
    const [detailedData, setDetailedData] = useState(null);
    const [publisherData, setPublisherData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cardsLoading, setCardsLoading] = useState(false);
    const [topOffersLoading, setTopOffersLoading] = useState(false);
    const [performanceLoading, setPerformanceLoading] = useState(false);
    const [topAffiliatesLoading, setTopAffiliatesLoading] = useState(false);
    const [topCountriesLoading, setTopCountriesLoading] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState(null);
    const [detailedLoading, setDetailedLoading] = useState(false);
    const [detailedError, setDetailedError] = useState(null);
    const [publisherLoading, setPublisherLoading] = useState(false);
    const [publisherError, setPublisherError] = useState(null);
    const [offersData, setOffersData] = useState(null);
    const [offersLoading, setOffersLoading] = useState(false);
    const [offersError, setOffersError] = useState(null);
    const [affiliatesData, setAffiliatesData] = useState(null);
    const [affiliatesLoading, setAffiliatesLoading] = useState(false);
    const [affiliatesError, setAffiliatesError] = useState(null);
    const [offerStatsData, setOfferStatsData] = useState(null);
    const [offerStatsLoading, setOfferStatsLoading] = useState(false);
    const [offerStatsError, setOfferStatsError] = useState(null);
    const [dateFilter, setDateFilter] = useState('this_month');

    // Get date range based on filter
    // Helper to format date as YYYY-MM-DD in local time
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Get date range based on filter
    const getDateRange = (filter) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let dateFrom, dateTo;

        switch (filter) {
            case 'today':
                dateFrom = formatDate(today);
                dateTo = formatDate(today);
                break;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                dateFrom = formatDate(yesterday);
                dateTo = formatDate(yesterday);
                break;
            case 'this_week':
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - today.getDay());
                dateFrom = formatDate(weekStart);
                dateTo = formatDate(today);
                break;
            case 'this_month':
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                dateFrom = formatDate(monthStart);
                dateTo = formatDate(today);
                break;
            case 'last_month':
                const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                dateFrom = formatDate(lastMonthStart);
                dateTo = formatDate(lastMonthEnd);
                break;
            default:
                const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
                dateFrom = formatDate(defaultStart);
                dateTo = formatDate(today);
        }

        return { date_from: dateFrom, date_to: dateTo };
    };

    // Fetch dashboard data
    useEffect(() => {
        const dateRange = getDateRange(dateFilter);
        console.log('Date Filter Changed:', dateFilter, 'Date Range:', dateRange);

        const fetchDashboardData = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await dashboardAPI.getDashboard(dateRange);
                if (response.success) {
                    setDashboardData(response.data);
                } else {
                    setError('Failed to load dashboard data');
                }
            } catch (err) {
                console.error('Dashboard fetch error:', err);
                setError(err.message || 'Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        };

        const fetchDashboardCards = async () => {
            try {
                setCardsLoading(true);
                const response = await dashboardAPI.getDashboardCards(dateRange);
                if (response.success) {
                    setDashboardCards(response.data);
                }
            } catch (err) {
                console.error('Dashboard cards fetch error:', err);
            } finally {
                setCardsLoading(false);
            }
        };

        const fetchTopOffers = async () => {
            try {
                setTopOffersLoading(true);
                const response = await dashboardAPI.getTopOffers(dateRange);
                if (response.success) {
                    setTopOffers(response.data || []);
                }
            } catch (err) {
                console.error('Top offers fetch error:', err);
            } finally {
                setTopOffersLoading(false);
            }
        };

        const fetchPerformance = async () => {
            try {
                setPerformanceLoading(true);
                const response = await dashboardAPI.getPerformance(dateRange);
                if (response.success) {
                    setPerformanceData(response.data || []);
                }
            } catch (err) {
                console.error('Performance fetch error:', err);
            } finally {
                setPerformanceLoading(false);
            }
        };

        const fetchTopAffiliates = async () => {
            try {
                setTopAffiliatesLoading(true);
                const response = await dashboardAPI.getTopAffiliates(dateRange);
                if (response.success) {
                    setTopAffiliates(response.data || []);
                }
            } catch (err) {
                console.error('Top affiliates fetch error:', err);
            } finally {
                setTopAffiliatesLoading(false);
            }
        };

        const fetchTopCountries = async () => {
            try {
                setTopCountriesLoading(true);
                const response = await dashboardAPI.getTopCountries(dateRange);
                if (response.success) {
                    setTopCountries(response.data || []);
                }
            } catch (err) {
                console.error('Top countries fetch error:', err);
            } finally {
                setTopCountriesLoading(false);
            }
        };

        const fetchSummaryData = async () => {
            try {
                setSummaryLoading(true);
                setSummaryError(null);
                setSummaryData(null);
                const response = await dashboardAPI.getSummary(dateRange);
                if (response.success) {
                    setSummaryData(response.data);
                } else {
                    setSummaryError('Failed to load summary data');
                }
            } catch (err) {
                console.error('Summary fetch error:', err);
                setSummaryError(err.message || 'Failed to load summary data');
            } finally {
                setSummaryLoading(false);
            }
        };

        const fetchDetailedData = async () => {
            try {
                setDetailedLoading(true);
                setDetailedError(null);
                const response = await dashboardAPI.getDetailed(dateRange);
                if (response.success) {
                    setDetailedData(response.data);
                } else {
                    setDetailedError('Failed to load activity data');
                }
            } catch (err) {
                console.error('Detailed fetch error:', err);
                setDetailedError(err.message || 'Failed to load activity data');
            } finally {
                setDetailedLoading(false);
            }
        };

        const fetchPublisherData = async () => {
            try {
                setPublisherLoading(true);
                setPublisherError(null);
                const response = await dashboardAPI.getPublisherConversions(dateRange);
                if (response.success) {
                    setPublisherData(response.data);
                } else {
                    setPublisherError('Failed to load publisher data');
                }
            } catch (err) {
                console.error('Publisher fetch error:', err);
                setPublisherError(err.message || 'Failed to load publisher data');
            } finally {
                setPublisherLoading(false);
            }
        };

        const fetchOffersData = async () => {
            try {
                setOffersLoading(true);
                setOffersError(null);
                const response = await offersAPI.getOffers({
                    type: 'live',
                    page: 1,
                    limit: 100
                });
                if (response.success) {
                    setOffersData(response.data);
                } else {
                    setOffersError('Failed to load offers data');
                }
            } catch (err) {
                console.error('Offers fetch error:', err);
                setOffersError(err.message || 'Failed to load offers data');
            } finally {
                setOffersLoading(false);
            }
        };

        const fetchAffiliatesData = async () => {
            try {
                setAffiliatesLoading(true);
                setAffiliatesError(null);
                const response = await publishersAPI.getPublishers({
                    status: 'active',
                    page: 1,
                    limit: 10
                });
                if (response.success && response.data) {
                    const sortedAffiliates = response.data
                        .sort((a, b) => b.id - a.id)
                        .slice(0, 4);
                    setAffiliatesData(sortedAffiliates);
                } else {
                    setAffiliatesError('Failed to load affiliates data');
                }
            } catch (err) {
                console.error('Affiliates fetch error:', err);
                setAffiliatesError(err.message || 'Failed to load affiliates data');
            } finally {
                setAffiliatesLoading(false);
            }
        };

        const fetchOfferStatsData = async () => {
            try {
                setOfferStatsLoading(true);
                setOfferStatsError(null);
                const response = await dashboardAPI.getOfferStatistics({
                    limit: 20,
                    ...dateRange
                });
                if (response.success && response.data) {
                    setOfferStatsData(response.data);
                } else {
                    setOfferStatsError('Failed to load offer statistics');
                }
            } catch (err) {
                console.error('Offer stats fetch error:', err);
                setOfferStatsError(err.message || 'Failed to load offer statistics');
            } finally {
                setOfferStatsLoading(false);
            }
        };

        fetchDashboardData();
        fetchDashboardCards();
        fetchTopOffers();
        fetchTopAffiliates();
        fetchTopCountries();
        fetchSummaryData();
        fetchDetailedData();
        fetchPublisherData();
        fetchOffersData();
        fetchAffiliatesData();
        fetchOfferStatsData();
    }, [dateFilter]);

    const apiStats = dashboardCards || dashboardData || {};

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '$0.00';
        return `$${parseFloat(amount).toFixed(2)}`;
    };

    const calculateTrend = (current, previous) => {
        if (!previous || previous === 0) return null;
        const change = ((current - previous) / previous) * 100;
        return {
            value: Math.abs(change).toFixed(1),
            isPositive: change >= 0
        };
    };

    const TrendIndicator = ({ current, previous }) => {
        const trend = calculateTrend(current, previous);
        if (trend === null) return null;
        return (
            <div className={`stat-trend ${trend.isPositive ? 'up' : 'down'}`}>
                <ArrowUpIcon style={{ transform: trend.isPositive ? 'none' : 'rotate(180deg)' }} />
                <span>{trend.value}%</span>
            </div>
        );
    };

    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const getFilterLabel = () => {
        switch (dateFilter) {
            case 'today':
                return 'Today';
            case 'yesterday':
                return 'Yesterday';
            case 'this_week':
                return 'This Week';
            case 'this_month':
                return 'This Month';
            case 'last_month':
                return 'Last Month';
            default:
                return 'This Month';
        }
    };

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

    if (error) {
        return (
            <div className="dashboard">
                <div className="dashboard-error">
                    <p>Error: {error}</p>
                    <button onClick={() => window.location.reload()}>Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-header-left">
                    <h1>Dashboard</h1>
                    <p className="dashboard-date">
                        <CalendarIcon />
                        {today}
                    </p>
                </div>
                <div className="dashboard-header-right">
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

            {/* Stats Grid - 6 Cards */}
            <div className="stats-grid">
                <div className="stat-card blue">
                    <div className="stat-icon">
                        <OfferIcon />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{apiStats.offers?.total || 0}</span>
                        <span className="stat-label">Total Offers</span>
                    </div>
                    {apiStats.offers?.previous_total !== undefined && (
                        <TrendIndicator current={apiStats.offers?.total || 0} previous={apiStats.offers.previous_total} />
                    )}
                    <div className="stat-badge">{apiStats.offers?.active || 0} Active</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-icon">
                        <AffiliateIcon />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{apiStats.publishers?.total || 0}</span>
                        <span className="stat-label">Publishers</span>
                    </div>
                    {apiStats.publishers?.previous_total !== undefined && (
                        <TrendIndicator current={apiStats.publishers?.total || 0} previous={apiStats.publishers.previous_total} />
                    )}
                    <div className="stat-badge">{apiStats.publishers?.active || 0} Active</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-icon">
                        <ClickIcon />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{formatNumber(apiStats.clicks?.total || 0)}</span>
                        <span className="stat-label">Total Clicks</span>
                    </div>
                    <TrendIndicator current={apiStats.clicks?.total || 0} previous={apiStats.clicks?.yesterday || 0} />
                    <div className="stat-badge">{formatNumber(apiStats.clicks?.unique || 0)} Unique</div>
                </div>

                <div className="stat-card teal">
                    <div className="stat-icon">
                        <ConversionIcon />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{formatNumber(apiStats.conversions?.total || 0)}</span>
                        <span className="stat-label">Conversions</span>
                    </div>
                    <TrendIndicator current={apiStats.conversions?.total || 0} previous={apiStats.conversions?.yesterday || 0} />
                    <div className="stat-badge">
                        {apiStats.conversions?.approved || 0} Approved
                        {apiStats.conversions?.conversion_rate !== undefined && (
                            <span> • {apiStats.conversions.conversion_rate.toFixed(2)}%</span>
                        )}
                    </div>
                </div>

                <div className="stat-card red">
                    <div className="stat-icon">
                        <RevenueIcon />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{formatCurrency(apiStats.revenue?.total || 0)}</span>
                        <span className="stat-label">Total Revenue</span>
                    </div>
                    <div className="stat-badge">
                        Profit: {formatCurrency(apiStats.revenue?.profit || 0)}
                    </div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-icon">
                        <AdvertiserIcon />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{apiStats.advertisers?.total || 0}</span>
                        <span className="stat-label">Advertisers</span>
                    </div>
                    {apiStats.advertisers?.previous_total !== undefined && (
                        <TrendIndicator current={apiStats.advertisers?.total || 0} previous={apiStats.advertisers.previous_total} />
                    )}
                    <div className="stat-badge">{apiStats.advertisers?.active || 0} Active</div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="dashboard-content">
                {/* Quick Actions */}
                <div className="dashboard-card quick-actions-card">
                    <div className="card-header">
                        <h3>Quick Actions</h3>
                    </div>
                    <div className="quick-actions-grid">
                        <Link to="/offer/new" className="action-btn">
                            <div className="action-icon blue">
                                <PlusIcon />
                            </div>
                            <span>New Offer</span>
                        </Link>
                        <Link to="/affiliate/new" className="action-btn">
                            <div className="action-icon green">
                                <AffiliateIcon />
                            </div>
                            <span>Add Affiliate</span>
                        </Link>
                        <Link to="/advertiser/new" className="action-btn">
                            <div className="action-icon orange">
                                <AdvertiserIcon />
                            </div>
                            <span>Add Advertiser</span>
                        </Link>
                        <Link to="/offer/list" className="action-btn">
                            <div className="action-icon purple">
                                <ListIcon />
                            </div>
                            <span>View All Offers</span>
                        </Link>
                    </div>
                </div>

                {/* Recent Offers */}
                <div className="dashboard-card recent-offers-card">
                    <div className="card-header">
                        <h3>Live Offers</h3>
                        <Link to="/offer/list" className="view-all">View All</Link>
                    </div>
                    {offersLoading ? (
                        <div className="loading-spinner">Loading offers...</div>
                    ) : offersError ? (
                        <div className="error-state">
                            <p>Error: {offersError}</p>
                            <button onClick={() => window.location.reload()}>Retry</button>
                        </div>
                    ) : offersData && offersData.length > 0 ? (
                        <div className="offers-list">
                            {offersData.map(offer => (
                                <div key={offer.id} className="offer-row">
                                    <div className="offer-info">
                                        <span className="offer-name">{offer.name}</span>
                                        <span className="offer-id">ID: {offer.display_id || offer.id}</span>
                                        <span className="offer-description">{offer.description}</span>
                                    </div>
                                    <div className="offer-meta">
                                        <span className="offer-country">{offer.country}</span>
                                        <span className={`offer-status ${offer.status.toLowerCase()}`}>{offer.status}</span>
                                        <span className="offer-payout">${offer.affiliate_amount} {offer.affiliate_model}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">No offers available</div>
                    )}
                </div>

                {/* Top Affiliates */}
                <div className="dashboard-card affiliates-card">
                    <div className="card-header">
                        <h3>Top Affiliates</h3>
                        <Link to="/affiliate/manage" className="view-all">View All</Link>
                    </div>
                    {(topAffiliatesLoading || affiliatesLoading) ? (
                        <div className="loading-spinner">Loading affiliates...</div>
                    ) : (topAffiliates && topAffiliates.length > 0) ? (
                        <div className="affiliates-list">
                            {topAffiliates.map((aff, idx) => (
                                <div key={aff.publisher_id || idx} className="affiliate-row">
                                    <div className="affiliate-rank">#{idx + 1}</div>
                                    <div className="affiliate-avatar">
                                        {(aff.publisher_name || 'A').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="affiliate-info">
                                        <span className="affiliate-name">{aff.publisher_name || 'N/A'}</span>
                                        <span className="affiliate-email">{formatNumber(aff.conversions || 0)} conversions</span>
                                    </div>
                                    <div className="affiliate-status active">
                                        {formatNumber(aff.conversions || 0)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (affiliatesData && affiliatesData.length > 0) ? (
                        <div className="affiliates-list">
                            {affiliatesData.map((aff, idx) => (
                                <div key={aff.id || idx} className="affiliate-row">
                                    <div className="affiliate-rank">#{idx + 1}</div>
                                    <div className="affiliate-avatar">
                                        {(aff.company_name || aff.first_name || 'A').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="affiliate-info">
                                        <span className="affiliate-name">{aff.company_name || aff.first_name || 'N/A'}</span>
                                        <span className="affiliate-email">{aff.email || 'New Affiliate'}</span>
                                    </div>
                                    <div className="affiliate-status pending">
                                        New
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">No affiliates available</div>
                    )}
                </div>

                {/* Summary Reports */}
                <div className="dashboard-card summary-reports-card">
                    <div className="card-header">
                        <h3>Performance Summary</h3>
                        <span className="period-indicator">{getFilterLabel()}</span>
                    </div>
                    {summaryLoading ? (
                        <div className="loading-spinner">Loading summary...</div>
                    ) : summaryError ? (
                        <div className="error-state">
                            <p>Error: {summaryError}</p>
                            <button onClick={() => window.location.reload()}>Retry</button>
                        </div>
                    ) : summaryData ? (
                        <div className="summary-grid">
                            <div className="summary-item">
                                <span className="summary-label">Affiliates</span>
                                <span className="summary-value">{summaryData.affiliates || 0}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Unique Clicks</span>
                                <span className="summary-value">{formatNumber(summaryData.unique_clicks || 0)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Impressions</span>
                                <span className="summary-value">{formatNumber(summaryData.impressions || 0)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Conversions</span>
                                <span className="summary-value">{formatNumber(summaryData.conversions || 0)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Revenue</span>
                                <span className="summary-value">{formatCurrency(summaryData.revenue || 0)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Payout</span>
                                <span className="summary-value">{formatCurrency(summaryData.payout || 0)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Profit</span>
                                <span className="summary-value profit">{formatCurrency(summaryData.profit || 0)}</span>
                            </div>
                            <div className="summary-item">
                                <span className="summary-label">Conv. Rate</span>
                                <span className="summary-value">{summaryData.conversion_rate || 0}%</span>
                            </div>
                        </div>
                    ) : (
                        <div className="no-data">No summary data available</div>
                    )}
                </div>

                {/* Recent Clicks/Conversions */}
                <div className="dashboard-card recent-activity-card">
                    <div className="card-header">
                        <h3>Recent Activity</h3>
                        <Link to="/reports" className="view-all">View Detailed Reports</Link>
                    </div>
                    {detailedLoading ? (
                        <div className="loading-spinner">Loading activity...</div>
                    ) : detailedError ? (
                        <div className="error-state">
                            <p>Error: {detailedError}</p>
                            <button onClick={() => window.location.reload()}>Retry</button>
                        </div>
                    ) : detailedData && detailedData.length > 0 ? (
                        <div className="activity-table">
                            <div className="table-header">
                                <span>Offer</span>
                                <span>Publisher</span>
                                <span>Clicks</span>
                                <span>Conversions</span>
                                <span>Revenue</span>
                            </div>
                            {detailedData.slice(0, 5).map((item, index) => (
                                <div key={item.click_id || index} className="table-row">
                                    <div className="activity-offer">
                                        <span className="offer-name">{item.offer_name || 'N/A'}</span>
                                        <span className="offer-id">ID: {item.display_id || item.offer_id}</span>
                                    </div>
                                    <div className="activity-publisher">
                                        <span className="publisher-name">{item.publisher_company || item.publisher_email || 'N/A'}</span>
                                    </div>
                                    <div className="activity-clicks">
                                        <span className="click-count">1</span>
                                    </div>
                                    <div className="activity-conversions">
                                        <span className={`conversion-status ${item.conversion_status || 'none'}`}>
                                            {item.conversion_status || 'No'}
                                        </span>
                                    </div>
                                    <div className="activity-revenue">
                                        <span className="revenue-amount">
                                            {formatCurrency(item.conversion_amount || 0)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">No recent activity</div>
                    )}
                </div>

                {/* Publisher Performance */}
                <div className="dashboard-card publisher-performance-card">
                    <div className="card-header">
                        <h3>Publisher Performance</h3>
                        <span className="period-indicator">{getFilterLabel()}</span>
                    </div>
                    {publisherLoading ? (
                        <div className="loading-spinner">Loading publisher data...</div>
                    ) : publisherError ? (
                        <div className="error-state">
                            <p>Error: {publisherError}</p>
                            <button onClick={() => window.location.reload()}>Retry</button>
                        </div>
                    ) : publisherData && publisherData.stats && publisherData.stats.length > 0 ? (
                        <div className="publisher-list">
                            {publisherData.stats.slice(0, 5).map((stat, index) => (
                                <div key={`${stat.publisher?.id}-${stat.offer?.id}-${index}`} className="publisher-row">
                                    <div className="publisher-info">
                                        <span className="publisher-name">{stat.publisher?.company_name || stat.publisher?.email || 'N/A'}</span>
                                        <span className="publisher-email">{stat.offer?.name || 'N/A'}</span>
                                        <span className="publisher-country">{stat.publisher?.country || 'N/A'}</span>
                                    </div>
                                    <div className="publisher-stats">
                                        <div className="stat">
                                            <span className="stat-label">Clicks</span>
                                            <span className="stat-value">{formatNumber(stat.clicks?.total || 0)}</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-label">Conversions</span>
                                            <span className="stat-value">{formatNumber(stat.conversions?.total || 0)}</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-label">Revenue</span>
                                            <span className="stat-value">{formatCurrency(stat.revenue?.total || 0)}</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-label">Rate</span>
                                            <span className="stat-value">{stat.conversions?.conversion_rate?.toFixed(1) || 0}%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {publisherData.summary && (
                                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    <strong>Summary:</strong> {publisherData.summary.total_publishers || 0} Publishers • {publisherData.summary.total_offers || 0} Offers • {publisherData.summary.total_combinations || 0} Combinations
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-data">No publisher data available</div>
                    )}
                </div>

                {/* Top Offers */}
                <div className="dashboard-card top-offers-card">
                    <div className="card-header">
                        <h3>Top Offers by Conversions</h3>
                    </div>
                    {topOffersLoading ? (
                        <div className="loading-spinner">Loading top offers...</div>
                    ) : topOffers && topOffers.length > 0 ? (
                        <div className="offers-list">
                            {topOffers.map((offer, idx) => (
                                <div key={offer.offer_id} className="offer-row">
                                    <div className="offer-info">
                                        <span className="offer-name">{offer.offer_name || 'N/A'}</span>
                                        <span className="offer-id">ID: {offer.display_id || offer.offer_id}</span>
                                    </div>
                                    <div className="offer-meta">
                                        <span className="offer-payout">{formatNumber(offer.conversions || 0)} conversions</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">No top offers available</div>
                    )}
                </div>

                {/* Performance Chart */}
                <div className="dashboard-card performance-chart-card">
                    <div className="card-header">
                        <h3>Performance Chart</h3>
                    </div>
                    {performanceLoading ? (
                        <div className="loading-spinner">Loading performance data...</div>
                    ) : performanceData && performanceData.length > 0 ? (
                        <div style={{ padding: '16px' }}>
                            <div className="activity-table">
                                <div className="table-header">
                                    <span>Date</span>
                                    <span>Clicks</span>
                                    <span>Conversions</span>
                                </div>
                                {performanceData.slice(0, 10).map((item, index) => (
                                    <div key={index} className="table-row">
                                        <div>{item.date}</div>
                                        <div>{formatNumber(item.clicks || 0)}</div>
                                        <div>{formatNumber(item.conversions || 0)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="no-data">No performance data available</div>
                    )}
                </div>


                {/* Top Countries */}
                <div className="dashboard-card top-countries-card">
                    <div className="card-header">
                        <h3>Top Countries</h3>
                    </div>
                    {topCountriesLoading ? (
                        <div className="loading-spinner">Loading countries...</div>
                    ) : topCountries && topCountries.length > 0 ? (
                        <div className="activity-table">
                            <div className="table-header">
                                <span>Country</span>
                                <span>Clicks</span>
                                <span>Conversions</span>
                                <span>Revenue</span>
                            </div>
                            {topCountries.map((country, index) => (
                                <div key={country.country_code || index} className="table-row">
                                    <div>
                                        <div style={{ fontWeight: '500' }}>{country.country_name || country.country_code}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{country.country_code}</div>
                                    </div>
                                    <div>{formatNumber(country.clicks || 0)}</div>
                                    <div>{formatNumber(country.conversions || 0)}</div>
                                    <div>{formatCurrency(country.revenue || 0)}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-data">No country data available</div>
                    )}
                </div>

                {/* Offer Statistics Table */}
                <div className="dashboard-card offer-statistics-card">
                    <div className="card-header">
                        <h3>Offer Statistics</h3>
                        <span className="period-indicator">{getFilterLabel()}</span>
                    </div>
                    {offerStatsLoading ? (
                        <div className="loading-spinner">Loading offer statistics...</div>
                    ) : offerStatsError ? (
                        <div className="error-state">
                            <p>Error: {offerStatsError}</p>
                            <button onClick={() => window.location.reload()}>Retry</button>
                        </div>
                    ) : offerStatsData && offerStatsData.length > 0 ? (
                        <div className="offer-stats-table-wrapper">
                            <div className="offer-stats-table">
                                <div className="stats-table-header">
                                    <span>Offer Name</span>
                                    <span>Clicks</span>
                                    <span>Conversions</span>
                                    <span>CR %</span>
                                    <span>Affiliate Payout</span>
                                    <span>Advertiser Payout</span>
                                    <span>Profit</span>
                                </div>
                                {offerStatsData.map((stat, index) => (
                                    <div key={stat.offer_id || index} className="stats-table-row">
                                        <div className="offer-stats-name">
                                            <span className="offer-name-text">{stat.offer_name}</span>
                                            <span className="offer-id-text">ID: {stat.display_id || stat.offer_id}</span>
                                        </div>
                                        <div className="stats-value" data-label="Clicks">{formatNumber(stat.clicks)}</div>
                                        <div className="stats-value" data-label="Conversions">{formatNumber(stat.conversions)}</div>
                                        <div className="stats-value cr-value" data-label="CR %">
                                            <span className={stat.conversion_ratio > 0 ? 'positive-cr' : ''}>
                                                {stat.conversion_ratio}%
                                            </span>
                                        </div>
                                        <div className="stats-value payout-value" data-label="Affiliate Payout">{formatCurrency(stat.affiliate_payout)}</div>
                                        <div className="stats-value revenue-value" data-label="Advertiser Payout">{formatCurrency(stat.advertiser_payout)}</div>
                                        <div className="stats-value profit-value" data-label="Profit">
                                            <span className={stat.profit > 0 ? 'positive-profit' : stat.profit < 0 ? 'negative-profit' : ''}>
                                                {formatCurrency(stat.profit)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="no-data">No offer statistics available</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
