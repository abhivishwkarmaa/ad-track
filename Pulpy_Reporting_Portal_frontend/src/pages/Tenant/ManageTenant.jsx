import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { tenantsAPI } from '../../services/api';
import './Tenant.css';

// Icons
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EditIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

const PauseIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
    </svg>
);

const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
);

function ManageTenant() {
    const toast = useToast();
    const navigate = useNavigate();
    const { refreshKey } = useRefresh();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [actionModal, setActionModal] = useState({ open: false, type: null, tenant: null });

    // Fetch tenants data
    useEffect(() => {
        fetchTenants();
    }, [statusFilter, refreshKey]);

    const fetchTenants = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = {
                page: 1,
                limit: 100
            };

            if (statusFilter !== 'all') {
                params.status = statusFilter;
            }

            const response = await tenantsAPI.getTenants(params);
            if (response.success) {
                setTenants(response.data || []);
            } else {
                setError('Failed to load tenants');
                toast.error('Failed to load tenants');
            }
        } catch (err) {
            console.error('Fetch tenants error:', err);
            setError('Failed to load tenants');
            toast.error(err.message || 'Failed to load tenants');
        } finally {
            setLoading(false);
        }
    };

    const handleSuspend = async (tenant) => {
        try {
            const response = await tenantsAPI.suspendTenant(tenant.id);
            if (response.success) {
                toast.success(`Tenant "${tenant.name}" has been suspended`);
                fetchTenants();
                setActionModal({ open: false, type: null, tenant: null });
            } else {
                toast.error(response.message || 'Failed to suspend tenant');
            }
        } catch (err) {
            console.error('Suspend tenant error:', err);
            toast.error(err.message || 'Failed to suspend tenant');
        }
    };

    const handleResume = async (tenant) => {
        try {
            const response = await tenantsAPI.resumeTenant(tenant.id);
            if (response.success) {
                toast.success(`Tenant "${tenant.name}" has been resumed`);
                fetchTenants();
                setActionModal({ open: false, type: null, tenant: null });
            } else {
                toast.error(response.message || 'Failed to resume tenant');
            }
        } catch (err) {
            console.error('Resume tenant error:', err);
            toast.error(err.message || 'Failed to resume tenant');
        }
    };

    const handleDelete = async (tenant) => {
        try {
            const response = await tenantsAPI.deleteTenant(tenant.id, false);
            if (response.success) {
                toast.success(`Tenant "${tenant.name}" has been deleted`);
                fetchTenants();
                setActionModal({ open: false, type: null, tenant: null });
            } else {
                toast.error(response.message || 'Failed to delete tenant');
            }
        } catch (err) {
            console.error('Delete tenant error:', err);
            toast.error(err.message || 'Failed to delete tenant');
        }
    };

    const filteredTenants = tenants.filter(tenant => {
        const matchesSearch =
            tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tenant.slug.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="tenant-container">
                <div className="loading-state">Loading tenants...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="tenant-container">
                <div className="error-state">
                    <p>{error}</p>
                    <button onClick={fetchTenants} style={{ marginTop: '16px', padding: '10px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="tenant-container">
            <div className="tenant-header">
                <h1>Tenant Management</h1>
                <div className="tenant-actions">
                    <Link to="/tenant/new" className="btn btn-primary" style={{ whiteSpace: 'nowrap', minWidth: '140px', justifyContent: 'center', textDecoration: 'none' }}>
                        <PlusIcon />
                        <span>Create Tenant</span>
                    </Link>
                </div>
            </div>

            <div className="tenant-filters">
                <div className="tenant-search">
                    <div className="tenant-search-icon">
                        <SearchIcon />
                    </div>
                    <input
                        type="text"
                        placeholder="Search tenants by name or slug..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="tenant-status-filter">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                    </select>
                </div>
            </div>

            {filteredTenants.length === 0 ? (
                <div className="empty-state">
                    <p>No tenants found</p>
                </div>
            ) : (
                <div className="tenant-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Subdomain</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTenants.map((tenant) => (
                                <tr key={tenant.id}>
                                    <td>
                                        <div className="tenant-name">{tenant.name}</div>
                                    </td>
                                    <td>
                                        <div className="tenant-slug">{tenant.slug}.track-myads.com</div>
                                    </td>
                                    <td>
                                        <span className={`tenant-status ${tenant.status}`}>
                                            {tenant.status === 'active' ? 'Active' : 'Suspended'}
                                        </span>
                                    </td>
                                    <td>{formatDate(tenant.created_at)}</td>
                                    <td>
                                        <div className="tenant-actions-cell">
                                            <Link
                                                to={`/tenant/detail/${tenant.id}`}
                                                className="tenant-action-btn view"
                                                title="View Details"
                                            >
                                                <EyeIcon />
                                                View
                                            </Link>
                                            <Link
                                                to={`/tenant/edit/${tenant.id}`}
                                                className="tenant-action-btn edit"
                                                title="Edit Tenant"
                                            >
                                                <EditIcon />
                                                Edit
                                            </Link>
                                            {tenant.status === 'active' ? (
                                                <button
                                                    className="tenant-action-btn suspend"
                                                    onClick={() => setActionModal({ open: true, type: 'suspend', tenant })}
                                                    title="Suspend Tenant"
                                                >
                                                    <PauseIcon />
                                                    Suspend
                                                </button>
                                            ) : (
                                                <button
                                                    className="tenant-action-btn resume"
                                                    onClick={() => setActionModal({ open: true, type: 'resume', tenant })}
                                                    title="Resume Tenant"
                                                >
                                                    <PlayIcon />
                                                    Resume
                                                </button>
                                            )}
                                            <button
                                                className="tenant-action-btn delete"
                                                onClick={() => setActionModal({ open: true, type: 'delete', tenant })}
                                                title="Delete Tenant"
                                            >
                                                <TrashIcon />
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Action Modal */}
            {actionModal.open && (
                <div className="modal-overlay" onClick={() => setActionModal({ open: false, type: null, tenant: null })}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>
                            {actionModal.type === 'suspend' && 'Suspend Tenant'}
                            {actionModal.type === 'resume' && 'Resume Tenant'}
                            {actionModal.type === 'delete' && 'Delete Tenant'}
                        </h3>
                        <p>
                            {actionModal.type === 'suspend' && `Are you sure you want to suspend "${actionModal.tenant?.name}"? This will block all access to their subdomain.`}
                            {actionModal.type === 'resume' && `Are you sure you want to resume "${actionModal.tenant?.name}"? This will restore access to their subdomain.`}
                            {actionModal.type === 'delete' && `Are you sure you want to delete "${actionModal.tenant?.name}"? This action cannot be undone.`}
                        </p>
                        <div className="modal-actions">
                            <button
                                className="secondary"
                                onClick={() => setActionModal({ open: false, type: null, tenant: null })}
                            >
                                Cancel
                            </button>
                            <button
                                className={actionModal.type === 'delete' ? 'danger' : 'primary'}
                                onClick={() => {
                                    if (actionModal.type === 'suspend') {
                                        handleSuspend(actionModal.tenant);
                                    } else if (actionModal.type === 'resume') {
                                        handleResume(actionModal.tenant);
                                    } else if (actionModal.type === 'delete') {
                                        handleDelete(actionModal.tenant);
                                    }
                                }}
                            >
                                {actionModal.type === 'suspend' && 'Suspend'}
                                {actionModal.type === 'resume' && 'Resume'}
                                {actionModal.type === 'delete' && 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ManageTenant;
