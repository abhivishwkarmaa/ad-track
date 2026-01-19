import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { tenantsAPI } from '../../services/api';
import './Tenant.css';

function EditTenant() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        status: 'active',
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetchTenant();
    }, [id]);

    const fetchTenant = async () => {
        try {
            setLoading(true);
            const response = await tenantsAPI.getTenant(id);
            if (response.success) {
                setFormData({
                    name: response.data.name || '',
                    status: response.data.status || 'active',
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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
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

    if (loading) {
        return (
            <div className="tenant-container">
                <div className="loading-state">Loading tenant...</div>
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
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
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
            </div>
        </div>
    );
}

export default EditTenant;
