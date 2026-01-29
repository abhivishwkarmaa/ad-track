import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { publishersAPI, dashboardAPI } from '../../services/api';
import './Affiliate.css';

function AffiliateDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [fetchLoading, setFetchLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [offerStats, setOfferStats] = useState([]);

    const [publisher, setPublisher] = useState(null);

    useEffect(() => {
        const fetchPublisher = async () => {
            try {
                setFetchLoading(true);
                const response = await publishersAPI.getPublisher(id);
                if (response.success && response.data) {
                    setPublisher(response.data);
                } else {
                    toast.error('Publisher not found');
                    navigate('/affiliate/manage');
                }
            } catch (error) {
                console.error('Fetch publisher error:', error);
                toast.error('Failed to load publisher data');
                navigate('/affiliate/manage');
            } finally {
                setFetchLoading(false);
            }
        };

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

        fetchPublisher();
        fetchStats();
    }, [id, navigate, toast, refreshKey]);

    if (fetchLoading) {
        return (
            <div className="affiliate-page">
                <div className="loading-spinner" style={{ textAlign: 'center', padding: '50px' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #2196F3', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                    <p>Loading publisher...</p>
                </div>
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
                        onClick={() => navigate(`/affiliate/edit/${id}`)}
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

                {/* Offer Performance Stats */}
                <div className="affiliate-form-section">
                    <h3 className="affiliate-form-section-title">Offer Performance</h3>
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
                                        <th>Offer ID</th>
                                        <th>Offer Name</th>
                                        <th className="text-right">Clicks</th>
                                        <th className="text-right">Conversions</th>
                                        <th className="text-right">Approved Payout</th>
                                        <th className="text-right">Pending Payout</th>
                                        <th className="text-right">Total Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offerStats.map((stat, index) => (
                                        <tr key={index}>
                                            <td>{stat.offer.public_id || stat.offer.id}</td>
                                            <td>{stat.offer.name}</td>
                                            <td className="text-right">{stat.clicks.total}</td>
                                            <td className="text-right">{stat.conversions.total}</td>
                                            <td className="text-right">${stat.payout.approved?.toFixed(2)}</td>
                                            <td className="text-right">
                                                ${(stat.payout.total - stat.payout.approved)?.toFixed(2)}
                                            </td>
                                            <td className="text-right">${stat.revenue.total?.toFixed(2)}</td>
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

export default AffiliateDetail;
