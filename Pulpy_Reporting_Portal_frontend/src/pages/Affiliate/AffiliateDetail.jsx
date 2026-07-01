import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { dashboardAPI } from '../../services/api';
import { usePublisherDetail } from '../../hooks/queries/usePublishersQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import './Affiliate.css';

function AffiliateDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [statsLoading, setStatsLoading] = useState(true);
    const [offerStats, setOfferStats] = useState([]);
    const { data: publisher, isLoading: fetchLoading } = usePublisherDetail(id);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setStatsLoading(true);
                const response = await dashboardAPI.getPublisherConversions({ publisher_id: id });
                if (response.success && response.data && response.data.stats) {
                    setOfferStats(response.data.stats);
                }
            } catch (error) {
                console.error('Fetch stats error:', error);
            } finally {
                setStatsLoading(false);
            }
        };

        if (id) fetchStats();
    }, [id, refreshKey]);

    if (fetchLoading) {
        return (
            <div className="affiliate-page">
                <SkeletonDetail sections={3} />
            </div>
        );
    }

    if (!publisher) return null;

    return (
        <div className="affiliate-page">
            <div className="affiliate-header">
                <div className="affiliate-header-left">
                    <h1>Publisher Details</h1>
                    <p>View publisher information and performance</p>
                </div>
                <div className="affiliate-header-actions">
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/affiliate/edit/${publisher.public_publisher_id || id}`)}
                    >
                        Edit Publisher
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate('/affiliate/manage')}
                    >
                        Back to List
                    </button>
                </div>
            </div>

            <div className="affiliate-form-container">
                <div className="affiliate-form-header">
                    <h2>Publisher Information</h2>
                </div>

                {/* Account Information */}
                <div className="affiliate-form-section">
                    <h3 className="affiliate-form-section-title">Account Information</h3>
                    <div className="affiliate-form-row two-col">
                        <div className="form-group">
                            <label className="form-label">Email Id</label>
                            <div className="form-control-static">{publisher.email}</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">First Name</label>
                            <div className="form-control-static">{publisher.first_name}</div>
                        </div>
                    </div>

                    <div className="affiliate-form-row two-col">
                        <div className="form-group">
                            <label className="form-label">Company Name</label>
                            <div className="form-control-static">{publisher.company_name || '-'}</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Country</label>
                            <div className="form-control-static">{publisher.country || 'US'}</div>
                        </div>
                    </div>
                </div>

                {/* Status */}
                <div className="affiliate-form-section">
                    <h3 className="affiliate-form-section-title">Status</h3>
                    <div className="affiliate-form-row">
                        <div className="form-group">
                            <label className="form-label">Account Status</label>
                            <div className="form-control-static">
                                <span className={`affiliate-status ${publisher.status?.toLowerCase()}`}>
                                    {publisher.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Postback */}
                <div className="affiliate-form-section">
                    <h3 className="affiliate-form-section-title">Tracking</h3>
                    <div className="form-group">
                        <label className="form-label">Global Postback URL</label>
                        <div className="form-control-static" style={{ wordBreak: 'break-all' }}>
                            {publisher.global_postback_url || '-'}
                        </div>
                        <div className="form-helper">
                            URL to receive conversion notifications
                        </div>
                    </div>
                </div>

                {/* Publisher Performance Stats */}
                <div className="affiliate-form-section">
                    <h3 className="affiliate-form-section-title">Publisher Performance</h3>
                    {statsLoading ? (
                        <div className="loading-spinner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', width: '100%' }}>
                            <div style={{ width: '30px', height: '30px', border: '3px solid #f3f3f3', borderTop: '3px solid #2196F3', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '10px' }}></div>
                            <p style={{ margin: 0 }}>Loading stats...</p>
                        </div>
                    ) : offerStats.length > 0 ? (
                        <div className="table-responsive">
                            <table className="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>Offer</th>
                                        <th className="text-right">Clicks</th>
                                        <th className="text-right">Total Conv</th>
                                        <th className="text-right">Approved</th>
                                        <th className="text-right">Pending</th>
                                        <th className="text-right">Pending Amt</th>
                                        <th className="text-right">Pub Rev</th>
                                        <th className="text-right">Revenue</th>
                                        <th className="text-right">Profit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offerStats.map((stat, index) => (
                                        <tr key={index}>
                                            <td>
                                                <div className="offer-name-cell" title={stat.offer.name}>
                                                    <span className="id-badge">#{stat.offer.public_id || stat.offer.id}</span> {stat.offer.name}
                                                </div>
                                            </td>
                                            <td className="text-right">{formatNumber(stat.clicks.total)}</td>
                                            <td className="text-right">{formatNumber(stat.conversions.total)}</td>
                                            <td className="text-right" style={{ color: 'green', fontWeight: 500 }}>
                                                {formatNumber(stat.conversions.approved)}
                                            </td>
                                            <td className="text-right" style={{ color: '#ffb800', fontWeight: 500 }}>
                                                {formatNumber(stat.conversions.pending)}
                                            </td>
                                            <td className="text-right" style={{ color: '#ffb800' }}>
                                                {formatCurrency(stat.payout.pending)}
                                            </td>
                                            <td className="text-right" style={{ color: 'green' }}>
                                                {formatCurrency(stat.payout.approved)}
                                            </td>
                                            <td className="text-right">{formatCurrency(stat.revenue.total)}</td>
                                            <td className="text-right" style={{ color: stat.profit.total >= 0 ? 'green' : 'red', fontWeight: 500 }}>
                                                {formatCurrency(stat.profit.total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="no-data-message" style={{ textAlign: 'center', padding: '20px', color: '#6c757d' }}>
                            No performance data available for this publisher.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper functions
const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return new Intl.NumberFormat('en-US').format(num);
};

const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
};

export default AffiliateDetail;
