import { useState, useEffect, useMemo } from 'react';
import { publisherAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { useReportTimezone } from '../../context/ReportTimezoneContext';
import TimelineFilter from '../../components/TimelineFilter/TimelineFilter';
import { EntityListPagination } from '../../shared/ui/EntityList';
import { SkeletonTable } from '../../components/Skeleton/Skeleton';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import { getTimelineRange } from '../../utils/timelineRange';
import { userRangeYmdToBackendIstRange } from '../../utils/reportTimezone';
import '../Reports/Reports.css';
import './PublisherReports.css';

export default function PublisherReports() {
    const { refreshKey } = useRefresh();
    const { reportTimezone } = useReportTimezone();
    const [dateFilter, setDateFilter] = useState('today');
    const [customRange, setCustomRange] = useState({ from: '', to: '' });
    const [groupBy, setGroupBy] = useState('date');
    const [selectedOfferId, setSelectedOfferId] = useState('');
    const [search, setSearch] = useState('');

    const [reports, setReports] = useState([]);
    const [summary, setSummary] = useState(null);
    const [assignedOffers, setAssignedOffers] = useState([]);

    const [sortField, setSortField] = useState('clicks');
    const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'
    const [page, setPage] = useState(1);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { showToast } = useToast();

    const dateRange = useMemo(
        () => getTimelineRange(dateFilter, customRange, reportTimezone),
        [dateFilter, customRange, reportTimezone]
    );
    const apiDateRange = useMemo(
        () => userRangeYmdToBackendIstRange(dateRange.from, dateRange.to, reportTimezone),
        [dateRange.from, dateRange.to, reportTimezone]
    );

    const fetchReports = async () => {
        if (dateFilter === 'custom' && (!dateRange.from || !dateRange.to)) return;
        try {
            setLoading(true);
            setError('');
            const res = await publisherAPI.getReports({
                start_date: apiDateRange.date_from,
                end_date: apiDateRange.date_to,
                group_by: groupBy,
                offer_id: selectedOfferId,
                search: search,
            });

            if (res.success && res.data) {
                setReports(res.data);
                setSummary(res.summary || null);
                if (res.assigned_offers) {
                    setAssignedOffers(res.assigned_offers);
                }
            } else {
                setError(res.message || 'Failed to fetch performance reports');
            }
        } catch (err) {
            setError(err.message || 'Error loading reports');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [apiDateRange.date_from, apiDateRange.date_to, groupBy, selectedOfferId, refreshKey, dateFilter, reportTimezone]);

    // Sorting logic
    const sortedReports = useMemo(() => {
        if (!reports || reports.length === 0) return [];
        const items = [...reports];
        items.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            if (typeof aVal === 'string') {
                return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            aVal = Number(aVal || 0);
            bVal = Number(bVal || 0);
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return items;
    }, [reports, sortField, sortOrder]);

    const reportTotalPages = Math.max(1, Math.ceil(sortedReports.length / LIST_PAGE_SIZE));
    const safePage = Math.min(page, reportTotalPages);
    const pagedReports = sortedReports.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [reports, sortField, sortOrder, groupBy, selectedOfferId, apiDateRange.date_from, apiDateRange.date_to]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // Export to CSV
    const exportCSV = () => {
        if (!sortedReports || sortedReports.length === 0) {
            showToast('No data to export', 'error');
            return;
        }

        const headers = ['Dimension', 'Clicks', 'Conversions', 'Earnings ($)', 'EPC ($)', 'CR (%)'];
        const csvRows = [headers.join(',')];

        sortedReports.forEach((row) => {
            const label = `"${(row.label || row.id || '').replace(/"/g, '""')}"`;
            const clicks = row.clicks || 0;
            const convs = row.conversions || 0;
            const payout = (row.payout || 0).toFixed(2);
            const epc = (row.epc || 0).toFixed(4);
            const cr = (row.cr || 0).toFixed(2);
            csvRows.push([label, clicks, convs, payout, epc, cr].join(','));
        });

        const csvString = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', csvString);
        downloadAnchor.setAttribute('download', `publisher_report_${groupBy}_${apiDateRange.date_from}_to_${apiDateRange.date_to}.csv`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        showToast('Report exported successfully to CSV!', 'success');
    };

    const resetFilters = () => {
        setSelectedOfferId('');
        setSearch('');
        setGroupBy('date');
        setDateFilter('today');
        setCustomRange({ from: '', to: '' });
    };

    // Dimension label helper
    const getDimensionHeader = () => {
        switch (groupBy) {
            case 'hour': return 'Hour (IST)';
            case 'offer': return 'Campaign / Offer';
            case 'country': return 'Country';
            case 'device_type': return 'Device Type';
            case 'os': return 'Operating System';
            case 'browser': return 'Browser';
            case 'date':
            default: return 'Date (IST)';
        }
    };

    return (
        <div className="pub-reports-view">
            {/* Header */}
            <div className="pub-view-header">
                <div>
                    <h2 className="pub-view-title">Performance Reports & Analytics</h2>
                    <p className="pub-view-subtitle">
                        Multidimensional reporting for your assigned campaigns and traffic.
                    </p>
                </div>

                <div className="pub-header-actions">
                    <button type="button" className="pub-btn-secondary" onClick={exportCSV}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="reports-filters">
                <TimelineFilter
                    value={dateFilter}
                    customRange={customRange}
                    onPresetChange={setDateFilter}
                    onCustomRangeChange={setCustomRange}
                    align="left"
                />
                <select
                    className="reports-filter-select form-control"
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                >
                    <option value="date">Group by Date</option>
                    <option value="hour">Group by Hour</option>
                    <option value="offer">Group by Offer</option>
                    <option value="country">Group by Country</option>
                    <option value="device_type">Group by Device</option>
                    <option value="os">Group by OS</option>
                    <option value="browser">Group by Browser</option>
                </select>
                <select
                    className="reports-filter-select form-control"
                    value={selectedOfferId}
                    onChange={(e) => setSelectedOfferId(e.target.value)}
                >
                    <option value="">All Assigned Offers</option>
                    {assignedOffers.map((o) => (
                        <option key={o.id} value={o.id}>
                            #{o.public_offer_id} - {o.name}
                        </option>
                    ))}
                </select>
                <div className="reports-search">
                    <input
                        type="text"
                        placeholder="Search results..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') fetchReports(); }}
                    />
                </div>
                <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                    Reset
                </button>
            </div>

            {/* Total Summary Strip */}
            {summary && (
                <div className="pub-reports-summary-strip">
                    <div className="summary-col">
                        <span className="summary-label">Total Clicks</span>
                        <span className="summary-num">{summary.total_clicks?.toLocaleString()}</span>
                    </div>
                    <div className="summary-divider"></div>
                    <div className="summary-col">
                        <span className="summary-label">Conversions</span>
                        <span className="summary-num">{summary.total_conversions?.toLocaleString()}</span>
                    </div>
                    <div className="summary-divider"></div>
                    <div className="summary-col">
                        <span className="summary-label">Total Earnings</span>
                        <span className="summary-num highlight">${summary.total_payout?.toFixed(2)}</span>
                    </div>
                    <div className="summary-divider"></div>
                    <div className="summary-col">
                        <span className="summary-label">Average EPC</span>
                        <span className="summary-num">${summary.avg_epc?.toFixed(4)}</span>
                    </div>
                    <div className="summary-divider"></div>
                    <div className="summary-col">
                        <span className="summary-label">Average CR</span>
                        <span className="summary-num">{summary.avg_cr?.toFixed(2)}%</span>
                    </div>
                </div>
            )}

            {/* Reports Table */}
            <div className="pub-card-elevated">
                {loading ? (
                    <SkeletonTable rows={8} cols={groupBy === 'offer' ? 7 : 6} />
                ) : error ? (
                    <div className="pub-error-state">
                        <p>{error}</p>
                        <button type="button" className="pub-btn-primary" onClick={fetchReports}>Retry</button>
                    </div>
                ) : (
                    <div className="pub-table-responsive">
                        <table className="pub-table">
                            <thead>
                                <tr>
                                    <th>{getDimensionHeader()}</th>
                                    {groupBy === 'offer' && <th>Category</th>}
                                    <th className="sortable-th" onClick={() => handleSort('clicks')}>
                                        Clicks {sortField === 'clicks' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="sortable-th" onClick={() => handleSort('conversions')}>
                                        Conversions {sortField === 'conversions' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="sortable-th" onClick={() => handleSort('payout')}>
                                        Earnings ($) {sortField === 'payout' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="sortable-th" onClick={() => handleSort('epc')}>
                                        EPC ($) {sortField === 'epc' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="sortable-th" onClick={() => handleSort('cr')}>
                                        CR (%) {sortField === 'cr' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedReports.length === 0 ? (
                                    <tr>
                                        <td colSpan={groupBy === 'offer' ? 7 : 6} className="pub-empty-cell">
                                            No performance records found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    pagedReports.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="font-bold">
                                                {groupBy === 'offer' ? (
                                                    <div className="row-offer-cell">
                                                        <span className="row-offer-tag">#{row.public_id}</span>
                                                        <span>{row.label}</span>
                                                    </div>
                                                ) : (
                                                    row.label || row.id || 'Unknown'
                                                )}
                                            </td>
                                            {groupBy === 'offer' && <td><span className="row-cat-pill">{row.category}</span></td>}
                                            <td>{Number(row.clicks || 0).toLocaleString()}</td>
                                            <td>
                                                <span className="status-num-badge approved">
                                                    {Number(row.conversions || 0).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="payout-cell">${Number(row.payout || 0).toFixed(2)}</td>
                                            <td>${Number(row.epc || 0).toFixed(4)}</td>
                                            <td>{Number(row.cr || 0).toFixed(2)}%</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {sortedReports.length > 0 && summary && (
                                <tfoot>
                                    <tr className="pub-table-total-row">
                                        <td className="font-bold">Total Summary</td>
                                        {groupBy === 'offer' && <td>-</td>}
                                        <td className="font-bold">{summary.total_clicks?.toLocaleString()}</td>
                                        <td className="font-bold">{summary.total_conversions?.toLocaleString()}</td>
                                        <td className="font-bold payout-cell">${summary.total_payout?.toFixed(2)}</td>
                                        <td className="font-bold">${summary.avg_epc?.toFixed(4)}</td>
                                        <td className="font-bold">{summary.avg_cr?.toFixed(2)}%</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
                {!loading && !error && (
                    <EntityListPagination
                        currentPage={safePage}
                        totalPages={reportTotalPages}
                        total={sortedReports.length}
                        itemsPerPage={LIST_PAGE_SIZE}
                        onPageChange={setPage}
                    />
                )}
            </div>
        </div>
    );
}
