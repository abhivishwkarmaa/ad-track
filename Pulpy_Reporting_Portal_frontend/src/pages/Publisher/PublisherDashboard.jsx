import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { publisherAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { useReportTimezone } from '../../context/ReportTimezoneContext';
import TimelineFilter from '../../components/TimelineFilter/TimelineFilter';
import { EntityListPagination } from '../../shared/ui/EntityList';
import { SkeletonStatCard, SkeletonBox, SkeletonTable } from '../../components/Skeleton/Skeleton';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import { getTimelineRange } from '../../utils/timelineRange';
import { buildDashboardApiParams, userRangeYmdToBackendIstRange, userRangeYmdToBackendUtcMysqlRange } from '../../utils/reportTimezone';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import '../Dashboard/Dashboard.css';
import './PublisherDashboard.css';

export default function PublisherDashboard() {
    const [data, setData] = useState(null);
    const [offers, setOffers] = useState([]);
    const [selectedOfferId, setSelectedOfferId] = useState('');
    const [dateFilter, setDateFilter] = useState('today');
    const [customRange, setCustomRange] = useState({ from: '', to: '' });
    const [chartMetric, setChartMetric] = useState('clicks'); // 'clicks', 'conversions', 'payout', 'cr'
    const [trendPage, setTrendPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { showToast } = useToast();
    const { refreshKey } = useRefresh();
    const { reportTimezone } = useReportTimezone();

    const dateRange = useMemo(
        () => getTimelineRange(dateFilter, customRange, reportTimezone),
        [dateFilter, customRange, reportTimezone]
    );
    const apiDateRange = useMemo(
        () => userRangeYmdToBackendIstRange(dateRange.from, dateRange.to, reportTimezone),
        [dateRange.from, dateRange.to, reportTimezone]
    );
    const utcRange = useMemo(
        () => userRangeYmdToBackendUtcMysqlRange(dateRange.from, dateRange.to, reportTimezone),
        [dateRange.from, dateRange.to, reportTimezone]
    );

    const fetchDashboard = async () => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;
        try {
            setLoading(true);
            setError('');

            const [dashRes, offersRes] = await Promise.all([
                publisherAPI.getDashboard(buildDashboardApiParams({
                    date_from: apiDateRange.date_from,
                    date_to: apiDateRange.date_to,
                    range_start_utc: utcRange.range_start_utc,
                    range_end_utc: utcRange.range_end_utc,
                }, reportTimezone)),
                publisherAPI.getOffers({ limit: 20 }),
            ]);

            if (dashRes.success && dashRes.data) {
                setData(dashRes.data);
            } else {
                setError(dashRes.message || 'Failed to load dashboard metrics');
            }

            if (offersRes.success && offersRes.data) {
                setOffers(offersRes.data);
                if (offersRes.data.length > 0 && !selectedOfferId) {
                    setSelectedOfferId(offersRes.data[0].assignment_id);
                }
            }
        } catch (err) {
            setError(err.message || 'Error loading dashboard');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setTrendPage(1);
    }, [apiDateRange.date_from, apiDateRange.date_to, dateFilter]);

    useEffect(() => {
        fetchDashboard();
    }, [apiDateRange.date_from, apiDateRange.date_to, utcRange.range_start_utc, utcRange.range_end_utc, refreshKey, dateFilter, reportTimezone]);

    const copyToClipboard = (text, label = 'Link') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard!`, 'success');
    };

    const formatTrackingUrl = (url) => {
        if (!url) return '';
        return url.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
    };

    const activeOffer = offers.find((o) => String(o.assignment_id) === String(selectedOfferId)) || offers[0];

    if (loading) {
        return (
            <div className="pub-dashboard-view">
                <div className="pub-dash-header">
                    <div>
                        <SkeletonBox style={{ height: 28, width: 240 }} />
                        <SkeletonBox style={{ height: 14, width: 320, marginTop: 8 }} />
                    </div>
                    <TimelineFilter
                        value={dateFilter}
                        customRange={customRange}
                        onPresetChange={setDateFilter}
                        onCustomRangeChange={setCustomRange}
                    />
                </div>
                <div className="pub-kpi-grid">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
                </div>
                <SkeletonBox style={{ height: 280, width: '100%', borderRadius: 12, marginTop: 16 }} />
                <div style={{ marginTop: 16 }}>
                    <SkeletonTable rows={6} cols={6} />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="pub-error-state">
                <h3>Dashboard Error</h3>
                <p>{error}</p>
                <button type="button" className="pub-btn-primary" onClick={() => fetchDashboard()}>
                    Try Again
                </button>
            </div>
        );
    }

    const metrics = data?.metrics || {};
    const trend = data?.trend || [];
    const trendTotalPages = Math.max(1, Math.ceil(trend.length / LIST_PAGE_SIZE));
    const safeTrendPage = Math.min(trendPage, trendTotalPages);
    const pagedTrend = trend.slice((safeTrendPage - 1) * LIST_PAGE_SIZE, safeTrendPage * LIST_PAGE_SIZE);
    const topOffers = data?.topOffers || [];
    const deviceBreakdown = data?.deviceBreakdown || [];
    const geoBreakdown = data?.geoBreakdown || [];

    // Chart metric styling helper
    const getMetricConfig = () => {
        switch (chartMetric) {
            case 'conversions':
                return { key: 'conversions', name: 'Conversions', color: '#1BB6B8', unit: '' };
            case 'payout':
                return { key: 'payout', name: 'Earnings', color: '#E9A248', unit: '$' };
            case 'cr':
                return { key: 'cr', name: 'Conversion Rate', color: '#8884d8', unit: '%' };
            case 'clicks':
            default:
                return { key: 'clicks', name: 'Clicks', color: '#1BB6B8', unit: '' };
        }
    };
    const activeConfig = getMetricConfig();

    return (
        <div className="pub-dashboard-view">
            {/* Greeting & Header */}
            <div className="pub-dash-header">
                <div>
                    <h2 className="pub-dash-greeting">Welcome back, {data?.publisher?.name}!</h2>
                    <p className="pub-dash-sub">
                        Strictly isolated analytics for your publisher account #{data?.publisher?.public_publisher_id || data?.publisher?.id}.
                    </p>
                </div>
                <div className="pub-dash-actions">
                    <TimelineFilter
                        value={dateFilter}
                        customRange={customRange}
                        onPresetChange={setDateFilter}
                        onCustomRangeChange={setCustomRange}
                    />
                    <Link to="/offers" className="pub-btn-primary">
                        Browse Campaigns
                    </Link>
                </div>
            </div>

            {/* Postback Warning Callout */}
            {!data?.publisher?.global_postback_url && (
                <div className="pub-alert-callout">
                    <div className="alert-callout-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>
                    <div className="alert-callout-text">
                        <h4>Configure Your Global Postback URL</h4>
                        <p>You haven't set up your server postback URL yet. Add it to receive instant conversion callbacks on your tracker.</p>
                    </div>
                    <Link to="/settings" className="pub-btn-primary alert-action">
                        Configure Now
                    </Link>
                </div>
            )}

            {/* KPI Cards Grid */}
            <div className="pub-kpi-grid">
                <div className="pub-kpi-card">
                    <div className="kpi-top">
                        <span className="kpi-label">Total Clicks</span>
                        <div className="kpi-icon-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-num">{metrics.todayClicks?.toLocaleString() || 0}</div>
                    <div className="kpi-comparison">
                        <span>Previous: {metrics.yesterdayClicks?.toLocaleString() || 0}</span>
                    </div>
                </div>

                <div className="pub-kpi-card">
                    <div className="kpi-top">
                        <span className="kpi-label">Conversions</span>
                        <div className="kpi-icon-box success">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-num">{metrics.todayConversions?.toLocaleString() || 0}</div>
                    <div className="kpi-comparison">
                        <span>Previous: {metrics.yesterdayConversions?.toLocaleString() || 0}</span>
                    </div>
                </div>

                <div className="pub-kpi-card">
                    <div className="kpi-top">
                        <span className="kpi-label">Earnings</span>
                        <div className="kpi-icon-box warning">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="1" x2="12" y2="23" />
                                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-num highlight">${metrics.todayPayout?.toFixed(2) || '0.00'}</div>
                    <div className="kpi-comparison">
                        <span>Previous: ${metrics.yesterdayPayout?.toFixed(2) || '0.00'}</span>
                    </div>
                </div>

                <div className="pub-kpi-card">
                    <div className="kpi-top">
                        <span className="kpi-label">EPC</span>
                        <div className="kpi-icon-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 20V10M12 20V4M6 20v-6" />
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-num">${metrics.todayEpc?.toFixed(4) || '0.0000'}</div>
                    <span className="kpi-note">Earnings per click</span>
                </div>

                <div className="pub-kpi-card">
                    <div className="kpi-top">
                        <span className="kpi-label">Conversion Rate</span>
                        <div className="kpi-icon-box success">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-num">{metrics.todayCr?.toFixed(2) || '0.00'}%</div>
                    <span className="kpi-note">Conversion efficiency</span>
                </div>

                <div className="pub-kpi-card">
                    <div className="kpi-top">
                        <span className="kpi-label">Assigned Offers</span>
                        <div className="kpi-icon-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                <line x1="7" y1="7" x2="7.01" y2="7" />
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-num">{metrics.activeOffersCount || 0}</div>
                    <span className="kpi-note">Active campaigns</span>
                </div>
            </div>

            {/* Interactive Trend Chart Card */}
            <div className="pub-card-elevated">
                <div className="pub-card-top">
                    <div>
                        <h3 className="pub-card-heading">Performance Trends</h3>
                        <p className="pub-card-sub">
                            Clicks and conversions for the selected timeline.
                        </p>
                    </div>

                    {/* Chart Controls */}
                    <div className="chart-controls-wrapper">
                        {/* Metric Selector */}
                        <div className="metric-pills-bar">
                            <button
                                type="button"
                                className={`metric-pill ${chartMetric === 'clicks' ? 'active' : ''}`}
                                onClick={() => setChartMetric('clicks')}
                            >
                                Clicks
                            </button>
                            <button
                                type="button"
                                className={`metric-pill ${chartMetric === 'conversions' ? 'active' : ''}`}
                                onClick={() => setChartMetric('conversions')}
                            >
                                Conversions
                            </button>
                            <button
                                type="button"
                                className={`metric-pill ${chartMetric === 'payout' ? 'active' : ''}`}
                                onClick={() => setChartMetric('payout')}
                            >
                                Earnings ($)
                            </button>
                            <button
                                type="button"
                                className={`metric-pill ${chartMetric === 'cr' ? 'active' : ''}`}
                                onClick={() => setChartMetric('cr')}
                            >
                                CR (%)
                            </button>
                        </div>

                    </div>
                </div>

                {/* Period Summary Pills */}
                <div className="chart-stat-strip">
                    <div className="chart-stat-badge">
                        <span className="badge-lbl">Period Clicks:</span>
                        <span className="badge-val">{metrics.periodClicks?.toLocaleString() || 0}</span>
                    </div>
                    <div className="chart-stat-badge">
                        <span className="badge-lbl">Conversions:</span>
                        <span className="badge-val">{metrics.periodConversions?.toLocaleString() || 0}</span>
                    </div>
                    <div className="chart-stat-badge">
                        <span className="badge-lbl">Period Earnings:</span>
                        <span className="badge-val highlight">${metrics.periodPayout?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="chart-stat-badge">
                        <span className="badge-lbl">Period CR:</span>
                        <span className="badge-val">{metrics.periodCr || 0}%</span>
                    </div>
                </div>

                {/* Recharts Area Container */}
                <div className="chart-recharts-container">
                    {trend.length === 0 ? (
                        <div className="chart-empty-state">
                            <p>No traffic recorded for the selected timeline.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={activeConfig.color} stopOpacity={0.4} />
                                        <stop offset="95%" stopColor={activeConfig.color} stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                <XAxis
                                    dataKey="time"
                                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                    axisLine={{ stroke: 'var(--border-color)' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                    axisLine={{ stroke: 'var(--border-color)' }}
                                    tickLine={false}
                                    unit={activeConfig.unit}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const item = payload[0].payload;
                                            return (
                                                <div className="pub-chart-tooltip">
                                                    <div className="tooltip-title">{label || item.date}</div>
                                                    <div className="tooltip-row">
                                                        <span className="dot" style={{ background: activeConfig.color }}></span>
                                                        <span className="lbl">{activeConfig.name}:</span>
                                                        <span className="val">
                                                            {chartMetric === 'payout' ? `$${item.payout?.toFixed(2)}` :
                                                             chartMetric === 'cr' ? `${item.cr}%` :
                                                             item[chartMetric]?.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    {chartMetric !== 'clicks' && (
                                                        <div className="tooltip-sub">Clicks: {item.clicks?.toLocaleString()}</div>
                                                    )}
                                                    {chartMetric !== 'conversions' && (
                                                        <div className="tooltip-sub">Conversions: {item.conversions?.toLocaleString()}</div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey={chartMetric}
                                    stroke={activeConfig.color}
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#chartGradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Bento Grid: Top Campaigns + Device Breakdown + Country Breakdown */}
            <div className="pub-bento-grid">
                {/* Top Performing Assigned Campaigns */}
                <div className="pub-card-elevated bento-span-2">
                    <div className="pub-card-top">
                        <div>
                            <h3 className="pub-card-heading">Top Assigned Campaigns</h3>
                            <p className="pub-card-sub">Your top generating offers in this period.</p>
                        </div>
                        <Link to="/offers" className="pub-card-action-link">
                            View All Offers →
                        </Link>
                    </div>

                    <div className="top-offers-list">
                        {topOffers.length === 0 ? (
                            <div className="bento-empty-text">No campaign data recorded yet.</div>
                        ) : (
                            topOffers.map((o) => (
                                <div key={o.offer_id} className="top-offer-item">
                                    <div className="offer-item-left">
                                        <div className="offer-tag-id">#{o.public_offer_id}</div>
                                        <div>
                                            <h4 className="offer-title">{o.name}</h4>
                                            <span className="offer-meta">{o.category} • Payout: ${o.payout_rate.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="offer-item-stats">
                                        <div className="stat-pill">
                                            <span className="lbl">Clicks</span>
                                            <span className="val">{o.clicks.toLocaleString()}</span>
                                        </div>
                                        <div className="stat-pill">
                                            <span className="lbl">Conversions</span>
                                            <span className="val">{o.conversions.toLocaleString()}</span>
                                        </div>
                                        <div className="stat-pill highlight">
                                            <span className="lbl">Earnings</span>
                                            <span className="val">${o.payout.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Device Distribution */}
                <div className="pub-card-elevated">
                    <div className="pub-card-top">
                        <div>
                            <h3 className="pub-card-heading">Device Breakdown</h3>
                            <p className="pub-card-sub">Traffic by hardware platform.</p>
                        </div>
                    </div>

                    <div className="breakdown-list">
                        {deviceBreakdown.length === 0 ? (
                            <div className="bento-empty-text">No device metrics recorded yet.</div>
                        ) : (
                            deviceBreakdown.map((d, idx) => (
                                <div key={idx} className="breakdown-item">
                                    <div className="breakdown-row">
                                        <span className="item-name">{d.device}</span>
                                        <span className="item-val">{d.clicks.toLocaleString()} ({d.share}%)</span>
                                    </div>
                                    <div className="progress-track">
                                        <div className="progress-fill" style={{ width: `${d.share}%` }}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Geo Distribution */}
                <div className="pub-card-elevated">
                    <div className="pub-card-top">
                        <div>
                            <h3 className="pub-card-heading">Top Countries</h3>
                            <p className="pub-card-sub">Traffic geographic origin.</p>
                        </div>
                    </div>

                    <div className="breakdown-list">
                        {geoBreakdown.length === 0 ? (
                            <div className="bento-empty-text">No geographic data recorded yet.</div>
                        ) : (
                            geoBreakdown.map((g, idx) => (
                                <div key={idx} className="breakdown-item">
                                    <div className="breakdown-row">
                                        <span className="item-name country-badge">{g.country}</span>
                                        <span className="item-val">{g.clicks.toLocaleString()} ({g.share}%)</span>
                                    </div>
                                    <div className="progress-track">
                                        <div className="progress-fill geo" style={{ width: `${g.share}%` }}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Tracking Link Generator Widget */}
            {offers.length > 0 && activeOffer && (
                <div className="pub-card-elevated">
                    <div className="pub-card-top">
                        <div>
                            <h3 className="pub-card-heading">Quick Tracking Link Generator</h3>
                            <p className="pub-card-sub">
                                Select any campaign below to grab your customized tracking link in seconds.
                            </p>
                        </div>
                        <Link to="/offers" className="pub-card-action-link">
                            Go to Offers Page →
                        </Link>
                    </div>

                    <div className="quick-generator-body">
                        <div className="quick-selector-row">
                            <label className="pub-label">Select Campaign:</label>
                            <select
                                className="pub-input"
                                value={selectedOfferId}
                                onChange={(e) => setSelectedOfferId(e.target.value)}
                            >
                                {offers.map((o) => (
                                    <option key={o.assignment_id} value={o.assignment_id}>
                                        #{o.public_offer_id} - {o.name} (${Number(o.payout).toFixed(2)})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="quick-url-row">
                            <input
                                type="text"
                                readOnly
                                className="pub-input pub-input-code"
                                value={formatTrackingUrl(activeOffer.tracking_url)}
                            />
                            <button
                                type="button"
                                className="pub-btn-primary"
                                onClick={() => copyToClipboard(formatTrackingUrl(activeOffer.tracking_url), 'Tracking link')}
                            >
                                Copy Link
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Performance Breakdown Table */}
            <div className="pub-card-elevated">
                <div className="pub-card-top">
                    <div>
                        <h3 className="pub-card-heading">Timeline Performance Breakdown</h3>
                        <p className="pub-card-sub">Granular logs of your clicks, conversions, and payouts.</p>
                    </div>
                    <Link to="/reports" className="pub-card-action-link">
                        Detailed Reports & Dimensions →
                    </Link>
                </div>

                <div className="pub-table-responsive">
                    <table className="pub-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Clicks</th>
                                <th>Conversions</th>
                                <th>Earnings (Payout)</th>
                                <th>EPC</th>
                                <th>CR %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trend.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="pub-empty-cell">No traffic records in the selected period.</td>
                                </tr>
                            ) : (
                                pagedTrend.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="font-bold" data-label="Timestamp">{row.time || row.date}</td>
                                        <td data-label="Clicks">{row.clicks?.toLocaleString()}</td>
                                        <td data-label="Conversions">{row.conversions?.toLocaleString()}</td>
                                        <td className="payout-cell" data-label="Earnings">${row.payout?.toFixed(2)}</td>
                                        <td data-label="EPC">${row.epc}</td>
                                        <td data-label="CR">{row.cr}%</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        </table>
                </div>
                <EntityListPagination
                    currentPage={safeTrendPage}
                    totalPages={trendTotalPages}
                    total={trend.length}
                    itemsPerPage={LIST_PAGE_SIZE}
                    onPageChange={setTrendPage}
                />
            </div>
        </div>
    );
}
