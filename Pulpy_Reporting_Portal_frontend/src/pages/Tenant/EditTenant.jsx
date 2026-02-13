import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { tenantsAPI, adminSubscriptionAPI } from '../../services/api';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import './Tenant.css';

function EditTenant() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        status: 'TRIAL',
    });
    const [subscriptionForm, setSubscriptionForm] = useState({
        start_date: '',
        end_date: '',
        plan: 'basic',
        billing_email: '',
    });
    const [subscriptionSaving, setSubscriptionSaving] = useState(false);

    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetchTenant();
        fetchSubscriptionStatus();
    }, [id, refreshKey]);

    const fetchTenant = async () => {
        try {
            setLoading(true);
            const response = await tenantsAPI.getTenant(id);
            if (response.success) {
                setFormData({
                    name: response.data.name || '',
                    status: (response.data.status || 'TRIAL').toUpperCase(),
                });
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

    const toInputDateTime = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().slice(0, 16);
    };

    const fetchSubscriptionStatus = async () => {
        try {
            const response = await adminSubscriptionAPI.getTenantStatus(id);
            if (response.success) {
                setSubscriptionForm({
                    start_date: toInputDateTime(response.data.tenant.subscription_start_at),
                    end_date: toInputDateTime(response.data.tenant.subscription_end_at),
                    plan: response.data.tenant.subscription_plan || 'basic',
                    billing_email: response.data.tenant.billing_email || '',
                });
            }
        } catch (error) {
            console.error('Fetch subscription status error:', error);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubscriptionChange = (e) => {
        const { name, value } = e.target;
        setSubscriptionForm((prev) => ({ ...prev, [name]: value }));
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.name || formData.name.trim() === '') {
            newErrors.name = 'Tenant name is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validate()) return;

        setSaving(true);

        try {
            const response = await tenantsAPI.updateTenant(id, {
                name: formData.name.trim(),
                status: formData.status,
            });

            if (response.success) {
                toast.success('Tenant updated successfully!');
                navigate('/tenant/manage');
            } else {
                toast.error(response.message || 'Failed to update tenant');
            }
        } catch (error) {
            console.error('Update tenant error:', error);
            toast.error(error.message || 'Failed to update tenant');
        } finally {
            setSaving(false);
        }
    };

    const handleSubscriptionSave = async () => {
        if (!subscriptionForm.end_date) {
            toast.error('Subscription end date is required');
            return;
        }

        setSubscriptionSaving(true);
        try {
            const payload = {
                end_date: new Date(subscriptionForm.end_date).toISOString(),
                plan: subscriptionForm.plan || 'basic',
                billing_email: subscriptionForm.billing_email || undefined,
            };

            if (subscriptionForm.start_date) {
                payload.start_date = new Date(subscriptionForm.start_date).toISOString();
            }

            const response = await adminSubscriptionAPI.activateSubscription(id, payload);
            if (response.success) {
                toast.success('Subscription updated successfully!');
            } else {
                toast.error(response.message || 'Failed to update subscription');
            }
        } catch (error) {
            console.error('Update subscription error:', error);
            toast.error(error.message || 'Failed to update subscription');
        } finally {
            setSubscriptionSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="tenant-container">
                <SkeletonDetail sections={3} />
            </div>
        );
    }

    return (
        <div className="tenant-container">
            <div className="tenant-form">
                <h2>Edit Tenant</h2>
                <form onSubmit={handleSubmit}>
                    <div className="tenant-form-group">
                        <label>
                            Tenant Name <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="e.g., Acme Corporation"
                            disabled={saving}
                        />
                        {errors.name && <div className="error">{errors.name}</div>}
                    </div>

                    <div className="tenant-form-group">
                        <label>
                            Status <span className="required">*</span>
                        </label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            disabled={saving}
                        >
                            <option value="TRIAL">Trial</option>
                            <option value="ACTIVE">Active</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="SUSPENDED">Suspended</option>
                        </select>
                        <div className="help-text">
                            Note: Subdomain slug cannot be changed after creation.
                        </div>
                    </div>

                    <div className="tenant-form-actions">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => navigate('/tenant/manage')}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="primary"
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
                <div className="tenant-detail-section" style={{ marginTop: '32px' }}>
                    <h3>Subscription Settings</h3>
                    <div className="tenant-detail-grid">
                        <div className="tenant-detail-card">
                            <label>Subscription Start (UTC)</label>
                            <input
                                className="tenant-subscription-input"
                                type="datetime-local"
                                name="start_date"
                                value={subscriptionForm.start_date}
                                onChange={handleSubscriptionChange}
                                disabled={subscriptionSaving}
                            />
                        </div>
                        <div className="tenant-detail-card">
                            <label>Subscription End (UTC)</label>
                            <input
                                className="tenant-subscription-input"
                                type="datetime-local"
                                name="end_date"
                                value={subscriptionForm.end_date}
                                onChange={handleSubscriptionChange}
                                disabled={subscriptionSaving}
                            />
                        </div>
                        <div className="tenant-detail-card">
                            <label>Plan</label>
                            <input
                                className="tenant-subscription-input"
                                type="text"
                                name="plan"
                                value={subscriptionForm.plan}
                                onChange={handleSubscriptionChange}
                                disabled={subscriptionSaving}
                            />
                        </div>
                        <div className="tenant-detail-card">
                            <label>Billing Email</label>
                            <input
                                className="tenant-subscription-input"
                                type="email"
                                name="billing_email"
                                value={subscriptionForm.billing_email}
                                onChange={handleSubscriptionChange}
                                disabled={subscriptionSaving}
                            />
                        </div>
                    </div>
                    <div className="tenant-form-actions" style={{ justifyContent: 'flex-start' }}>
                        <button
                            type="button"
                            className="primary"
                            disabled={subscriptionSaving}
                            onClick={handleSubscriptionSave}
                        >
                            {subscriptionSaving ? 'Saving...' : 'Update Subscription'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EditTenant;
