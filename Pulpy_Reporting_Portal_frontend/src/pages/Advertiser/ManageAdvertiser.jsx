import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
    useAdvertisersList,
    useDeleteAdvertiser,
    useUpdateAdvertiser,
} from '../../hooks/queries/useAdvertisersQuery';
import { SkeletonPage } from '../../components/Skeleton/Skeleton';
import './Advertiser.css';

// Icons
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px', flexShrink: 0 }}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const EditIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
);

const AlertIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
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

function ManageAdvertiser() {
    const { deleteAdvertiser } = useData();
    const toast = useToast();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deleteModal, setDeleteModal] = useState({ open: false, advertiser: null });
    const [togglingStatus, setTogglingStatus] = useState({});

    const listParams = useMemo(() => {
        const params = { page: 1, limit: 100 };
        if (statusFilter !== 'all') params.status = statusFilter;
        return params;
    }, [statusFilter]);

    const {
        data: advertisersResult,
        isLoading: loading,
        error: queryError,
    } = useAdvertisersList(listParams);
    const deleteAdvertiserMutation = useDeleteAdvertiser();
    const updateAdvertiserMutation = useUpdateAdvertiser();

    const advertisers = advertisersResult?.data ?? [];
    const error = queryError?.message ?? null;

    const filteredAdvertisers = advertisers.filter(advertiser => {
        const matchesSearch =
            advertiser.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            advertiser.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            advertiser.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (advertiser.public_advertiser_id && advertiser.public_advertiser_id.toString().includes(searchTerm)) ||
            (advertiser.id && advertiser.id.toString().includes(searchTerm));
        const matchesStatus = statusFilter === 'all' || advertiser.status?.toLowerCase() === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    const handleToggleStatus = async (advertiser) => {
        const newStatus = advertiser.status === 'active' ? 'inactive' : 'active';
        try {
            setTogglingStatus((prev) => ({ ...prev, [advertiser.id]: true }));
            await updateAdvertiserMutation.mutateAsync({
                id: advertiser.id,
                data: { status: newStatus },
            });
            toast.success(`Advertiser ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
        } catch (err) {
            console.error('Update status error:', err);
            toast.error('Failed to update status');
        } finally {
            setTogglingStatus((prev) => ({ ...prev, [advertiser.id]: false }));
        }
    };

    const handleDelete = (advertiser) => {
        setDeleteModal({ open: true, advertiser });
    };

    const confirmDelete = async () => {
        if (!deleteModal.advertiser) return;
        try {
            await deleteAdvertiserMutation.mutateAsync(deleteModal.advertiser.id);
            deleteAdvertiser(deleteModal.advertiser.id);
            toast.success('Advertiser deleted successfully');
            setDeleteModal({ open: false, advertiser: null });
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to delete advertiser');
        }
    };

    if (loading) {
        return (
            <div className="advertiser-page">
                <SkeletonPage tableRows={8} tableCols={5} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="advertiser-page">
                <div className="error-state" style={{ textAlign: 'center', padding: '50px' }}>
                    <p style={{ color: '#F44336', marginBottom: '20px' }}>Error: {error}</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => window.location.reload()}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="advertiser-page">
            <div className="advertiser-header">
                <div className="advertiser-header-left">
                    <h1>Manage Advertisers</h1>
                    <p>View and manage all registered advertisers</p>
                </div>
                <Link to="/advertiser/new" className="btn btn-primary" style={{ whiteSpace: 'nowrap', minWidth: '140px', maxWidth: '100%', justifyContent: 'center' }}>
                    <PlusIcon />
                    <span>New Advertiser</span>
                </Link>
            </div>

            <div className="advertiser-filters">
                <div className="advertiser-search">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search advertisers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="form-control"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ minWidth: '150px' }}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>

                </select>
            </div>

            <div className="advertiser-table-container">
                <table className="advertiser-table">
                    <thead>
                        <tr>
                            <th>Advertiser</th>
                            <th>Company</th>
                            <th>Country</th>
                            <th>Website</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAdvertisers.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                                    No advertisers found
                                </td>
                            </tr>
                        ) : (
                            filteredAdvertisers.map((advertiser) => (
                                <tr key={advertiser.id}>
                                    <td>
                                        <div className="advertiser-name">{advertiser.name}</div>
                                        <div className="advertiser-id" style={{ fontSize: '12px', color: '#888' }}>ID: {advertiser.public_advertiser_id || advertiser.id}</div>
                                        <div className="advertiser-email">{advertiser.email}</div>
                                    </td>
                                    <td>{advertiser.company_name || '-'}</td>
                                    <td>{advertiser.country || '-'}</td>
                                    <td>
                                        {advertiser.website ? (
                                            <a href={advertiser.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)' }}>
                                                {advertiser.website.replace(/^https?:\/\//, '')}
                                            </a>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <span className={`advertiser-status ${advertiser.status?.toLowerCase()}`}>
                                            {advertiser.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="advertiser-actions">
                                            <button
                                                className="advertiser-action-btn"
                                                title={advertiser.status === 'active' ? 'Suspend' : 'Activate'}
                                                onClick={() => handleToggleStatus(advertiser)}
                                                style={{ color: advertiser.status === 'active' ? '#ff9800' : '#4CAF50' }}
                                                disabled={togglingStatus[advertiser.id]}
                                            >
                                                {togglingStatus[advertiser.id] ? (
                                                    <span style={{ fontSize: '10px' }}>...</span>
                                                ) : (
                                                    advertiser.status === 'active' ? <PauseIcon /> : <PlayIcon />
                                                )}
                                            </button>
                                            <button
                                                className="advertiser-action-btn"
                                                title="View Details"
                                                onClick={() => navigate(`/advertiser/detail/${advertiser.public_advertiser_id || advertiser.id}`)}
                                            >
                                                <EyeIcon />
                                            </button>
                                            <button
                                                className="advertiser-action-btn"
                                                title="Edit"
                                                onClick={() => navigate(`/advertiser/edit/${advertiser.public_advertiser_id || advertiser.id}`)}
                                            >
                                                <EditIcon />
                                            </button>
                                            <button
                                                className="advertiser-action-btn delete"
                                                title="Delete"
                                                onClick={() => handleDelete(advertiser)}
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModal.open && (
                <div className="modal-overlay" onClick={() => setDeleteModal({ open: false, advertiser: null })}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-body">
                            <div className="delete-modal">
                                <div className="delete-modal-icon">
                                    <AlertIcon />
                                </div>
                                <h3>Delete Advertiser?</h3>
                                <p>Are you sure you want to delete "{deleteModal.advertiser?.fullName}"? This action cannot be undone.</p>
                                <div className="delete-modal-actions">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setDeleteModal({ open: false, advertiser: null })}
                                    >
                                        Cancel
                                    </button>
                                    <button className="btn btn-danger" onClick={confirmDelete}>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ManageAdvertiser;
