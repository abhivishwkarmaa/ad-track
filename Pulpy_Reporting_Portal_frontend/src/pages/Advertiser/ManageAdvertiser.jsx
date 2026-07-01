import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
    useAdvertisersList,
    useDeleteAdvertiser,
    useUpdateAdvertiser,
} from '../../hooks/queries/useAdvertisersQuery';
import { useEntityListQueryState } from '../../hooks/useEntityListQueryState';
import ConfirmModal from '../../shared/ui/ConfirmModal';
import {
    EntityListPage,
    EntityListHeader,
    EntityListToolbar,
    EntityListSearch,
    EntityListFilterSelect,
    EntityListBody,
    EntityListTableWrap,
    EntityListEmpty,
    StatusBadge,
} from '../../shared/ui/EntityList';
import {
    EyeIcon,
    PlusIcon,
    EditIcon,
    TrashIcon,
    PauseIcon,
    PlayIcon,
} from '../../shared/ui/icons';

function ManageAdvertiser() {
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

    const advertisersQuery = useAdvertisersList(listParams);
    const { isInitialLoad, isRefreshing, error, refetch } = useEntityListQueryState(advertisersQuery);
    const deleteAdvertiserMutation = useDeleteAdvertiser();
    const updateAdvertiserMutation = useUpdateAdvertiser();

    const advertisers = advertisersQuery.data?.data ?? [];

    const filteredAdvertisers = advertisers.filter((advertiser) => {
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

    const confirmDelete = async () => {
        if (!deleteModal.advertiser) return;
        try {
            await deleteAdvertiserMutation.mutateAsync(deleteModal.advertiser.id);
            toast.success('Advertiser deleted successfully');
            setDeleteModal({ open: false, advertiser: null });
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to delete advertiser');
        }
    };

    return (
        <EntityListPage>
            <EntityListHeader
                title="Manage Advertisers"
                subtitle="View and manage all registered advertisers"
                action={(
                    <Link to="/advertiser/new" className="btn btn-primary">
                        <PlusIcon />
                        <span>New Advertiser</span>
                    </Link>
                )}
            />

            <EntityListToolbar>
                <EntityListSearch
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search advertisers..."
                    onClear={() => setSearchTerm('')}
                />
                <EntityListFilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </EntityListFilterSelect>
            </EntityListToolbar>

            <EntityListBody
                isInitialLoad={isInitialLoad}
                isRefreshing={isRefreshing}
                error={error}
                onRetry={() => refetch()}
                tableRows={8}
                tableCols={6}
            >
                <EntityListTableWrap>
                    <table className="entity-list-table">
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
                                <EntityListEmpty colSpan={6} message="No advertisers found" />
                            ) : (
                                filteredAdvertisers.map((advertiser) => (
                                    <tr key={advertiser.id}>
                                        <td>
                                            <div className="entity-list-cell-primary">{advertiser.name}</div>
                                            <div className="entity-list-cell-meta">
                                                ID: {advertiser.public_advertiser_id || advertiser.id}
                                            </div>
                                            <div className="entity-list-cell-meta">{advertiser.email}</div>
                                        </td>
                                        <td className="entity-list-cell-sub">{advertiser.company_name || '—'}</td>
                                        <td className="entity-list-cell-sub">{advertiser.country || '—'}</td>
                                        <td>
                                            {advertiser.website ? (
                                                <a
                                                    href={advertiser.website}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="entity-list-link"
                                                >
                                                    {advertiser.website.replace(/^https?:\/\//, '')}
                                                </a>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td>
                                            <StatusBadge status={advertiser.status} />
                                        </td>
                                        <td>
                                            <div className="entity-list-actions">
                                                <button
                                                    type="button"
                                                    className={`entity-list-action-btn ${advertiser.status === 'active' ? 'warn' : 'success'}`}
                                                    title={advertiser.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    onClick={() => handleToggleStatus(advertiser)}
                                                    disabled={togglingStatus[advertiser.id]}
                                                >
                                                    {togglingStatus[advertiser.id] ? (
                                                        <span style={{ fontSize: 10 }}>…</span>
                                                    ) : advertiser.status === 'active' ? (
                                                        <PauseIcon />
                                                    ) : (
                                                        <PlayIcon />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn"
                                                    title="View Details"
                                                    onClick={() => navigate(`/advertiser/detail/${advertiser.public_advertiser_id || advertiser.id}`)}
                                                >
                                                    <EyeIcon />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn"
                                                    title="Edit"
                                                    onClick={() => navigate(`/advertiser/edit/${advertiser.public_advertiser_id || advertiser.id}`)}
                                                >
                                                    <EditIcon />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn delete"
                                                    title="Delete"
                                                    onClick={() => setDeleteModal({ open: true, advertiser })}
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
                </EntityListTableWrap>
            </EntityListBody>

            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, advertiser: null })}
                onConfirm={confirmDelete}
                title="Delete Advertiser?"
                message={`Are you sure you want to delete "${deleteModal.advertiser?.name}"? This action cannot be undone.`}
                confirmText="Delete"
                loading={deleteAdvertiserMutation.isPending}
            />
        </EntityListPage>
    );
}

export default ManageAdvertiser;
