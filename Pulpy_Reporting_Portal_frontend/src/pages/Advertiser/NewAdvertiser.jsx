import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useCreateAdvertiser } from '../../hooks/queries/useAdvertisersQuery';
import { ADVERTISER_COUNTRY_OPTIONS } from '../../utils/countries';
import './Advertiser.css';

function NewAdvertiser() {
    const navigate = useNavigate();
    const toast = useToast();
    const createAdvertiserMutation = useCreateAdvertiser();
    const [loading, setLoading] = useState(false);

    const [showCustomCountry, setShowCustomCountry] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        company_name: '',
        country: 'US',
        website: '',
        notes: '',
        status: 'active'
    });

    const [errors, setErrors] = useState({});

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }

        if (!formData.name) {
            newErrors.name = 'Name is required';
        }

        if (!formData.company_name) {
            newErrors.company_name = 'Company name is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validate()) return;

        setLoading(true);

        try {
            await createAdvertiserMutation.mutateAsync(formData);
            toast.success('Advertiser created successfully!');
            navigate('/advertiser/manage');
        } catch (error) {
            console.error('Create advertiser error:', error);
            toast.error('Failed to create advertiser');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="advertiser-page">
            <div className="advertiser-header">
                <div className="advertiser-header-left" style={{ whiteSpace: 'nowrap', minWidth: '140px', maxWidth: '100%', justifyContent: 'center' }}>
                    <h1>New Advertiser</h1>
                    <p>Register a new advertiser</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="advertiser-form-container">
                    <div className="advertiser-form-header">
                        <h2>Advertiser Details</h2>
                        <p>Fill in the details below to create a new advertiser</p>
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
                                />
                                {errors.email && <div className="form-error">{errors.email}</div>}
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
                                />
                                {errors.name && <div className="form-error">{errors.name}</div>}
                            </div>
                        </div>

                        <div className="advertiser-form-row two-col">
                            <div className="form-group">
                                <label className="form-label required">Company Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="company_name"
                                    value={formData.company_name}
                                    onChange={handleChange}
                                    placeholder="Enter company name"
                                />
                                {errors.company_name && <div className="form-error">{errors.company_name}</div>}
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
                                                setFormData(prev => ({ ...prev, country: '' }));
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

                    {/* Additional Information */}
                    <div className="advertiser-form-section">
                        <h3 className="advertiser-form-section-title">Additional Information</h3>
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

                    {/* Actions */}
                    <div className="advertiser-form-actions">
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Advertiser'}
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

export default NewAdvertiser;
