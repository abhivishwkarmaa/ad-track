import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { dashboardAPI, offersAPI, publishersAPI } from '../../services/api';
import {
    formatDateIST,
    formatDateTimeIST,
    formatExactHourBucketIST,
    formatHourSlotIST,
    formatISTDateTimeNumeric,
} from '../../utils/dateTime';
import './Reports.css';

// Icons
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const FilterIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);

const LiveLogsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <path d="M10 9h1" />
    </svg>
);

const MinimizeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="18 15 12 9 6 15" />
    </svg>
);
const ApproveIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const AVAILABLE_DIMENSIONS = [
    { id: 'offer_id', label: 'Offer' },
    { id: 'publisher_id', label: 'Publisher' },
    { id: 'advertiser_id', label: 'Advertiser' },
    { id: 'date', label: 'Date' },
    { id: 'hour', label: 'Hour' },
    { id: 'ip', label: 'IP Address' },
    { id: 'country', label: 'Country' },
    { id: 'isp', label: 'ISP' },
    { id: 'city', label: 'City' },
    { id: 'region', label: 'Region' },
    { id: 'tid', label: 'TID' },
    { id: 'user_agent', label: 'User Agent' },
    { id: 'domain', label: 'Domain' },
    { id: 'device_type', label: 'Device Type' },
    { id: 'os', label: 'OS' },
    { id: 'browser', label: 'Browser' },
    { id: 'click_uuid', label: 'Click UUID' },
    { id: 'rcid', label: 'RCID' },
    { id: 'referer', label: 'Referer' },
    { id: 'x_forwarded_for', label: 'X-Forwarded-For' },
    { id: 'authorization_token', label: 'Auth Token' }
];

const AVAILABLE_METRICS = [
    { id: 'clicks', label: 'Clicks' },
    { id: 'unique_clicks', label: 'Unique Clicks' },
    { id: 'impressions', label: 'Impressions' },
    { id: 'conversions', label: 'Total Conversions' },
    { id: 'approved_conversions', label: 'Approved Conversions' },
    { id: 'pending_conversions', label: 'Pending Conversions' },
    { id: 'rejected_conversions', label: 'Rejected Conversions' },
    { id: 'revenue', label: 'Advertiser Payout' },
    { id: 'payout', label: 'Publisher Total Payout' },
    { id: 'pending_payout', label: 'Publisher Pending Payout' },
    { id: 'approved_payout', label: 'Publisher Approved Payout' },
    { id: 'profit', label: 'Profit' }
];

const DATE_PRESET_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'all', label: 'All Time' },
    { id: 'custom', label: 'Custom Range' },
];

const toYmd = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getPresetDateRange = (preset) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') return { from: toYmd(today), to: toYmd(today), allDates: false };
    if (preset === 'yesterday') {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        return { from: toYmd(y), to: toYmd(y), allDates: false };
    }
    if (preset === 'this_week') {
        const start = new Date(today);
        start.setDate(start.getDate() - start.getDay());
        return { from: toYmd(start), to: toYmd(today), allDates: false };
    }
    if (preset === 'this_month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: toYmd(start), to: toYmd(today), allDates: false };
    }
    if (preset === 'last_month') {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from: toYmd(start), to: toYmd(end), allDates: false };
    }
    if (preset === 'all') return { from: '', to: '', allDates: true };

    return { from: '', to: '', allDates: false };
};

