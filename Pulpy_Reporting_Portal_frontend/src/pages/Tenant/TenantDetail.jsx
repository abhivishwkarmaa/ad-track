import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useReportTimezone } from '../../context/ReportTimezoneContext';
import { tenantsAPI, adminSubscriptionAPI } from '../../services/api';
import { useTenantDetail } from '../../hooks/queries/useTenantsQuery';
import { formatDateIST, formatDateTimeIST } from '../../utils/dateTime';
import { getTimelineRange } from '../../utils/timelineRange';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import './Tenant.css';

// SVG Icons
const EditIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

const CopyIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const ExternalLinkIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

const RefreshIcon = ({ spin }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={spin ? 'spin-icon' : ''}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const SearchIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const DownloadIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const normalizeStatus = (status) => String(status || '').toUpperCase();

const getStatusLabel = (status) => {
    switch (normalizeStatus(status)) {
        case 'TRIAL': return 'Trial';
        case 'ACTIVE': return 'Active';
        case 'EXPIRED': return 'Expired';
        case 'SUSPENDED': return 'Suspended';
        default: return status || 'Unknown';
    }
};

const getStatusClass = (status) => {
    const normalized = normalizeStatus(status);
    const allowed = new Set(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED']);
    return allowed.has(normalized) ? normalized.toLowerCase() : 'unknown';
};

const PRESET_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
];

function TenantDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { reportTimezone } = useReportTimezone();

    const { data: tenant, isLoading: loadingTenant, refetch: refetchTenant } = useTenantDetail(id);
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);

    // Active Navigation Tab
    const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'offers' | 'clicks' | 'conversions'

    // Date Range Filters
    const [preset, setPreset] = useState('this_month');
    const [customRange, setCustomRange] = useState(() => {
        const r = getTimelineRange('this_month', {}, reportTimezone);
        return { from: r.from, to: r.to };
    });

    // Effective Query Dates
    const effectiveDates = useMemo(() => {
        if (preset === 'custom') {
            return {
                from: customRange.from || '',
                to: customRange.to || '',
            };
        }
        return getTimelineRange(preset, {}, reportTimezone);
    }, [preset, customRange, reportTimezone]);

    // Data States
    const [statsData, setStatsData] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);

    // Offers Tab State
    const [offersData, setOffersData] = useState([]);
    const [offersPagination, setOffersPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
    const [offersSearch, setOffersSearch] = useState('');
    const [offersStatusFilter, setOffersStatusFilter] = useState('');
    const [offersLoading, setOffersLoading] = useState(false);

    // Clicks Tab State
    const [clicksData, setClicksData] = useState([]);
    const [clicksPagination, setClicksPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [clicksSearch, setClicksSearch] = useState('');
    const [clicksLoading, setClicksLoading] = useState(false);

    // Conversions Tab State
    const [conversionsData, setConversionsData] = useState([]);
    const [conversionsPagination, setConversionsPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [conversionsSearch, setConversionsSearch] = useState('');
    const [conversionsStatusFilter, setConversionsStatusFilter] = useState('');
    const [conversionsLoading, setConversionsLoading] = useState(false);

    // Modal state for Suspend / Resume
    const [confirmModal, setConfirmModal] = useState({ open: false, type: null });
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch Stats Overview & Daily Breakdown
    const fetchStats = useCallback(async () => {
        if (!id || !effectiveDates.from || !effectiveDates.to) return;
        try {
            setStatsLoading(true);
            const response = await tenantsAPI.getTenantStats(id, {
                date_from: effectiveDates.from,
                date_to: effectiveDates.to,
            });
            if (response.success && response.data) {
                setStatsData(response.data);
            }
        } catch (error) {
            console.error('Fetch tenant stats error:', error);
            toast.showToast(error.message || 'Failed to fetch tenant stats', 'error');
        } finally {
            setStatsLoading(false);
        }
    }, [id, effectiveDates.from, effectiveDates.to, toast]);

    // Fetch Offers List
    const fetchOffers = useCallback(async (page = 1) => {
        if (!id || !effectiveDates.from || !effectiveDates.to) return;
        try {
            setOffersLoading(true);
            const response = await tenantsAPI.getTenantOffers(id, {
                date_from: effectiveDates.from,
                date_to: effectiveDates.to,
                search: offersSearch,
                status: offersStatusFilter,
                page,
                limit: offersPagination.limit,
            });
            if (response.success) {
                setOffersData(response.data || []);
                if (response.pagination) {
                    setOffersPagination(response.pagination);
                }
            }
        } catch (error) {
            console.error('Fetch tenant offers error:', error);
        } finally {
            setOffersLoading(false);
        }
    }, [id, effectiveDates.from, effectiveDates.to, offersSearch, offersStatusFilter, offersPagination.limit]);

    // Fetch Clicks Log
    const fetchClicks = useCallback(async (page = 1) => {
        if (!id || !effectiveDates.from || !effectiveDates.to) return;
        try {
            setClicksLoading(true);
            const response = await tenantsAPI.getTenantClicks(id, {
                date_from: effectiveDates.from,
                date_to: effectiveDates.to,
                search: clicksSearch,
                page,
                limit: clicksPagination.limit,
            });
            if (response.success) {
                setClicksData(response.data || []);
                if (response.pagination) {
                    setClicksPagination(response.pagination);
                }
            }
        } catch (error) {
            console.error('Fetch tenant clicks error:', error);
        } finally {
            setClicksLoading(false);
        }
    }, [id, effectiveDates.from, effectiveDates.to, clicksSearch, clicksPagination.limit]);

    // Fetch Conversions Log
    const fetchConversions = useCallback(async (page = 1) => {
        if (!id || !effectiveDates.from || !effectiveDates.to) return;
        try {
            setConversionsLoading(true);
            const response = await tenantsAPI.getTenantConversions(id, {
                date_from: effectiveDates.from,
                date_to: effectiveDates.to,
                search: conversionsSearch,
                status: conversionsStatusFilter,
                page,
                limit: conversionsPagination.limit,
            });
            if (response.success) {
                setConversionsData(response.data || []);
                if (response.pagination) {
                    setConversionsPagination(response.pagination);
                }
            }
        } catch (error) {
            console.error('Fetch tenant conversions error:', error);
        } finally {
            setConversionsLoading(false);
        }
    }, [id, effectiveDates.from, effectiveDates.to, conversionsSearch, conversionsStatusFilter, conversionsPagination.limit]);

    // Subscription status
    const fetchSubscriptionStatus = useCallback(async () => {
        if (!id) return;
        try {
            const response = await adminSubscriptionAPI.getTenantStatus(id);
            if (response.success) {
                setSubscriptionStatus(response.data);
            }
        } catch (error) {
            console.error('Fetch subscription status error:', error);
        }
    }, [id]);

    useEffect(() => {
        fetchSubscriptionStatus();
    }, [fetchSubscriptionStatus]);

    // Re-fetch active tab data when date or tab changes
    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        if (activeTab === 'offers') {
            fetchOffers(1);
        } else if (activeTab === 'clicks') {
            fetchClicks(1);
        } else if (activeTab === 'conversions') {
            fetchConversions(1);
        }
    }, [activeTab, effectiveDates.from, effectiveDates.to, fetchOffers, fetchClicks, fetchConversions]);

    // Copy to clipboard helper
    const handleCopy = (text, label) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.showToast(`${label || 'Value'} copied to clipboard`, 'success');
    };

    // Format helpers
    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return new Intl.NumberFormat('en-US').format(num);
    };

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return formatDateIST(dateString, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        }, 'en-US') || 'N/A';
    };

    const formatIstDateTime = (value) => {
        if (!value) return 'N/A';
        return formatDateTimeIST(value, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }, 'en-US') || 'N/A';
    };

    // Export Daily Stats to CSV
    const exportDailyStatsCsv = () => {
        if (!statsData?.daily_breakdown?.length) {
            toast.showToast('No daily stats data to export', 'info');
            return;
        }

        const headers = ['Date', 'Clicks', 'Unique Clicks', 'Total Conversions', 'Approved', 'Pending', 'Rejected', 'Revenue ($)', 'Payout ($)', 'Net Profit ($)', 'CR (%)', 'EPC ($)'];
        const rows = statsData.daily_breakdown.map((row) => [
            row.date,
            row.clicks,
            row.unique_clicks,
            row.conversions,
            row.approved,
            row.pending,
            row.rejected,
            row.revenue.toFixed(2),
            row.payout.toFixed(2),
            row.profit.toFixed(2),
            row.cr.toFixed(2),
            row.epc.toFixed(4),
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `tenant_${tenant?.slug || id}_daily_stats_${effectiveDates.from}_to_${effectiveDates.to}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.showToast('Daily stats exported to CSV', 'success');
    };

    // Suspend / Resume Handlers
    const handleSuspendResume = async () => {
        if (!confirmModal.type) return;
        try {
            setActionLoading(true);
            if (confirmModal.type === 'suspend') {
                const res = await tenantsAPI.suspendTenant(id);
                if (res.success) {
                    toast.showToast('Tenant suspended successfully', 'success');
                }
            } else if (confirmModal.type === 'resume') {
                const res = await tenantsAPI.resumeTenant(id);
                if (res.success) {
                    toast.showToast('Tenant resumed successfully', 'success');
                }
            }
            setConfirmModal({ open: false, type: null });
            refetchTenant();
            fetchSubscriptionStatus();
        } catch (error) {
            toast.showToast(error.message || 'Operation failed', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    if (loadingTenant) {
        return (
            <div className="tenant-container">
                <SkeletonDetail sections={3} />
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="tenant-container">
                <div className="error-state">Tenant not found</div>
            </div>
        );
    }

    const isSuspended = normalizeStatus(tenant.status) === 'SUSPENDED';
    const summary = statsData?.summary || {};
    const dailyBreakdown = statsData?.daily_breakdown || [];

    // Aggregate totals for daily table footer
    const dailyTotals = dailyBreakdown.reduce((acc, row) => {
        acc.clicks += row.clicks || 0;
        acc.unique_clicks += row.unique_clicks || 0;
        acc.conversions += row.conversions || 0;
        acc.approved += row.approved || 0;
        acc.pending += row.pending || 0;
        acc.rejected += row.rejected || 0;
        acc.revenue += row.revenue || 0;
        acc.payout += row.payout || 0;
        acc.profit += row.profit || 0;
        return acc;
    }, { clicks: 0, unique_clicks: 0, conversions: 0, approved: 0, pending: 0, rejected: 0, revenue: 0, payout: 0, profit: 0 });

    const dailyTotalCr = dailyTotals.clicks > 0 ? ((dailyTotals.conversions / dailyTotals.clicks) * 100).toFixed(2) : '0.00';
    const dailyTotalEpc = dailyTotals.clicks > 0 ? (dailyTotals.revenue / dailyTotals.clicks).toFixed(4) : '0.0000';

    return (
        <div className="tenant-detail-container">
            {/* Top Navigation Back */}
            <div style={{ marginBottom: '16px' }}>
                <Link
                    to="/tenant/manage"
                    style={{ color: '#6366f1', textDecoration: 'none', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                    ← Back to Tenant List
                </Link>
            </div>

            {/* Tenant Header Card */}
            <div className="tenant-banner-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>
                                {tenant.name}
                            </h2>
                            <span className={`tenant-status ${getStatusClass(tenant.status)}`}>
                                {getStatusLabel(tenant.status)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <a
                                href={`https://${tenant.slug}.track-myads.com`}
                                target="_blank"
                                rel="noreferrer"
                                className="tenant-subdomain-pill"
                                title="Open tenant portal in new tab"
                            >
                                {tenant.slug}.track-myads.com
                                <ExternalLinkIcon />
                            </a>
                            <button
                                type="button"
                                className="copy-icon-btn"
                                onClick={() => handleCopy(`${tenant.slug}.track-myads.com`, 'Tenant Subdomain')}
                                title="Copy Subdomain"
                            >
                                <CopyIcon />
                            </button>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Link
                            to={`/tenant/edit/${tenant.id}`}
                            className="tenant-action-btn edit"
                            style={{ textDecoration: 'none' }}
                        >
                            <EditIcon />
                            Edit Tenant
                        </Link>
                        {isSuspended ? (
                            <button
                                type="button"
                                className="tenant-action-btn resume"
                                onClick={() => setConfirmModal({ open: true, type: 'resume' })}
                            >
                                Resume Tenant
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="tenant-action-btn suspend"
                                onClick={() => setConfirmModal({ open: true, type: 'suspend' })}
                            >
                                Suspend Tenant
                            </button>
                        )}
                    </div>
                </div>

                {/* Tenant & Subscription Quick Metadata */}
                <div className="tenant-info-summary-grid">
                    <div className="tenant-info-summary-item">
                        <span className="label">Plan / License</span>
                        <span className="val">{subscriptionStatus?.tenant?.subscription_plan || 'Standard'}</span>
                    </div>
                    <div className="tenant-info-summary-item">
                        <span className="label">Days Remaining</span>
                        <span className="val" style={{ color: subscriptionStatus?.subscription?.days_left <= 7 ? '#dc2626' : '#111827' }}>
                            {subscriptionStatus?.subscription?.days_left ?? 'N/A'} days
                        </span>
                    </div>
                    <div className="tenant-info-summary-item">
                        <span className="label">Billing Email</span>
                        <span className="val">{subscriptionStatus?.tenant?.billing_email || 'Not configured'}</span>
                    </div>
                    <div className="tenant-info-summary-item">
                        <span className="label">Created Date</span>
                        <span className="val">{formatDate(tenant.created_at)}</span>
                    </div>
                    <div className="tenant-info-summary-item">
                        <span className="label">Active Offers</span>
                        <span className="val">{formatNumber(summary.active_offers ?? summary.total_offers ?? 0)}</span>
                    </div>
                    <div className="tenant-info-summary-item">
                        <span className="label">Active Publishers</span>
                        <span className="val">{formatNumber(summary.active_publishers ?? summary.total_publishers ?? 0)}</span>
                    </div>
                </div>
            </div>

            {/* Date Range Controls Bar */}
            <div className="tenant-controls-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="date-preset-pills">
                        {PRESET_OPTIONS.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                className={`date-preset-btn ${preset === opt.id ? 'active' : ''}`}
                                onClick={() => {
                                    setPreset(opt.id);
                                    if (opt.id !== 'custom') {
                                        const r = getTimelineRange(opt.id, {}, reportTimezone);
                                        setCustomRange({ from: r.from, to: r.to });
                                    }
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {preset === 'custom' && (
                        <div className="custom-date-inputs">
                            <input
                                type="date"
                                value={customRange.from}
                                onChange={(e) => setCustomRange((prev) => ({ ...prev, from: e.target.value }))}
                            />
                            <span>to</span>
                            <input
                                type="date"
                                value={customRange.to}
                                onChange={(e) => setCustomRange((prev) => ({ ...prev, to: e.target.value }))}
                            />
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                        Period: <strong>{formatDate(effectiveDates.from)}</strong> – <strong>{formatDate(effectiveDates.to)}</strong>
                    </span>
                    <button
                        type="button"
                        className="refresh-action-btn"
                        onClick={() => {
                            fetchStats();
                            if (activeTab === 'offers') fetchOffers(offersPagination.page);
                            if (activeTab === 'clicks') fetchClicks(clicksPagination.page);
                            if (activeTab === 'conversions') fetchConversions(conversionsPagination.page);
                        }}
                        disabled={statsLoading}
                        title="Refresh Data"
                    >
                        <RefreshIcon spin={statsLoading} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Executive KPI Summary Cards Grid */}
            <div className="tenant-kpi-grid">
                {/* Clicks */}
                <div className="tenant-kpi-card traffic">
                    <div className="kpi-header">
                        <span className="kpi-title">Total Traffic</span>
                        <span className="kpi-badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>Clicks</span>
                    </div>
                    <div className="kpi-value">{formatNumber(summary.total_clicks || 0)}</div>
                    <div className="kpi-subtext">
                        <span>Unique: <strong>{formatNumber(summary.unique_clicks || 0)}</strong></span>
                    </div>
                </div>

                {/* Conversions */}
                <div className="tenant-kpi-card conversions">
                    <div className="kpi-header">
                        <span className="kpi-title">Conversions</span>
                        <span className="kpi-badge" style={{ background: '#d1fae5', color: '#065f46' }}>Total</span>
                    </div>
                    <div className="kpi-value">{formatNumber(summary.total_conversions || 0)}</div>
                    <div className="kpi-subtext">
                        <span className="conv-badge approved" style={{ fontSize: '10px', padding: '1px 6px' }}>App: {formatNumber(summary.approved_conversions || 0)}</span>
                        <span className="conv-badge pending" style={{ fontSize: '10px', padding: '1px 6px' }}>Pend: {formatNumber(summary.pending_conversions || 0)}</span>
                        <span className="conv-badge rejected" style={{ fontSize: '10px', padding: '1px 6px' }}>Rej: {formatNumber(summary.rejected_conversions || 0)}</span>
                    </div>
                </div>

                {/* Revenue */}
                <div className="tenant-kpi-card revenue">
                    <div className="kpi-header">
                        <span className="kpi-title">Gross Revenue</span>
                        <span className="kpi-badge" style={{ background: '#cffafe', color: '#0e7490' }}>Income</span>
                    </div>
                    <div className="kpi-value">{formatCurrency(summary.total_revenue || 0)}</div>
                    <div className="kpi-subtext">
                        <span>Payout: <strong>{formatCurrency(summary.total_payout || 0)}</strong></span>
                    </div>
                </div>

                {/* Net Profit */}
                <div className="tenant-kpi-card profit">
                    <div className="kpi-header">
                        <span className="kpi-title">Net Profit</span>
                        <span className="kpi-badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>Margin</span>
                    </div>
                    <div className="kpi-value" style={{ color: (summary.net_profit || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatCurrency(summary.net_profit || 0)}
                    </div>
                    <div className="kpi-subtext">
                        <span>
                            Margin: <strong>{summary.total_revenue > 0 ? (((summary.net_profit || 0) / summary.total_revenue) * 100).toFixed(1) : '0'}%</strong>
                        </span>
                    </div>
                </div>

                {/* Conversion Rate & EPC */}
                <div className="tenant-kpi-card efficiency">
                    <div className="kpi-header">
                        <span className="kpi-title">Performance</span>
                        <span className="kpi-badge" style={{ background: '#fef3c7', color: '#92400e' }}>Rates</span>
                    </div>
                    <div className="kpi-value">{summary.conversion_rate || 0}%</div>
                    <div className="kpi-subtext">
                        <span>Approved CR: <strong>{summary.approved_cr || 0}%</strong></span>
                        <span>•</span>
                        <span>EPC: <strong>${summary.epc || '0.00'}</strong></span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="tenant-tabs-nav">
                <button
                    type="button"
                    className={`tenant-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
                    onClick={() => setActiveTab('daily')}
                >
                    📊 Daily Stats Breakdown
                    <span className="tenant-tab-badge">{dailyBreakdown.length}</span>
                </button>
                <button
                    type="button"
                    className={`tenant-tab-btn ${activeTab === 'offers' ? 'active' : ''}`}
                    onClick={() => setActiveTab('offers')}
                >
                    🏷️ Offers Performance
                </button>
                <button
                    type="button"
                    className={`tenant-tab-btn ${activeTab === 'clicks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('clicks')}
                >
                    🖱️ Clicks Log
                </button>
                <button
                    type="button"
                    className={`tenant-tab-btn ${activeTab === 'conversions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('conversions')}
                >
                    💰 Conversions Log
                </button>
            </div>

            {/* TAB 1: DAILY STATS BREAKDOWN TABLE */}
            {activeTab === 'daily' && (
                <div className="tenant-data-card">
                    <div className="tenant-data-header">
                        <h3>Daily Aggregated Stats Breakdown</h3>
                        <div className="tenant-table-toolbar">
                            <button
                                type="button"
                                className="refresh-action-btn"
                                onClick={exportDailyStatsCsv}
                                disabled={!dailyBreakdown.length}
                            >
                                <DownloadIcon />
                                Export CSV
                            </button>
                        </div>
                    </div>

                    {statsLoading ? (
                        <div className="loading-state">Loading stats breakdown...</div>
                    ) : dailyBreakdown.length === 0 ? (
                        <div className="empty-state">No statistics found for the selected date period.</div>
                    ) : (
                        <div className="stats-table-wrapper">
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th className="text-right">Clicks</th>
                                        <th className="text-right">Unique Clicks</th>
                                        <th className="text-right">Total Conv</th>
                                        <th className="text-right">Approved</th>
                                        <th className="text-right">Pending</th>
                                        <th className="text-right">Rejected</th>
                                        <th className="text-right">Revenue ($)</th>
                                        <th className="text-right">Payout ($)</th>
                                        <th className="text-right">Net Profit ($)</th>
                                        <th className="text-right">CR (%)</th>
                                        <th className="text-right">EPC ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyBreakdown.map((row) => (
                                        <tr key={row.date}>
                                            <td style={{ fontWeight: '600', color: '#111827' }}>
                                                {formatDate(row.date)}
                                            </td>
                                            <td className="text-right font-mono">{formatNumber(row.clicks)}</td>
                                            <td className="text-right font-mono text-muted">{formatNumber(row.unique_clicks)}</td>
                                            <td className="text-right font-mono font-bold">{formatNumber(row.conversions)}</td>
                                            <td className="text-right font-mono text-success">{formatNumber(row.approved)}</td>
                                            <td className="text-right font-mono" style={{ color: '#d97706' }}>{formatNumber(row.pending)}</td>
                                            <td className="text-right font-mono text-danger">{formatNumber(row.rejected)}</td>
                                            <td className="text-right font-mono">{formatCurrency(row.revenue)}</td>
                                            <td className="text-right font-mono text-muted">{formatCurrency(row.payout)}</td>
                                            <td className="text-right font-mono" style={{ fontWeight: '600', color: row.profit >= 0 ? '#10b981' : '#ef4444' }}>
                                                {formatCurrency(row.profit)}
                                            </td>
                                            <td className="text-right font-mono">{row.cr}%</td>
                                            <td className="text-right font-mono">${row.epc.toFixed(4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td>Total / Summary</td>
                                        <td className="text-right font-mono">{formatNumber(dailyTotals.clicks)}</td>
                                        <td className="text-right font-mono">{formatNumber(dailyTotals.unique_clicks)}</td>
                                        <td className="text-right font-mono">{formatNumber(dailyTotals.conversions)}</td>
                                        <td className="text-right font-mono text-success">{formatNumber(dailyTotals.approved)}</td>
                                        <td className="text-right font-mono" style={{ color: '#d97706' }}>{formatNumber(dailyTotals.pending)}</td>
                                        <td className="text-right font-mono text-danger">{formatNumber(dailyTotals.rejected)}</td>
                                        <td className="text-right font-mono">{formatCurrency(dailyTotals.revenue)}</td>
                                        <td className="text-right font-mono">{formatCurrency(dailyTotals.payout)}</td>
                                        <td className="text-right font-mono" style={{ color: dailyTotals.profit >= 0 ? '#10b981' : '#ef4444' }}>
                                            {formatCurrency(dailyTotals.profit)}
                                        </td>
                                        <td className="text-right font-mono">{dailyTotalCr}%</td>
                                        <td className="text-right font-mono">${dailyTotalEpc}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: OFFERS LIST & PERFORMANCE TABLE */}
            {activeTab === 'offers' && (
                <div className="tenant-data-card">
                    <div className="tenant-data-header">
                        <h3>Tenant Offers & Performance ({offersPagination.total})</h3>
                        <div className="tenant-table-toolbar">
                            <div className="table-search-input">
                                <span className="table-search-icon"><SearchIcon /></span>
                                <input
                                    type="text"
                                    placeholder="Search offer name or ID..."
                                    value={offersSearch}
                                    onChange={(e) => setOffersSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchOffers(1)}
                                />
                            </div>

                            <select
                                className="table-filter-select"
                                value={offersStatusFilter}
                                onChange={(e) => {
                                    setOffersStatusFilter(e.target.value);
                                }}
                            >
                                <option value="">All Statuses</option>
                                <option value="live">Live</option>
                                <option value="paused">Paused</option>
                                <option value="draft">Draft</option>
                            </select>

                            <button
                                type="button"
                                className="refresh-action-btn"
                                onClick={() => fetchOffers(1)}
                            >
                                Filter
                            </button>
                        </div>
                    </div>

                    {offersLoading ? (
                        <div className="loading-state">Loading offers...</div>
                    ) : offersData.length === 0 ? (
                        <div className="empty-state">No offers found for this tenant in the selected period.</div>
                    ) : (
                        <div className="stats-table-wrapper">
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Offer ID / Public ID</th>
                                        <th>Offer Name</th>
                                        <th>Advertiser</th>
                                        <th>Model / Payout</th>
                                        <th>Status</th>
                                        <th className="text-right">Clicks</th>
                                        <th className="text-right">Conversions</th>
                                        <th className="text-right">Revenue ($)</th>
                                        <th className="text-right">Payout ($)</th>
                                        <th className="text-right">Net Profit ($)</th>
                                        <th className="text-right">CR (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offersData.map((offer) => (
                                        <tr key={offer.id}>
                                            <td className="font-mono">
                                                <span style={{ fontWeight: '600' }}>#{offer.id}</span>
                                                {offer.public_offer_id && (
                                                    <span style={{ display: 'block', fontSize: '11px', color: '#6b7280' }}>
                                                        {offer.public_offer_id}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: '600', color: '#111827' }}>{offer.name}</div>
                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>Category: {offer.category || 'General'}</div>
                                            </td>
                                            <td style={{ color: '#4b5563' }}>{offer.advertiser_name || 'N/A'}</td>
                                            <td>
                                                <span style={{ fontWeight: '500' }}>{offer.affiliate_model || 'CPA'}</span>
                                                <div style={{ fontSize: '11px', color: '#059669', fontWeight: '600' }}>
                                                    {formatCurrency(offer.affiliate_amount)}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`tenant-status ${offer.status === 'live' ? 'active' : 'expired'}`}>
                                                    {offer.status || 'draft'}
                                                </span>
                                            </td>
                                            <td className="text-right font-mono">{formatNumber(offer.total_clicks)}</td>
                                            <td className="text-right font-mono font-bold">
                                                {formatNumber(offer.total_conversions)}
                                                {offer.approved_conversions > 0 && (
                                                    <span style={{ fontSize: '11px', color: '#059669', display: 'block' }}>
                                                        ({offer.approved_conversions} app)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right font-mono">{formatCurrency(offer.total_revenue)}</td>
                                            <td className="text-right font-mono text-muted">{formatCurrency(offer.total_payout)}</td>
                                            <td className="text-right font-mono" style={{ fontWeight: '600', color: offer.net_profit >= 0 ? '#10b981' : '#ef4444' }}>
                                                {formatCurrency(offer.net_profit)}
                                            </td>
                                            <td className="text-right font-mono">{offer.conversion_rate}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {offersPagination.totalPages > 1 && (
                        <div className="tenant-table-pagination">
                            <span>Showing page {offersPagination.page} of {offersPagination.totalPages} ({offersPagination.total} total offers)</span>
                            <div className="pagination-btn-group">
                                <button
                                    type="button"
                                    className="page-nav-btn"
                                    disabled={offersPagination.page <= 1}
                                    onClick={() => fetchOffers(offersPagination.page - 1)}
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    className="page-nav-btn"
                                    disabled={offersPagination.page >= offersPagination.totalPages}
                                    onClick={() => fetchOffers(offersPagination.page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: CLICKS LOG TABLE */}
            {activeTab === 'clicks' && (
                <div className="tenant-data-card">
                    <div className="tenant-data-header">
                        <h3>Tenant Click Stream ({clicksPagination.total})</h3>
                        <div className="tenant-table-toolbar">
                            <div className="table-search-input">
                                <span className="table-search-icon"><SearchIcon /></span>
                                <input
                                    type="text"
                                    placeholder="Search UUID, IP, Offer, Publisher..."
                                    value={clicksSearch}
                                    onChange={(e) => setClicksSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchClicks(1)}
                                />
                            </div>
                            <button
                                type="button"
                                className="refresh-action-btn"
                                onClick={() => fetchClicks(1)}
                            >
                                Search
                            </button>
                        </div>
                    </div>

                    {clicksLoading ? (
                        <div className="loading-state">Loading clicks stream...</div>
                    ) : clicksData.length === 0 ? (
                        <div className="empty-state">No click events recorded for this period.</div>
                    ) : (
                        <div className="stats-table-wrapper">
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Click UUID</th>
                                        <th>Timestamp (IST)</th>
                                        <th>Offer</th>
                                        <th>Publisher</th>
                                        <th>IP Address</th>
                                        <th>Location</th>
                                        <th>Device / OS / Browser</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clicksData.map((click) => (
                                        <tr key={click.id}>
                                            <td className="font-mono" style={{ fontSize: '12px' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>{click.click_uuid ? `${click.click_uuid.slice(0, 12)}...` : `#${click.id}`}</span>
                                                    <button
                                                        type="button"
                                                        className="copy-icon-btn"
                                                        onClick={() => handleCopy(click.click_uuid, 'Click UUID')}
                                                        title="Copy full Click UUID"
                                                    >
                                                        <CopyIcon />
                                                    </button>
                                                </div>
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                                {formatIstDateTime(click.created_at)}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: '600', color: '#111827' }}>
                                                    {click.offer_name || `Offer #${click.offer_id}`}
                                                </div>
                                            </td>
                                            <td style={{ color: '#4b5563' }}>
                                                {click.publisher_name || `Publisher #${click.publisher_id}`}
                                            </td>
                                            <td className="font-mono text-muted">{click.ip || 'N/A'}</td>
                                            <td>
                                                {click.country || 'N/A'}{click.city ? `, ${click.city}` : ''}
                                            </td>
                                            <td style={{ fontSize: '12px', color: '#6b7280' }}>
                                                {[click.device_type, click.os, click.browser].filter(Boolean).join(' • ') || 'N/A'}
                                            </td>
                                            <td>
                                                {click.conversion_id ? (
                                                    <span className={`conv-badge ${click.conversion_status || 'approved'}`}>
                                                        Converted ({click.conversion_status || 'Approved'})
                                                    </span>
                                                ) : (
                                                    <span className="conv-badge clicked">
                                                        Clicked
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {clicksPagination.totalPages > 1 && (
                        <div className="tenant-table-pagination">
                            <span>Showing page {clicksPagination.page} of {clicksPagination.totalPages} ({clicksPagination.total} total clicks)</span>
                            <div className="pagination-btn-group">
                                <button
                                    type="button"
                                    className="page-nav-btn"
                                    disabled={clicksPagination.page <= 1}
                                    onClick={() => fetchClicks(clicksPagination.page - 1)}
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    className="page-nav-btn"
                                    disabled={clicksPagination.page >= clicksPagination.totalPages}
                                    onClick={() => fetchClicks(clicksPagination.page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: CONVERSIONS LOG TABLE */}
            {activeTab === 'conversions' && (
                <div className="tenant-data-card">
                    <div className="tenant-data-header">
                        <h3>Tenant Conversions Log ({conversionsPagination.total})</h3>
                        <div className="tenant-table-toolbar">
                            <div className="table-search-input">
                                <span className="table-search-icon"><SearchIcon /></span>
                                <input
                                    type="text"
                                    placeholder="Search Conversion UUID, Click UUID..."
                                    value={conversionsSearch}
                                    onChange={(e) => setConversionsSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchConversions(1)}
                                />
                            </div>

                            <select
                                className="table-filter-select"
                                value={conversionsStatusFilter}
                                onChange={(e) => setConversionsStatusFilter(e.target.value)}
                            >
                                <option value="">All Statuses</option>
                                <option value="approved">Approved</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                            </select>

                            <button
                                type="button"
                                className="refresh-action-btn"
                                onClick={() => fetchConversions(1)}
                            >
                                Filter
                            </button>
                        </div>
                    </div>

                    {conversionsLoading ? (
                        <div className="loading-state">Loading conversions log...</div>
                    ) : conversionsData.length === 0 ? (
                        <div className="empty-state">No conversions found for this tenant in the selected period.</div>
                    ) : (
                        <div className="stats-table-wrapper">
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Conversion UUID</th>
                                        <th>Click UUID</th>
                                        <th>Timestamp (IST)</th>
                                        <th>Offer</th>
                                        <th>Publisher</th>
                                        <th className="text-right">Revenue ($)</th>
                                        <th className="text-right">Payout ($)</th>
                                        <th className="text-right">Net Profit ($)</th>
                                        <th>Status</th>
                                        <th>Location</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conversionsData.map((conv) => {
                                        const amount = parseFloat(conv.amount || 0);
                                        const payout = parseFloat(conv.payout || 0);
                                        const profit = amount - payout;
                                        return (
                                            <tr key={conv.id}>
                                                <td className="font-mono" style={{ fontSize: '12px' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                        <span>{conv.conversion_uuid ? `${conv.conversion_uuid.slice(0, 10)}...` : `#${conv.id}`}</span>
                                                        <button
                                                            type="button"
                                                            className="copy-icon-btn"
                                                            onClick={() => handleCopy(conv.conversion_uuid, 'Conversion UUID')}
                                                            title="Copy Conversion UUID"
                                                        >
                                                            <CopyIcon />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="font-mono text-muted" style={{ fontSize: '11px' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>{conv.click_uuid ? `${conv.click_uuid.slice(0, 8)}...` : 'N/A'}</span>
                                                        {conv.click_uuid && (
                                                            <button
                                                                type="button"
                                                                className="copy-icon-btn"
                                                                onClick={() => handleCopy(conv.click_uuid, 'Click UUID')}
                                                                title="Copy Click UUID"
                                                            >
                                                                <CopyIcon />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                                    {formatIstDateTime(conv.created_at)}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: '600', color: '#111827' }}>
                                                        {conv.offer_name || `Offer #${conv.offer_id}`}
                                                    </div>
                                                </td>
                                                <td style={{ color: '#4b5563' }}>
                                                    {conv.publisher_name || `Publisher #${conv.publisher_id}`}
                                                </td>
                                                <td className="text-right font-mono font-bold">{formatCurrency(amount)}</td>
                                                <td className="text-right font-mono text-muted">{formatCurrency(payout)}</td>
                                                <td className="text-right font-mono" style={{ fontWeight: '600', color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                                                    {formatCurrency(profit)}
                                                </td>
                                                <td>
                                                    <span className={`conv-badge ${conv.status || 'approved'}`}>
                                                        {conv.status || 'Approved'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '12px' }}>{conv.country || 'N/A'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {conversionsPagination.totalPages > 1 && (
                        <div className="tenant-table-pagination">
                            <span>Showing page {conversionsPagination.page} of {conversionsPagination.totalPages} ({conversionsPagination.total} total conversions)</span>
                            <div className="pagination-btn-group">
                                <button
                                    type="button"
                                    className="page-nav-btn"
                                    disabled={conversionsPagination.page <= 1}
                                    onClick={() => fetchConversions(conversionsPagination.page - 1)}
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    className="page-nav-btn"
                                    disabled={conversionsPagination.page >= conversionsPagination.totalPages}
                                    onClick={() => fetchConversions(conversionsPagination.page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Suspend / Resume Confirmation Modal */}
            {confirmModal.open && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{confirmModal.type === 'suspend' ? 'Suspend Tenant Access' : 'Resume Tenant Access'}</h3>
                        <p>
                            {confirmModal.type === 'suspend'
                                ? `Are you sure you want to suspend "${tenant.name}"? This will immediately block tracking redirects and login access for all users under this tenant.`
                                : `Are you sure you want to restore active access for "${tenant.name}"?`}
                        </p>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => setConfirmModal({ open: false, type: null })}
                                disabled={actionLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={confirmModal.type === 'suspend' ? 'danger' : 'primary'}
                                onClick={handleSuspendResume}
                                disabled={actionLoading}
                            >
                                {actionLoading ? 'Processing...' : (confirmModal.type === 'suspend' ? 'Confirm Suspend' : 'Confirm Resume')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TenantDetail;
