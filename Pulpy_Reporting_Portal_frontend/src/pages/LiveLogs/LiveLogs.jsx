import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRefresh } from '../../context/RefreshContext';
import { useReportTimezone } from '../../context/ReportTimezoneContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { dashboardAPI, offersAPI, publishersAPI } from '../../services/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import { formatYmdInTimeZone, userRangeYmdToBackendIstRange } from '../../utils/reportTimezone';
import { SkeletonTable } from '../../components/Skeleton/Skeleton';
import './LiveLogs.css';

const ReportsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <path d="M10 9h1" />
    </svg>
);

const ApproveIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const LiveLogs = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const { reportTimezone, timezoneRevision } = useReportTimezone();
    const [activeTab, setActiveTab] = useState('clicks');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [limit, setLimit] = useState(100);
    const [approvingId, setApprovingId] = useState(null);

    // Filter State
    const [offers, setOffers] = useState([]);
    const [publishers, setPublishers] = useState([]);
    const [selectedOffer, setSelectedOffer] = useState('');
    const [selectedPublisher, setSelectedPublisher] = useState('');

    // Date Filter (calendar days in report timezone; API receives IST range)
    const [dateFrom, setDateFrom] = useState(() => formatYmdInTimeZone(new Date(), reportTimezone));
    const [dateTo, setDateTo] = useState(() => formatYmdInTimeZone(new Date(), reportTimezone));

    // Auto-refresh timer reference
    const [autoRefresh, setAutoRefresh] = useState(false);


    // Fetch Filter Options
    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const results = await Promise.allSettled([
                    offersAPI.getOffers({ limit: 1000 }),
                    publishersAPI.getPublishers({ limit: 1000 })
                ]);

                const offersResult = results[0];
                const publishersResult = results[1];

                if (offersResult.status === 'fulfilled' && offersResult.value.success) {
                    setOffers(offersResult.value.data);
                } else {
                    console.error("Failed to fetch offers", offersResult.reason || "API Error");
                }

                if (publishersResult.status === 'fulfilled' && publishersResult.value.success) {
                    setPublishers(publishersResult.value.data);
                } else {
                    console.error("Failed to fetch publishers", publishersResult.reason || "API Error");
                }
            } catch (err) {
                console.error("Error fetching filters", err);
            }
        };
        fetchFilters();
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [activeTab, limit, selectedOffer, selectedPublisher, dateFrom, dateTo, refreshKey, reportTimezone, timezoneRevision]);

    useEffect(() => {
        let interval;
        if (autoRefresh) {
            interval = setInterval(() => fetchLogs(true), 5000);
        }
        return () => clearInterval(interval);
    }, [autoRefresh, activeTab, limit, selectedOffer, selectedPublisher, dateFrom, dateTo, reportTimezone, timezoneRevision]);

    const fetchLogs = async (isBackground = false) => {
        setLoading(true);
        try {
            const params = { limit, page: 1 };
            if (selectedOffer) params.offer_id = selectedOffer;
            if (selectedPublisher) params.publisher_id = selectedPublisher;
            if (dateFrom && dateTo) {
                const { date_from, date_to } = userRangeYmdToBackendIstRange(dateFrom, dateTo, reportTimezone);
                if (date_from) params.date_from = date_from;
                if (date_to) params.date_to = date_to;
            }

            if (activeTab === 'clicks') {
                const response = await dashboardAPI.getDetailed(params, { trackActivity: !isBackground });
                if (response.success && response.data) {
                    setData(response.data);
                }
            } else {
                const response = await dashboardAPI.getConversions(params, { trackActivity: !isBackground });
                if (response.success && response.data) {
                    setData(response.data);
                }
            }
        } catch (error) {
            console.error("Failed to fetch logs", error);
        } finally {
            setLoading(false);
        }
    };

    const handleApproveClick = async (clickUuid) => {
        if (!window.confirm('Manually approve this conversion? This will update status to approved, calculate payout, and fire publisher postback.')) {
            return;
        }
        setApprovingId(clickUuid);
        try {
            const response = await dashboardAPI.approveClick(clickUuid);
            if (response.success) {
                toast.success(response.already_approved ? 'Already approved' : 'Conversion approved & postback fired');
                fetchLogs();
            } else {
                toast.error(response.message || 'Failed to approve');
            }
        } catch (err) {
            console.error('Approve error:', err);
            toast.error(err.message || 'Failed to approve');
        } finally {
            setApprovingId(null);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return formatDateTimeIST(dateString) || '-';
    };

    return (
        <div className="logs-page">
            <div className="logs-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h1>Live Logs</h1>
                    <button
                        className="btn btn-outline"
                        onClick={() => navigate('/reports')}
                        style={{ padding: '6px 12px', fontSize: '14px' }}
                    >
                        <ReportsIcon /> Reports
                    </button>
                </div>
                <div className="logs-controls">
                    <div className="control-group">
                        <label>From:</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="logs-date-input"
                        />
                    </div>
                    <div className="control-group">
                        <label>To:</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="logs-date-input"
                        />
                    </div>

                    <div className="control-group">
                        <select value={selectedOffer} onChange={(e) => setSelectedOffer(e.target.value)}>
                            <option value="">All Offers</option>
                            {offers.map(o => (
                                <option key={o.id} value={o.id}>{o.name} ({o.display_id || o.id})</option>
                            ))}
                        </select>
                    </div>

                    <div className="control-group">
                        <select value={selectedPublisher} onChange={(e) => setSelectedPublisher(e.target.value)}>
                            <option value="">All Publishers</option>
                            {publishers.map(p => (
                                <option key={p.id} value={p.id}>{p.company_name || p.email} ({p.public_publisher_id ?? p.id})</option>
                            ))}
                        </select>
                    </div>

                    <div className="tab-group">
                        <button
                            className={`tab-btn ${activeTab === 'clicks' ? 'active' : ''}`}
                            onClick={() => setActiveTab('clicks')}
                        >
                            Recent Clicks
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'conversions' ? 'active' : ''}`}
                            onClick={() => setActiveTab('conversions')}
                        >
                            Recent Conversions
                        </button>
                    </div>

                    <div className="control-group">
                        <label>Limit:</label>
                        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                            <option value="50">50</option>
                            <option value="100">100</option>
                            <option value="500">500</option>
                            <option value="1000">1000</option>
                        </select>
                    </div>

                    <div className="control-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                            />
                            Auto Refresh (5s)
                        </label>
                    </div>

                    <button className="btn btn-primary" onClick={() => fetchLogs()} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh Now'}
                    </button>
                </div>
            </div>

            <div className="logs-table-container">
                {loading ? (
                    <SkeletonTable rows={10} cols={activeTab === 'clicks' ? 9 : 10} />
                ) : (
                <table className="logs-table">
                    <thead>
                        {activeTab === 'clicks' ? (
                            <tr>
                                <th>Time</th>
                                <th>Click UUID</th>
                                <th>Offer</th>
                                <th>Publisher</th>
                                <th>IP</th>
                                <th>Location</th>
                                <th>Device</th>
                                <th>ISP</th>
                                <th>Status</th>
                            </tr>
                        ) : (
                            <tr>
                                <th>Time</th>
                                <th>Conversion UUID</th>
                                <th>Click UUID</th>
                                <th>Offer</th>
                                <th>Publisher</th>
                                <th>Revenue</th>
                                <th>Payout</th>
                                <th>Status</th>
                                <th>IP</th>
                                <th>Actions</th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === 'clicks' ? 9 : 10} style={{ textAlign: 'center', padding: '20px' }}>
                                    No logs found
                                </td>
                            </tr>
                        ) : data.map((row, idx) => (
                            <tr key={idx}>
                                {activeTab === 'clicks' ? (
                                    <>
                                        <td>{formatDate(row.click_created_at || row.created_at)}</td>
                                        <td className="monospace">{row.click_uuid}</td>
                                        <td>{row.offer_name} ({row.display_id || row.offer_id})</td>
                                        <td>{row.publisher_company || row.publisher_email} - ({row.public_publisher_id ?? row.publisher_id})</td>
                                        <td>{row.ip}</td>
                                        <td>{[row.city, row.region, row.country].filter(Boolean).join(', ') || '-'}</td>
                                        <td>{row.device_type} / {row.os}</td>
                                        <td>{row.isp || '-'}</td>
                                        <td>{row.conversion_id ? <span className="badge success">Converted</span> : <span className="badge neutral">Click</span>}</td>
                                    </>
                                ) : (
                                    <>
                                        <td>{formatDate(row.created_at)}</td>
                                        <td className="monospace">{row.conversion_uuid}</td>
                                        <td className="monospace">{row.click_uuid}</td>
                                        <td>{row.offer_name} ({row.display_id || row.offer_id})</td>
                                        <td>{row.publisher_name} - ({row.public_publisher_id ?? row.publisher_id})</td>
                                        <td>${parseFloat(row.amount || 0).toFixed(2)}</td>
                                        <td>${parseFloat(row.payout || 0).toFixed(2)}</td>
                                        <td>
                                            <span className={`badge ${row.status}`}>{row.status}</span>
                                        </td>
                                        <td>{row.ip}</td>
                                        <td>
                                            {(() => {
                                                const s = (row.status || '').toLowerCase();
                                                const canApprove = s === 'pending' || s === 'click_expired' || s === 'rejected' || s === 'rejected_cap';
                                                if (!canApprove) return null;
                                                return (
                                                    <button
                                                        className="btn btn-approve-sm"
                                                        onClick={() => handleApproveClick(row.click_uuid)}
                                                        disabled={approvingId === row.click_uuid}
                                                        title="Manually approve – fires postback & updates payout"
                                                    >
                                                        <ApproveIcon />
                                                        {approvingId === row.click_uuid ? 'Approving...' : 'Approve'}
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>
        </div>
    );
};

export default LiveLogs;
