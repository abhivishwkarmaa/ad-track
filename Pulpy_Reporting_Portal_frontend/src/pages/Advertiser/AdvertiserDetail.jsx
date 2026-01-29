import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { advertisersAPI, dashboardAPI } from '../../services/api';
import './Advertiser.css';

function AdvertiserDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [fetchLoading, setFetchLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [offerStats, setOfferStats] = useState([]);

    const [advertiser, setAdvertiser] = useState(null);
    const [showCustomCountry, setShowCustomCountry] = useState(false);

    const countries = [
        { code: 'US', name: 'United States' },
        { code: 'UK', name: 'United Kingdom' },
        { code: 'CA', name: 'Canada' },
        { code: 'DE', name: 'Germany' },
        { code: 'FR', name: 'France' },
        { code: 'IN', name: 'India' },
        { code: 'AU', name: 'Australia' },
        { code: 'JP', name: 'Japan' },
        { code: 'BR', name: 'Brazil' },
        { code: 'AE', name: 'United Arab Emirates' },
        { code: 'CN', name: 'China' },
        { code: 'RU', name: 'Russia' },
        { code: 'IT', name: 'Italy' },
        { code: 'ES', name: 'Spain' },
        { code: 'NL', name: 'Netherlands' },
        { code: 'SE', name: 'Sweden' },
        { code: 'CH', name: 'Switzerland' },
        { code: 'SG', name: 'Singapore' },
        { code: 'MX', name: 'Mexico' },
        { code: 'ZA', name: 'South Africa' },
        { code: 'CUSTOM', name: 'Custom' }
    ];

    useEffect(() => {
        const fetchAdvertiser = async () => {
            try {
                setFetchLoading(true);
                const response = await advertisersAPI.getAdvertiser(id);
                if (response.success && response.data) {
                    setAdvertiser(response.data);

                    // Check if country is custom
                    const isStandardCountry = countries.some(c => c.code === (response.data.country || 'US'));
                    if (!isStandardCountry && response.data.country) {
                        setShowCustomCountry(true);
                    }
                } else {
                    toast.error('Advertiser not found');
                    navigate('/advertiser/manage');
                }
            } catch (error) {
                console.error('Fetch advertiser error:', error);
                toast.error('Failed to load advertiser data');
                navigate('/advertiser/manage');
            } finally {
                setFetchLoading(false);
            }
        };

        const fetchStats = async () => {
            try {
                setStatsLoading(true);
                // Fetch detailed report grouped by offer for this advertiser
                const response = await dashboardAPI.getDetailed({
                    advertiser_id: id,
                    groupBy: 'offer_id'
                });
                if (response.success && response.data) {
                    setOfferStats(response.data);
                }
            } catch (error) {
                console.error('Fetch stats error:', error);
            } finally {
                setStatsLoading(false);
            }
        };

        fetchAdvertiser();
        fetchStats();
    }, [id, navigate, toast, refreshKey]);

    const getCountryName = (code) => {
        const country = countries.find(c => c.code === code);
        return country ? country.name : code;
    };

    if (fetchLoading) {
        return (
            <div className="advertiser-page">
                <div className="loading-spinner" style={{ textAlign: 'center', padding: '50px' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #2196F3', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                    <p>Loading advertiser...</p>
                </div>
            </div>
        );
    }

    if (!advertiser) return null;

    return (
        <div className="advertiser-page">
            <div className="advertiser-header">
                <div className="advertiser-header-left">
                    <h1>Advertiser Details</h1>
                    <p>View advertiser information and performance</p>
                </div>
                <div className="advertiser-header-actions">
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/advertiser/edit/${id}`)}
                    >
                        Edit Advertiser
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate('/advertiser/manage')}
                    >
                        Back to List
                    </button>
                </div>
            </div>

            <div className="advertiser-form-container">
                <div className="advertiser-form-header">
                    <h2>Advertiser Information</h2>
                </div>

                {/* Account Information */}
                <div className="advertiser-form-section">
                    <h3 className="advertiser-form-section-title">Account Information</h3>
                    <div className="advertiser-form-row two-col">
                        <div className="form-group">
                            <label className="form-label">Email Id</label>
                            <div className="form-control-static">{advertiser.email}</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Name</label>
                            <div className="form-control-static">{advertiser.name}</div>
                        </div>
                    </div>

                    <div className="advertiser-form-row two-col">
                        <div className="form-group">
                            <label className="form-label">Company Name</label>
                            <div className="form-control-static">{advertiser.company_name || '-'}</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Country</label>
                            <div className="form-control-static">{getCountryName(advertiser.country) || 'United States'}</div>
                        </div>
                    </div>
                </div>

                {/* Contact Information */}
                <div className="advertiser-form-section">
                    <h3 className="advertiser-form-section-title">Contact Information</h3>
                    <div className="advertiser-form-row">
                        <div className="form-group">
                            <label className="form-label">Website</label>
                            <div className="form-control-static">
                                {advertiser.website ? (
                                    <a href={advertiser.website} target="_blank" rel="noopener noreferrer">{advertiser.website}</a>
                                ) : '-'}
                            </div>
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Notes</label>
                        <div className="form-control-static note-text">{advertiser.notes || '-'}</div>
                    </div>
                </div>

                {/* Status */}
                <div className="advertiser-form-section">
                    <h3 className="advertiser-form-section-title">Status</h3>
                    <div className="advertiser-form-row">
                        <div className="form-group">
                            <label className="form-label">Account Status</label>
                            <div className="form-control-static">
                                <span className={`status-badge status-${advertiser.status?.toLowerCase()}`}>
                                    {advertiser.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Offer Performance Stats */}
                <div className="advertiser-form-section">
                    <h3 className="advertiser-form-section-title">Offer Performance</h3>
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
                                        <th className="text-right">Advertiser Pay</th>
                                        <th className="text-right">Affiliate Pay</th>
                                        <th className="text-right">Profit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offerStats.map((stat, index) => (
                                        <tr key={index}>
                                            <td>{stat.offer_id}</td>
                                            <td>{stat.offer_name}</td>
                                            <td className="text-right">{stat.clicks}</td>
                                            <td className="text-right">{stat.conversions}</td>
                                            <td className="text-right">${Number(stat.revenue || 0).toFixed(2)}</td>
                                            <td className="text-right">${Number(stat.payout || 0).toFixed(2)}</td>
                                            <td className="text-right">${Number(stat.profit || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="no-data-message" style={{ textAlign: 'center', padding: '20px', color: '#6c757d' }}>
                            No performance data available for this advertiser.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AdvertiserDetail;
