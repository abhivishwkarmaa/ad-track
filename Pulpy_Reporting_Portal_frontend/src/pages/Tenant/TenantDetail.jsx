import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { tenantsAPI } from '../../services/api';
import './Tenant.css';

const EditIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

function TenantDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [loading, setLoading] = useState(true);
    const [tenant, setTenant] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(false);

    useEffect(() => {
        fetchTenant();
        fetchMetrics();
    }, [id, refreshKey]);

    const fetchTenant = async () => {
        try {
            setLoading(true);
            const response = await tenantsAPI.getTenant(id);
            if (response.success) {
                setTenant(response.data);
            } else {
                toast.error('Failed to load tenant');
                navigate('/tenant/manage');
            }
        } catch (error) {
            console.error('Fetch tenant error:', error);
            toast.error('Failed to load tenant');
            navigate('/tenant/manage');
        } finally {
            setLoading(false);
        }
    };

    const fetchMetrics = async () => {
        try {
            setMetricsLoading(true);
            const response = await tenantsAPI.getTenantMetrics(id);
            if (response.success) {
                setMetrics(response.data);
            }
        } catch (error) {
            console.error('Fetch metrics error:', error);
        } finally {
            setMetricsLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return new Intl.NumberFormat('en-US').format(num);
    };

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="tenant-container">
                <div className="loading-state">Loading tenant details...</div>
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

    return (
        <div className="tenant-container">
            <div className="tenant-detail">
                <div className="tenant-detail-header">
                    <div className="tenant-detail-info">
                        <h2>{tenant.name}</h2>
                        <div className="tenant-subdomain">{tenant.slug}.track-myads.com</div>
                    </div>
                    <div className="tenant-detail-actions">
                        <Link
                            to={`/tenant/edit/${tenant.id}`}
                            className="tenant-action-btn edit"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                            <EditIcon />
                            Edit Tenant
                        </Link>
                    </div>
                </div>

                <div className="tenant-detail-section">
                    <h3>Tenant Information</h3>
                    <div className="tenant-detail-grid">
                        <div className="tenant-detail-card">
                            <label>Status</label>
                            <div className="value">
                                <span className={`tenant-status ${tenant.status}`}>
                                    {tenant.status === 'active' ? 'Active' : 'Suspended'}
                                </span>
                            </div>
                        </div>
                        <div className="tenant-detail-card">
                            <label>Subdomain</label>
                            <div className="value" style={{ fontFamily: 'monospace', color: '#6366f1' }}>
                                {tenant.slug}.track-myads.com
                            </div>
                        </div>
                        <div className="tenant-detail-card">
                            <label>Created At</label>
                            <div className="value">{formatDate(tenant.created_at)}</div>
                        </div>
                        <div className="tenant-detail-card">
                            <label>Last Updated</label>
                            <div className="value">{formatDate(tenant.updated_at)}</div>
                        </div>
                    </div>
                </div>

                {metrics && (
                    <div className="tenant-detail-section">
                        <h3>Performance Metrics</h3>
                        {metricsLoading ? (
                            <div className="loading-state">Loading metrics...</div>
                        ) : (
                            <div className="tenant-metrics">
                                <div className="tenant-metric-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                                    <h4>Total Clicks</h4>
                                    <div className="value">{formatNumber(metrics.total_clicks || 0)}</div>
                                </div>
                                <div className="tenant-metric-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                                    <h4>Total Conversions</h4>
                                    <div className="value">{formatNumber(metrics.total_conversions || 0)}</div>
                                </div>
                                <div className="tenant-metric-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                                    <h4>Total Revenue</h4>
                                    <div className="value">{formatCurrency(metrics.total_revenue || 0)}</div>
                                </div>
                                <div className="tenant-metric-card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                                    <h4>Active Offers</h4>
                                    <div className="value">{formatNumber(metrics.active_offers || 0)}</div>
                                </div>
                                <div className="tenant-metric-card" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
                                    <h4>Active Publishers</h4>
                                    <div className="value">{formatNumber(metrics.active_publishers || 0)}</div>
                                </div>
                                <div className="tenant-metric-card" style={{ background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' }}>
                                    <h4>Redis Queue Depth</h4>
                                    <div className="value">{formatNumber(metrics.redis_queue_depth || 0)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
                    <Link
                        to="/tenant/manage"
                        style={{ color: '#6366f1', textDecoration: 'none', fontWeight: '500' }}
                    >
                        ← Back to Tenant List
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default TenantDetail;