function DetailedReports() {
    const toast = useToast();
    const navigate = useNavigate();
    const { refreshKey } = useRefresh();
    const [reports, setReports] = useState([]);
    const [offers, setOffers] = useState([]);
    const [publishers, setPublishers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [isAggregated, setIsAggregated] = useState(false);

    // Initial state from URL params
    const [pagination, setPagination] = useState({
        page: parseInt(searchParams.get('page') || '1'),
        limit: parseInt(searchParams.get('limit') || '50'),
        total: 0,
        totalPages: 1
    });

    const [datePreset, setDatePreset] = useState(
        searchParams.get('date_preset') ||
        (searchParams.get('all_dates') === 'true' ? 'all' : (searchParams.get('date_from') || searchParams.get('date_to') ? 'custom' : 'today'))
    );
    const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '');
    const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '');
    const [offerFilter, setOfferFilter] = useState(searchParams.get('offer_id') || 'all');
    const [publisherFilter, setPublisherFilter] = useState(searchParams.get('publisher_id') || 'all');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [sourceIpFilter, setSourceIpFilter] = useState(searchParams.get('sourceIp') || '');
    const [xffFilter, setXffFilter] = useState(searchParams.get('xff') || '');
    const [referrerFilter, setReferrerFilter] = useState(searchParams.get('referrer') || '');
    const [authTokenFilter, setAuthTokenFilter] = useState(searchParams.get('authorizationToken') || '');
    // Traffic type: 'all' | 'direct' | 'referred'
    const initTraffic = searchParams.get('noReferrer') === 'true' ? 'direct'
        : searchParams.get('hasReferrer') === 'true' ? 'referred' : 'all';
    const [trafficType, setTrafficType] = useState(initTraffic);

    // Checkbox selections
    // Checkbox selections
    const initialDims = searchParams.get('groupBy') ? searchParams.get('groupBy').split(',') : ['offer_id'];
    const initialMetrics = searchParams.get('metrics')
        ? searchParams.get('metrics').split(',')
        : ['clicks', 'conversions', 'pending_conversions', 'approved_conversions', 'rejected_conversions'];

    // If URL has no group params, default to Detailed View (empty group)
    const [selectedDims, setSelectedDims] = useState(initialDims);
    const [selectedMetrics, setSelectedMetrics] = useState(initialMetrics);

    // Pending selections (for UI logic before applying)
    const [pendingDims, setPendingDims] = useState(initialDims);
    const [pendingMetrics, setPendingMetrics] = useState(initialMetrics);

    const [showFilters, setShowFilters] = useState(true);
    const [exportMode, setExportMode] = useState('frontend'); // frontend | backend
    const [showExportMenu, setShowExportMenu] = useState(false);

    /** Bumps only on Apply so filters refetch without double-invoking fetchReports + useEffect. */
    const [applyFetchKey, setApplyFetchKey] = useState(0);

    /** Dedupe back-to-back identical fetches (React Strict Mode dev double-invoke + redundant effect runs). */
    const lastFetchDedupRef = useRef({ key: '', at: 0 });

    // Fetch filter options
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [offersRes, publishersRes] = await Promise.all([
                    offersAPI.getOffers({ limit: 100 }),
                    publishersAPI.getPublishers({ limit: 100 })
                ]);
                if (offersRes.success) setOffers(offersRes.data);
                if (publishersRes.success) setPublishers(publishersRes.data);
            } catch (err) {
                console.error('Error fetching filter data:', err);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (datePreset === 'custom') return;
        const range = getPresetDateRange(datePreset);
        setDateFrom(range.from);
        setDateTo(range.to);
    }, [datePreset]);

    const fetchReports = async (activeDims = selectedDims, activeMetrics = selectedMetrics, opts = {}) => {
        try {
            setLoading(true);
            setError(null);

            const page = opts.page != null ? Number(opts.page) : pagination.page;
            const limit = opts.limit != null ? Number(opts.limit) : pagination.limit;

            const params = {
                page,
                limit
            };

            const resolvedRange = datePreset === 'custom'
                ? { from: dateFrom, to: dateTo, allDates: false }
                : getPresetDateRange(datePreset);

            if (resolvedRange.allDates) {
                params.all_dates = 'true';
            } else {
                if (resolvedRange.from) params.date_from = resolvedRange.from;
                if (resolvedRange.to) params.date_to = resolvedRange.to;
            }
            if (offerFilter !== 'all') params.offer_id = offerFilter;
            if (publisherFilter !== 'all') params.publisher_id = publisherFilter;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (searchTerm) params.search = searchTerm;
            if (sourceIpFilter) params.sourceIp = sourceIpFilter;
            if (xffFilter) params.xff = xffFilter;
            if (referrerFilter) params.referrer = referrerFilter;
            if (authTokenFilter) params.authorizationToken = authTokenFilter;
            if (trafficType === 'direct') params.noReferrer = 'true';
            if (trafficType === 'referred') params.hasReferrer = 'true';
            // Text referrer filter only makes sense for referred traffic
            if (trafficType === 'referred' && referrerFilter) params.referrer = referrerFilter;
            else if (trafficType === 'all' && referrerFilter) params.referrer = referrerFilter;

            // Grouping Logic
            if (activeDims.length > 0) {
                params.groupBy = activeDims.join(',');
                // If specific metrics selected, backend needs to support limiting metrics or we filter on frontend?
                // For now, backend returns ALL metrics if aggregated. We can filter display on frontend.
            }
            // If No GroupBy, DetailedReports returns specific columns.

            // Sync URL
            const urlParams = new URLSearchParams();
            urlParams.set('page', params.page);
            urlParams.set('limit', params.limit);
            urlParams.set('date_preset', datePreset);
            if (params.all_dates === 'true') urlParams.set('all_dates', 'true');
            if (params.date_from) urlParams.set('date_from', params.date_from);
            if (params.date_to) urlParams.set('date_to', params.date_to);
            if (offerFilter !== 'all') urlParams.set('offer_id', offerFilter);
            if (publisherFilter !== 'all') urlParams.set('publisher_id', publisherFilter);
            if (statusFilter !== 'all') urlParams.set('status', statusFilter);
            if (searchTerm) urlParams.set('search', searchTerm);
            if (sourceIpFilter) urlParams.set('sourceIp', sourceIpFilter);
            if (xffFilter) urlParams.set('xff', xffFilter);
            if (referrerFilter) urlParams.set('referrer', referrerFilter);
            if (authTokenFilter) urlParams.set('authorizationToken', authTokenFilter);
            if (trafficType === 'direct') { urlParams.set('noReferrer', 'true'); urlParams.delete('hasReferrer'); }
            if (trafficType === 'referred') { urlParams.set('hasReferrer', 'true'); urlParams.delete('noReferrer'); }
            if (trafficType === 'all') { urlParams.delete('noReferrer'); urlParams.delete('hasReferrer'); }
            if (activeDims.length > 0) urlParams.set('groupBy', activeDims.join(','));
            if (activeMetrics.length > 0) urlParams.set('metrics', activeMetrics.join(','));
            const nextSearch = urlParams.toString();
            if (nextSearch !== searchParams.toString()) {
                setSearchParams(urlParams, { replace: true });
            }

            const response = await dashboardAPI.getDetailed(params);
            if (response.success) {
                setReports(response.data || []);
                setIsAggregated(response.isAggregated || false);
                if (response.pagination) {
                    const p = response.pagination;
                    setPagination((prev) => {
                        const total = Number(p.total) || 0;
                        const totalPages = Math.max(1, Number(p.totalPages) || 1);
                        let nextPage = prev.page;
                        if (nextPage > totalPages) nextPage = totalPages;
                        return {
                            ...prev,
                            page: nextPage,
                            limit: prev.limit,
                            total,
                            totalPages,
                        };
                    });
                }
            } else {
                setError('Failed to load reports');
            }
        } catch (err) {
            console.error('Reports fetch error:', err);
            setError(err.message || 'Failed to load reports');
        } finally {
            setLoading(false);
        }
    };

    const handleApproveClick = async (clickUuid) => {
        if (!window.confirm('Are you sure you want to manually approve this click? This will create/update a conversion and fire technical global postback.')) {
            return;
        }

        try {
            const response = await dashboardAPI.approveClick(clickUuid);
            if (response.success) {
                toast.success('Click approved successfully');
                fetchReports(); // Refresh data
            } else {
                toast.error(response.message || 'Failed to approve click');
            }
        } catch (err) {
            console.error('Approve error:', err);
            toast.error(err.message || 'Failed to approve click');
        }
    };

    // Load / pagination / global refresh / Apply — filters refetch via applyFetchKey (not a second fetchReports in handleApply).
    useEffect(() => {
        const key = `${pagination.page}|${pagination.limit}|${refreshKey}|${applyFetchKey}`;
        const now = Date.now();
        if (lastFetchDedupRef.current.key === key && now - lastFetchDedupRef.current.at < 600) {
            return;
        }
        lastFetchDedupRef.current = { key, at: now };
        fetchReports();
        // Intentionally only re-fetch when page, limit, global refreshKey, or applyFetchKey changes; dim/metric state is read inside fetchReports.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagination.page, pagination.limit, refreshKey, applyFetchKey]);

    const handleApply = () => {
        setPagination(prev => ({ ...prev, page: 1 }));
        setSelectedDims(pendingDims);
        setSelectedMetrics(pendingMetrics);
        setApplyFetchKey((k) => k + 1);
    };

    const handleDimChange = (id) => {
        setPendingDims(prev => {
            if (prev.includes(id)) return prev.filter(item => item !== id);
            return [...prev, id];
        });
    };

    const handleMetricChange = (id) => {
        setPendingMetrics(prev => {
            if (prev.includes(id)) return prev.filter(item => item !== id);
            return [...prev, id];
        });
    };

    const formatCurrency = (amount) => {
        if (amount === undefined || amount === null) return '-';
        return `$${parseFloat(amount).toFixed(2)}`;
    };

    /** Backend sends both: click_created_at (DB row time) and click_timestamp (tracker). Prefer created_at. */
    const getClickTimeRaw = (row) =>
        row?.click_created_at ?? row?.click_timestamp ?? null;

    const formatDate = (dateString, dim) => {
        // Hour can be 0 (midnight); don't treat as falsy.
        if (dim === 'hour') {
            if (dateString === undefined || dateString === null || dateString === '') return '-';
            return formatHourSlotIST(dateString) || String(dateString);
        }
        if (!dateString) return '-';
        // Aggregated by calendar day (IST): backend sends DATE only — show date, not fake midnight time
        if (dim === 'date') return formatDateIST(dateString) || String(dateString);
        // Click / conversion: exact IST as YYYY-MM-DD HH:mm:ss
        if (dim === 'datetime') return formatISTDateTimeNumeric(dateString) || String(dateString);
        try {
            return formatDateTimeIST(dateString) || String(dateString);
        } catch (e) {
            return String(dateString);
        }
    };

    /** Aggregated: with click_uuid, backend sends click_created_at (exact). Else date_group + hour_group bucket. */
    const formatAggregatedTimestampCell = (row) => {
        const exactClick = getClickTimeRaw(row);
        if (exactClick) {
            return formatISTDateTimeNumeric(exactClick) || '-';
        }
        const d = row?.date_group;
        const h = row?.hour_group;
        const hasD = d !== undefined && d !== null && d !== '';
        const hasH = h !== undefined && h !== null && h !== '';
        if (hasD && hasH) {
            const exact = formatExactHourBucketIST(d, h);
            if (exact) return exact;
            return `${formatDate(d, 'date')} · ${formatDate(h, 'hour')}`;
        }
        if (hasD) return formatDate(d, 'date');
        if (hasH) return formatDate(h, 'hour');
        return '-';
    };

    const getDetailTimestampCsv = (row) => {
        const clickT = formatDate(getClickTimeRaw(row), 'datetime') || '';
        const convT = row?.conversion_timestamp ? formatDate(row.conversion_timestamp, 'datetime') : '';
        if (clickT && convT) return `Click: ${clickT} | Conversion: ${convT}`;
        if (clickT) return clickT;
        if (convT) return `Conversion: ${convT}`;
        return '';
    };

    const getStatusBadge = (status) => {
        if (!status) return null;
        const normalizedStatus = String(status).toLowerCase();
        const statusClass = normalizedStatus.replace(/\s+/g, '_');
        let statusLabel = String(status).replace(/_/g, ' ');

        if (normalizedStatus === 'click_expired') statusLabel = 'Rejected (Click Expired)';
        if (normalizedStatus === 'rejected_cap') statusLabel = 'Rejected (Cap Hit)';

        return <span className={`report-status ${statusClass}`}>{statusLabel}</span>;
    };

    const handlePageChange = (newPage) => {
        setPagination(prev => ({ ...prev, page: newPage }));
    };

    const handleExport = async (modeOverride = null) => {
        const mode = modeOverride || exportMode;
        try {
            if (mode === 'frontend') {
                if (!reports || reports.length === 0) {
                    toast.error('No loaded data to export');
                    return;
                }

                toast.info('Preparing CSV from loaded data...');

                const csvEscape = (value) => {
                    if (value === null || value === undefined) return '';
                    const str = String(value);
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                const formatStatusForCsv = (status) => {
                    if (!status) return '';
                    const normalizedStatus = String(status).toLowerCase();
                    if (normalizedStatus === 'click_expired') return 'Rejected (Click Expired)';
                    if (normalizedStatus === 'rejected_cap') return 'Rejected (Cap Hit)';
                    return String(status).replace(/_/g, ' ');
                };

                const getCsvCellValue = (row, colId) => {
                    const val = row[colId];
                    if (colId === 'offer_id') {
                        return row.offer_name ? `${row.offer_id} - ${row.offer_name}` : (row.offer_id || '');
                    }
                    if (colId === 'publisher_id') {
                        return row.publisher_name || row.publisher_company
                            ? `${row.publisher_id} - ${row.publisher_name || row.publisher_company}`
                            : (row.publisher_id || '');
                    }
                    if (colId === 'conversion_status') return formatStatusForCsv(val);
                    if (['revenue', 'payout', 'profit', 'conversion_amount', 'conversion_payout', 'pending_payout', 'approved_payout'].includes(colId)) {
                        return val === null || val === undefined ? '' : Number(val).toFixed(2);
                    }
                    if (colId === 'timestamp_bucket') return formatAggregatedTimestampCell(row) || '';
                    if (colId === 'timestamp') return getDetailTimestampCsv(row);
                    if (colId === 'date_group') return formatDate(val, 'date') || '';
                    if (colId === 'hour_group') return formatDate(val, 'hour') || '';
                    if (colId === 'referrer' || colId === 'referer') return val ? String(val).trim() : 'Direct';
                    return val ?? '';
                };

                const headers = tableColumns.map((c) => c.label);
                const lines = [headers.map(csvEscape).join(',')];
                reports.forEach((row) => {
                    const line = tableColumns.map((col) => csvEscape(getCsvCellValue(row, col.id))).join(',');
                    lines.push(line);
                });

                const csvContent = lines.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `report-loaded-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast.success('Export downloaded!');
                return;
            }

            toast.info('Preparing full export from server...');
            const params = new URLSearchParams();
            const resolvedRange = datePreset === 'custom'
                ? { from: dateFrom, to: dateTo, allDates: false }
                : getPresetDateRange(datePreset);

            if (resolvedRange.allDates) {
                params.set('all_dates', 'true');
            } else {
                if (resolvedRange.from) params.set('date_from', resolvedRange.from);
                if (resolvedRange.to) params.set('date_to', resolvedRange.to);
            }
            if (offerFilter !== 'all') params.set('offer_id', offerFilter);
            if (publisherFilter !== 'all') params.set('publisher_id', publisherFilter);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (searchTerm) params.set('search', searchTerm);
            if (sourceIpFilter) params.set('sourceIp', sourceIpFilter);
            if (xffFilter) params.set('xff', xffFilter);
            if (referrerFilter) params.set('referrer', referrerFilter);
            if (authTokenFilter) params.set('authorizationToken', authTokenFilter);
            if (trafficType === 'direct') params.set('noReferrer', 'true');
            if (trafficType === 'referred') params.set('hasReferrer', 'true');
            if (selectedDims.length > 0) params.set('groupBy', selectedDims.join(','));
            if (selectedMetrics.length > 0) {
                params.set('metrics', selectedMetrics.join(','));
                params.set('columns', selectedMetrics.join(','));
            }

            const blob = await dashboardAPI.exportDetailedCSV(Object.fromEntries(params.entries()));
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report-full-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Full export downloaded!');
        } catch (error) {
            console.error('Export error:', error);
            toast.error(error.message || 'Failed to export data');
        }
    };

    // Dynamic Columns Helper
    const tableColumns = useMemo(() => {
        if (isAggregated) {
            const cols = [];
            let mergedDateHour = false;
            AVAILABLE_DIMENSIONS.forEach((dim) => {
                if (!selectedDims.includes(dim.id)) return;
                if (dim.id === 'date' && selectedDims.includes('hour')) {
                    cols.push({ id: 'timestamp_bucket', label: 'Date' });
                    mergedDateHour = true;
                    return;
                }
                if (dim.id === 'hour' && mergedDateHour) return;
                if (dim.id === 'date') {
                    cols.push({ id: 'date_group', label: 'Date' });
                    return;
                }
                if (dim.id === 'hour') {
                    cols.push({ id: 'hour_group', label: 'Date' });
                    return;
                }
                cols.push({ id: dim.id, label: dim.label });
            });

            AVAILABLE_METRICS.forEach((metric) => {
                if (selectedMetrics.includes(metric.id)) {
                    cols.push({ id: metric.id, label: metric.label });
                }
            });
            return cols;
        }
        // Detailed: one Date column — full datetime (click + conversion) from backend
        return [
            { id: 'click_uuid', label: 'Click UUID' },
            { id: 'offer_id', label: 'Offer' },
            { id: 'publisher_company', label: 'Publisher' },
            { id: 'ip', label: 'IP' },
            { id: 'referer', label: 'Referer' },
            { id: 'x_forwarded_for', label: 'X-Forwarded-For' },
            { id: 'country', label: 'Country' },
            { id: 'device_type', label: 'Device' },
            { id: 'timestamp', label: 'Date' },
            { id: 'conversion_status', label: 'Status' },
            { id: 'conversion_amount', label: 'Revenue' },
            { id: 'conversion_payout', label: 'Payout' },
            { id: 'actions', label: 'Actions' },
        ];
    }, [isAggregated, selectedDims, selectedMetrics]);

    const isInitialLoading = loading && reports.length === 0;
    const isRefreshing = loading && reports.length > 0;

    return (
        <div className="reports-page">
            <div className="reports-header">
                <div className="reports-header-left">
                    <h1>Detailed Reports</h1>
                    <p>Customizable performance reports</p>
                </div>
                <div className="reports-header-actions">
                    <button className="btn btn-outline" onClick={() => navigate('/live-logs')}>
                        <LiveLogsIcon /> Live Logs
                    </button>
                    <button className="btn btn-outline" onClick={() => setShowFilters(!showFilters)}>
                        <FilterIcon /> {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>
                    <div className="reports-export-dropdown">
                        <button
                            className="btn btn-primary"
                            onClick={() => handleExport()}
                            type="button"
                            title={`Export using ${exportMode === 'frontend' ? 'Fast Export (Loaded)' : 'Full Export (Server)'}`}
                        >
                            <DownloadIcon /> Export CSV
                        </button>
                        <button
                            className="btn btn-outline reports-export-toggle"
                            type="button"
                            onClick={() => setShowExportMenu(prev => !prev)}
                            title="Choose export mode"
                        >
                            <ChevronDownIcon />
                        </button>
                        {showExportMenu && (
                            <div className="reports-export-menu">
                                <button
                                    type="button"
                                    className={`reports-export-menu-item ${exportMode === 'frontend' ? 'active' : ''}`}
                                    onClick={() => {
                                        setExportMode('frontend');
                                        setShowExportMenu(false);
                                    }}
                                >
                                    Fast Export (Loaded)
                                </button>
                                <button
                                    type="button"
                                    className={`reports-export-menu-item ${exportMode === 'backend' ? 'active' : ''}`}
                                    onClick={() => {
                                        setExportMode('backend');
                                        setShowExportMenu(false);
                                    }}
                                >
                                    Full Export (Server)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showFilters && (
                <div className="reports-options-panel">
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid var(--border-light)' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Report Configuration</h3>
                        <button
                            className="btn-icon"
                            onClick={() => setShowFilters(false)}
                            title="Minimize Filter Panel"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            <MinimizeIcon />
                        </button>
                    </div>
                    <div className="filters-row">
                        <div className="filter-group">
                            <label>Date Preset</label>
                            <select className="form-control" value={datePreset} onChange={e => setDatePreset(e.target.value)}>
                                {DATE_PRESET_OPTIONS.map(option => (
                                    <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Date Range</label>
                            <div className="date-inputs">
                                <input
                                    type="date"
                                    className="form-control"
                                    value={dateFrom}
                                    onChange={e => setDateFrom(e.target.value)}
                                    disabled={datePreset !== 'custom'}
                                />
                                <span className="separator">to</span>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={dateTo}
                                    onChange={e => setDateTo(e.target.value)}
                                    disabled={datePreset !== 'custom'}
                                />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Offer</label>
                            <select className="form-control" value={offerFilter} onChange={e => setOfferFilter(e.target.value)}>
                                <option value="all">All Offers</option>
                                {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Publisher</label>
                            <select className="form-control" value={publisherFilter} onChange={e => setPublisherFilter(e.target.value)}>
                                <option value="all">All Publishers</option>
                                {publishers.map(p => <option key={p.id} value={p.id}>{p.company_name} ({p.email})</option>)}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Status</label>
                            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="all">All Status</option>
                                <option value="approved">Approved</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                                <option value="rejected_cap">Rejected (Cap Hit)</option>
                                <option value="click_expired">Rejected (Click Expired)</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Search</label>
                            <input type="text" className="form-control" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="filter-group">
                            <label>Source IP</label>
                            <input type="text" className="form-control" placeholder="e.g. 103.45.67.89" value={sourceIpFilter} onChange={e => setSourceIpFilter(e.target.value)} />
                        </div>
                        <div className="filter-group">
                            <label>X-Forwarded-For</label>
                            <input type="text" className="form-control" placeholder="Partial match..." value={xffFilter} onChange={e => setXffFilter(e.target.value)} />
                        </div>
                        <div className="filter-group">
                            <label>Referrer</label>
                            <select
                                className="form-control"
                                value={trafficType}
                                onChange={e => { setTrafficType(e.target.value); if (e.target.value === 'direct') setReferrerFilter(''); }}
                            >
                                <option value="all">All</option>
                                <option value="direct">Empty Referral</option>
                                <option value="referred">Non-Empty Referral</option>
                            </select>
                            {/* Text search only available when showing referred traffic */}
                            {trafficType !== 'direct' && (
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search referrer URL..."
                                    value={referrerFilter}
                                    onChange={e => setReferrerFilter(e.target.value)}
                                    style={{ marginTop: '6px' }}
                                />
                            )}
                        </div>
                        <div className="filter-group">
                            <label>Auth Token</label>
                            <input type="text" className="form-control" placeholder="Exact match..." value={authTokenFilter} onChange={e => setAuthTokenFilter(e.target.value)} />
                        </div>
                    </div>

                    <div className="columns-grid-container">
                        <div className="columns-section">
                            <h4>Dimensions (Group By)</h4>
                            <div className="checkbox-grid">
                                {AVAILABLE_DIMENSIONS.map(dim => (
                                    <label key={dim.id} className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={pendingDims.includes(dim.id)}
                                            onChange={() => handleDimChange(dim.id)}
                                        />
                                        {dim.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="columns-section">
                            <h4>Metrics</h4>
                            <div className="checkbox-grid">
                                {AVAILABLE_METRICS.map(metric => (
                                    <label key={metric.id} className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={pendingMetrics.includes(metric.id)}
                                            onChange={() => handleMetricChange(metric.id)}
                                        />
                                        {metric.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="filter-actions">
                        <button className="btn btn-secondary" onClick={() => {
                            setPendingDims(['offer_id']);
                            setPendingMetrics(['clicks', 'conversions', 'pending_conversions', 'approved_conversions', 'rejected_conversions']);
                            setSelectedDims(['offer_id']);
                            setSelectedMetrics(['clicks', 'conversions', 'pending_conversions', 'approved_conversions', 'rejected_conversions']);
                        }}>Reset</button>
                        <button className="btn btn-primary" onClick={handleApply} style={{ minWidth: '150px' }}>Apply Report</button>
                    </div>
                </div>
            )}

            {isRefreshing && (
                <div className="reports-refresh-indicator" role="status" aria-live="polite">
                    <span className="reports-refresh-dot" />
                    Updating report data...
                </div>
            )}

            <div className="reports-table-container">
                <div className={`reports-progress-bar ${loading ? 'active' : ''}`} aria-hidden="true" />
                <table className="reports-table reports-table-desktop">
                    <thead>
                        <tr>
                            {tableColumns.map(col => (
                                <th key={col.id}>{col.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {reports.length === 0 ? (
                            <tr>
                                <td colSpan={tableColumns.length} style={{ textAlign: 'center', padding: '40px' }}>
                                    {isInitialLoading ? 'Loading reports...' : 'No data found'}
                                </td>
                            </tr>
                        ) : (
                            reports.map((row, idx) => (
                                <tr key={idx}>
                                    {tableColumns.map(col => {
                                        const val = row[col.id];
                                        if (col.id === 'referrer' || col.id === 'referer') {
                                            const rawVal = val ? String(val).trim() : '';
                                            if (!rawVal) return <td key={col.id}><span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: 'var(--bg-secondary, #f0f0f0)', color: 'var(--text-secondary, #888)', fontStyle: 'italic' }}>Direct</span></td>;
                                            return <td key={col.id} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val}>{val}</td>;
                                        }
                                        if (['revenue', 'payout', 'profit', 'conversion_amount', 'conversion_payout', 'pending_payout', 'approved_payout'].includes(col.id)) return <td key={col.id}>{formatCurrency(val)}</td>;
                                        if (col.id === 'offer_id') return <td key={col.id}>{row.offer_name ? `${row.offer_id} - ${row.offer_name}` : row.offer_id}</td>;
                                        if (col.id === 'publisher_id') return <td key={col.id}>{row.publisher_name || row.publisher_company ? `${row.publisher_id} - ${row.publisher_name || row.publisher_company}` : row.publisher_id}</td>;
                                        if (col.id === 'conversion_status') return <td key={col.id}>{getStatusBadge(val)}</td>;
                                        if (col.id === 'timestamp') {
                                            const clickT = formatDate(getClickTimeRaw(row), 'datetime');
                                            const convT = row.conversion_timestamp
                                                ? formatDate(row.conversion_timestamp, 'datetime')
                                                : null;
                                            return (
                                                <td key={col.id}>
                                                    <div>{clickT || '-'}</div>
                                                    {convT && (
                                                        <div
                                                            style={{
                                                                fontSize: '12px',
                                                                opacity: 0.9,
                                                                marginTop: '4px',
                                                            }}
                                                        >
                                                            Conversion: {convT}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        }
                                        if (col.id === 'timestamp_bucket') {
                                            return <td key={col.id}>{formatAggregatedTimestampCell(row)}</td>;
                                        }
                                        if (col.id === 'date_group') return <td key={col.id}>{formatDate(val, 'date')}</td>;
                                        if (col.id === 'hour_group') return <td key={col.id}>{formatDate(val, 'hour')}</td>;
                                        if (col.id === 'actions') {
                                            const status = (row.conversion_status || '').toLowerCase();
                                            const canApprove = !status || status === 'pending' || status === 'click_expired' || status === 'rejected' || status === 'rejected_cap';
                                            return (
                                                <td key={col.id}>
                                                    {canApprove && (
                                                        <button 
                                                            className="btn btn-primary" 
                                                            onClick={() => handleApproveClick(row.click_uuid)}
                                                            title="Manually Approve"
                                                            style={{ 
                                                                padding: '4px 8px', 
                                                                fontSize: '11px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                width: 'fit-content'
                                                            }}
                                                        >
                                                            <ApproveIcon /> Approve
                                                        </button>
                                                    )}
                                                </td>
                                            );
                                        }
                                        return <td key={col.id}>{val !== undefined && val !== null ? val : '-'}</td>;
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                <div className="reports-mobile-list">
                    {reports.length === 0 ? (
                        <div className="reports-mobile-empty">{isInitialLoading ? 'Loading reports...' : 'No data found'}</div>
                    ) : (
                        reports.map((row, idx) => (
                            <div key={`mobile-row-${idx}`} className="reports-mobile-card">
                                {tableColumns.map((col) => {
                                    const val = row[col.id];
                                    let displayValue = val !== undefined && val !== null ? val : '-';

                                    if (col.id === 'offer_id') {
                                        displayValue = row.offer_name ? `${row.offer_id} - ${row.offer_name}` : row.offer_id;
                                    } else if (col.id === 'publisher_id') {
                                        displayValue = row.publisher_name || row.publisher_company
                                            ? `${row.publisher_id} - ${row.publisher_name || row.publisher_company}`
                                            : row.publisher_id;
                                    } else if (col.id === 'timestamp') {
                                        displayValue = getDetailTimestampCsv(row) || '-';
                                    } else if (col.id === 'timestamp_bucket') {
                                        displayValue = formatAggregatedTimestampCell(row);
                                    } else if (col.id === 'date_group') {
                                        displayValue = formatDate(val, 'date');
                                    } else if (col.id === 'hour_group') {
                                        displayValue = formatDate(val, 'hour');
                                    } else if (['revenue', 'payout', 'profit', 'conversion_amount', 'conversion_payout', 'pending_payout', 'approved_payout'].includes(col.id)) {
                                        displayValue = formatCurrency(val);
                                    }

                                    return (
                                        <div className="reports-mobile-item" key={`${col.id}-mobile-val-${idx}`}>
                                            <span className="reports-mobile-label">{col.label}</span>
                                            <span className="reports-mobile-value">
                                                {col.id === 'conversion_status' ? getStatusBadge(val) : 
                                                 col.id === 'actions' ? (
                                                     (() => {
                                                         const status = (row.conversion_status || '').toLowerCase();
                                                         const canApprove = !status || status === 'pending' || status === 'click_expired' || status === 'rejected' || status === 'rejected_cap';
                                                         return canApprove && (
                                                            <button 
                                                                className="btn btn-primary" 
                                                                onClick={() => handleApproveClick(row.click_uuid)}
                                                                style={{ 
                                                                    padding: '4px 10px', 
                                                                    fontSize: '11px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    marginTop: '4px'
                                                                }}
                                                            >
                                                                <ApproveIcon /> Approve
                                                            </button>
                                                         );
                                                     })()
                                                 ) : displayValue}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>
            {/* Pagination */}
            {
                pagination.totalPages > 1 && (
                    <div className="reports-pagination">
                        <button
                            className="btn btn-outline"
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page === 1}
                        >
                            Previous
                        </button>
                        <span className="pagination-info">
                            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                        </span>
                        <button
                            className="btn btn-outline"
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                        >
                            Next
                        </button>
                    </div>
                )
            }
        </div>
    );
}

export default DetailedReports;
