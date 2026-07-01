import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
    useAdvertiserDetail,
    useUpdateAdvertiser,
} from '../../hooks/queries/useAdvertisersQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import { ADVERTISER_COUNTRY_OPTIONS } from '../../utils/countries';
import './Advertiser.css';

function EditAdvertiser() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const updateAdvertiserMutation = useUpdateAdvertiser();
    const [loading, setLoading] = useState(false);
    const [showCustomCountry, setShowCustomCountry] = useState(false);
    const { data: advertiser, isLoading: fetchLoading, error: advertiserError } = useAdvertiserDetail(id);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        company_name: '',
        country: 'US',
        website: '',
        notes: '',
        status: 'active'
    });

    useEffect(() => {
        if (advertiserError) {
            toast.error('Failed to load advertiser data');
            navigate('/advertiser/manage');
        }
    }, [advertiserError, navigate, toast]);

    useEffect(() => {
        if (!advertiser) return;
        setFormData({
            name: advertiser.name || '',
            email: advertiser.email || '',
            company_name: advertiser.company_name || '',
            country: advertiser.country || 'US',
            website: advertiser.website || '',
            notes: advertiser.notes || '',
            status: advertiser.status || 'active',
        });
        const isStandardCountry = ADVERTISER_COUNTRY_OPTIONS.some((c) => c.code === (advertiser.country || 'US'));
        if (!isStandardCountry && advertiser.country) {
            setShowCustomCountry(true);
        }
    }, [advertiser]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!formData.email || !formData.name || !formData.company_name) {
                toast.error('Email, Name, and Company Name are required');
                setLoading(false);
                return;
            }

            await updateAdvertiserMutation.mutateAsync({ id, data: formData });
            toast.success('Advertiser updated successfully!');
            navigate('/advertiser/manage');
        } catch (error) {
            console.error('Update advertiser error:', error);
            toast.error('Failed to update advertiser');
        } finally {
            setLoading(false);
        }
    };

    if (fetchLoading) {
        return (
            <div className="advertiser-page">
                <SkeletonDetail sections={3} />
            </div>
        );
    }

    return (
        <div className="advertiser-page">
            <div className="advertiser-header">
                <div className="advertiser-header-left">
                    <h1>Edit Advertiser</h1>
                    <p>Update advertiser information</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="advertiser-form-container">
                    <div className="advertiser-form-header">
                        <h2>Advertiser Details</h2>
                        <p>Update the advertiser information below</p>
                    </div>

                    {/* Account Information */}
                    <div className="advertiser-form-section">
                        <h3 className="advertiser-form-section-title">Account Information</h3>
                        <div className="advertiser-form-row two-col">
                            <div className="form-group">
                                <label className="form-label required">Email Id</label>
                                <input
                                    type="email"
                                    className="form-control"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="Enter email address"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label required">Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Enter advertiser name"
                                    required
                                />
                            </div>
                        </div>

                        <div className="advertiser-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Company Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="company_name"
                                    value={formData.company_name}
                                    onChange={handleChange}
                                    placeholder="Enter company name"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Country</label>
                                {!showCustomCountry ? (
                                    <select
                                        className="form-control"
                                        name="country"
                                        value={formData.country}
                                        onChange={(e) => {
                                            if (e.target.value === 'CUSTOM') {
                                                setShowCustomCountry(true);
                                                setFormData(prev => ({ ...prev, country: '' }));
                                            } else {
                                                setFormData(prev => ({ ...prev, country: e.target.value }));
                                            }
                                        }}
                                    >
                                        {ADVERTISER_COUNTRY_OPTIONS.map(country => (
                                            <option key={country.code} value={country.code}>{country.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="country"
                                            value={formData.country}
                                            onChange={handleChange}
                                            placeholder="Enter country"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setShowCustomCountry(false);
                                                setFormData(prev => ({ ...prev, country: 'US' }));
                                            }}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Contact Information */}
                    <div className="advertiser-form-section">
                        <h3 className="advertiser-form-section-title">Contact Information</h3>
                        <div className="advertiser-form-row">
                            <div className="form-group">
                                <label className="form-label">Website</label>
                                <input
                                    type="url"
                                    className="form-control"
                                    name="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    placeholder="https://example.com"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Notes</label>
                            <textarea
                                className="form-control"
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                placeholder="Enter any additional notes"
                                rows="3"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div className="advertiser-form-section">
                        <h3 className="advertiser-form-section-title">Status</h3>
                        <div className="advertiser-form-row">
                            <div className="form-group">
                                <label className="form-label">Account Status</label>
                                <select
                                    className="form-control"
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </div>
                        </div>
                    </div>



                    {/* Actions */}
                    <div className="advertiser-form-actions">
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Updating...' : 'Update Advertiser'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate('/advertiser/manage')}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default EditAdvertiser;
