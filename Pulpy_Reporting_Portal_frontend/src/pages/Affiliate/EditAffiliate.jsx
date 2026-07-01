import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
    usePublisherDetail,
    useUpdatePublisher,
} from '../../hooks/queries/usePublishersQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import './Affiliate.css';

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
    { code: 'AE', name: 'United Arab Emirates' }
];

function EditAffiliate() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { updateAffiliate } = useData();
    const toast = useToast();
    const updatePublisherMutation = useUpdatePublisher();
    const [loading, setLoading] = useState(false);
    const { data: publisher, isLoading: fetchLoading, error: publisherError } = usePublisherDetail(id);

    const [formData, setFormData] = useState({
        email: '',
        first_name: '',
        company_name: '',
        country: 'US',
        global_postback_url: '',
        status: 'active'
    });

    useEffect(() => {
        if (publisherError) {
            toast.error('Failed to load publisher data');
            navigate('/affiliate/manage');
        }
    }, [publisherError, navigate, toast]);

    useEffect(() => {
        if (!publisher) return;
        setFormData({
            email: publisher.email || '',
            first_name: publisher.first_name || '',
            company_name: publisher.company_name || '',
            country: publisher.country || 'US',
            global_postback_url: publisher.global_postback_url || '',
            status: publisher.status || 'active',
        });
    }, [publisher]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!formData.email || !formData.first_name) {
                toast.error('Email and First Name are required');
                setLoading(false);
                return;
            }

            await updatePublisherMutation.mutateAsync({ id, data: formData });
            updateAffiliate(id, formData);
            toast.success('Publisher updated successfully!');
            navigate('/affiliate/manage');
        } catch (error) {
            console.error('Update publisher error:', error);
            toast.error('Failed to update publisher');
        } finally {
            setLoading(false);
        }
    };

    if (fetchLoading) {
        return (
            <div className="affiliate-page">
                <SkeletonDetail sections={3} />
            </div>
        );
    }

    return (
        <div className="affiliate-page">
            <div className="affiliate-header">
                <div className="affiliate-header-left">
                    <h1>Edit Publisher</h1>
                    <p>Update publisher information</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="affiliate-form-container">
                    <div className="affiliate-form-header">
                        <h2>Publisher Details</h2>
                        <p>Update the publisher information below</p>
                    </div>

                    {/* Account Information */}
                    <div className="affiliate-form-section">
                        <h3 className="affiliate-form-section-title">Account Information</h3>
                        <div className="affiliate-form-row two-col">
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
                                <label className="form-label required">First Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="first_name"
                                    value={formData.first_name}
                                    onChange={handleChange}
                                    placeholder="Enter first name"
                                    required
                                />
                            </div>
                        </div>

                        <div className="affiliate-form-row two-col">
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
                                <select
                                    className="form-control"
                                    name="country"
                                    value={formData.country}
                                    onChange={handleChange}
                                >
                                    {countries.map(country => (
                                        <option key={country.code} value={country.code}>{country.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="affiliate-form-section">
                        <h3 className="affiliate-form-section-title">Status</h3>
                        <div className="affiliate-form-row">
                            <div className="form-group">
                                <label className="form-label">Account Status</label>
                                <select
                                    className="form-control"
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="active">Active</option>
                                    <option value="pending">Pending</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Postback */}
                    <div className="affiliate-form-section">
                        <h3 className="affiliate-form-section-title">Tracking</h3>
                        <div className="form-group">
                            <label className="form-label">Global Postback URL</label>
                            <input
                                type="url"
                                className="form-control"
                                name="global_postback_url"
                                value={formData.global_postback_url}
                                onChange={handleChange}
                                placeholder="https://example.com/postback?click_id={click_id}&payout={payout}"
                            />
                            <div className="form-helper">
                                URL to receive conversion notifications with macros
                            </div>
                        </div>
                    </div>



                    {/* Actions */}
                    <div className="affiliate-form-actions">
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Updating...' : 'Update Publisher'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate('/affiliate/manage')}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default EditAffiliate;
