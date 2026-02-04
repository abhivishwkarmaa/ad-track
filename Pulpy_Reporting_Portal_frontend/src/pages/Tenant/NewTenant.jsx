import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { tenantsAPI } from '../../services/api';
import './Tenant.css';

function NewTenant() {
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        status: 'active',
        adminEmail: '',
        adminName: '',
    });

    const [errors, setErrors] = useState({});
    const [createAdmin, setCreateAdmin] = useState(false);

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

        if (!formData.slug || formData.slug.trim() === '') {
            newErrors.slug = 'Subdomain slug is required';
        } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
            newErrors.slug = 'Slug must contain only lowercase letters, numbers, and hyphens';
        }

        if (createAdmin) {
            if (!formData.adminEmail || formData.adminEmail.trim() === '') {
                newErrors.adminEmail = 'Admin email is required';
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
                newErrors.adminEmail = 'Invalid email format';
            }

            if (!formData.adminName || formData.adminName.trim() === '') {
                newErrors.adminName = 'Admin name is required';
            }

        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validate()) return;

        setLoading(true);

        try {
            const payload = {
                name: formData.name.trim(),
                slug: formData.slug.trim().toLowerCase(),
                status: formData.status,
            };

            if (createAdmin) {
                payload.adminEmail = formData.adminEmail.trim();
                payload.adminName = formData.adminName.trim();
            }

            const response = await tenantsAPI.createTenant(payload);
            
            if (response.success) {
                toast.success('Tenant created successfully!');
                navigate('/tenant/manage');
            } else {
                toast.error(response.message || 'Failed to create tenant');
            }
        } catch (error) {
            console.error('Create tenant error:', error);
            toast.error(error.message || 'Failed to create tenant');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tenant-container">
            <div className="tenant-form">
                <h2>Create New Tenant</h2>
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
                            disabled={loading}
                        />
                        {errors.name && <div className="error">{errors.name}</div>}
                    </div>

                    <div className="tenant-form-group">
                        <label>
                            Subdomain Slug <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            name="slug"
                            value={formData.slug}
                            onChange={handleChange}
                            placeholder="e.g., acme"
                            disabled={loading}
                        />
                        {errors.slug && <div className="error">{errors.slug}</div>}
                        <div className="help-text">
                            This will create the subdomain: <strong>{formData.slug || 'slug'}.track-myads.com</strong>
                            <br />
                            Only lowercase letters, numbers, and hyphens are allowed.
                        </div>
                    </div>

                    <div className="tenant-form-group">
                        <label>
                            Status <span className="required">*</span>
                        </label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            disabled={loading}
                        >
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                        </select>
                    </div>

                    <div className="tenant-form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={createAdmin}
                                onChange={(e) => setCreateAdmin(e.target.checked)}
                                disabled={loading}
                            />
                            Create Tenant Admin User
                        </label>
                        <div className="help-text">
                            If checked, a tenant admin user will be created automatically.
                        </div>
                    </div>

                    {createAdmin && (
                        <>
                            <div className="tenant-form-group">
                                <label>
                                    Admin Name <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="adminName"
                                    value={formData.adminName}
                                    onChange={handleChange}
                                    placeholder="e.g., John Doe"
                                    disabled={loading}
                                />
                                {errors.adminName && <div className="error">{errors.adminName}</div>}
                            </div>

                            <div className="tenant-form-group">
                                <label>
                                    Admin Email <span className="required">*</span>
                                </label>
                                <input
                                    type="email"
                                    name="adminEmail"
                                    value={formData.adminEmail}
                                    onChange={handleChange}
                                    placeholder="e.g., admin@acme.com"
                                    disabled={loading}
                                />
                                {errors.adminEmail && <div className="error">{errors.adminEmail}</div>}
                                <div className="help-text">
                                    A temporary password will be generated and emailed to this address.
                                </div>
                            </div>

                        </>
                    )}

                    <div className="tenant-form-actions">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => navigate('/tenant/manage')}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="primary"
                            disabled={loading}
                        >
                            {loading ? 'Creating...' : 'Create Tenant'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default NewTenant;
