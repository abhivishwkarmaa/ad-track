import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
    usePublishersList,
    useDeletePublisher,
    useUpdatePublisher,
} from '../../hooks/queries/usePublishersQuery';
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
    EntityListPagination,
    StatusBadge,
} from '../../shared/ui/EntityList';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import {
    EyeIcon,
    PlusIcon,
    EditIcon,
    TrashIcon,
    PauseIcon,
    PlayIcon,
} from '../../shared/ui/icons';

function ManageAffiliate() {
    const toast = useToast();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('all');
    const [deleteModal, setDeleteModal] = useState({ open: false, affiliate: null });
    const [togglingStatus, setTogglingStatus] = useState({});

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchDebounced(searchTerm.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const listParams = useMemo(() => {
        const params = { page, limit: LIST_PAGE_SIZE };
        if (statusFilter !== 'all') params.status = statusFilter;
        if (searchDebounced) params.search = searchDebounced;
        return params;
    }, [statusFilter, page, searchDebounced]);

    const publishersQuery = usePublishersList(listParams);
    const { isInitialLoad, isRefreshing, error, refetch } = useEntityListQueryState(publishersQuery);
    const deletePublisherMutation = useDeletePublisher();
    const updatePublisherMutation = useUpdatePublisher();

    const publishers = publishersQuery.data?.data ?? [];
    const pagination = publishersQuery.data?.pagination ?? { total: 0, totalPages: 1 };
    const filteredAffiliates = publishers;

    const handleToggleStatus = async (affiliate) => {
        const newStatus = affiliate.status === 'active' ? 'suspended' : 'active';
        try {
            setTogglingStatus((prev) => ({ ...prev, [affiliate.id]: true }));
            await updatePublisherMutation.mutateAsync({
                id: affiliate.id,
                data: { status: newStatus },
            });
            toast.success(`Publisher ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`);
        } catch (err) {
            console.error('Update status error:', err);
            toast.error('Failed to update status');
        } finally {
            setTogglingStatus((prev) => ({ ...prev, [affiliate.id]: false }));
        }
    };

    const confirmDelete = async () => {
        if (!deleteModal.affiliate) return;
        try {
            await deletePublisherMutation.mutateAsync(deleteModal.affiliate.id);
            toast.success('Publisher deleted successfully');
            setDeleteModal({ open: false, affiliate: null });
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to delete publisher');
        }
    };

    return (
        <EntityListPage>
            <EntityListHeader
                title="Manage Publishers"
                subtitle="View and manage all registered publishers"
                action={(
                    <Link to="/affiliate/new" className="btn btn-primary">
                        <PlusIcon />
                        <span>New Publisher</span>
                    </Link>
                )}
            />

            <EntityListToolbar>
                <EntityListSearch
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search name, email, or public publisher ID"
                    onClear={() => setSearchTerm('')}
                />
                <EntityListFilterSelect
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                    }}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="suspended">Suspended</option>
                </EntityListFilterSelect>
            </EntityListToolbar>

            <EntityListBody
                isInitialLoad={isInitialLoad}
                isRefreshing={isRefreshing}
                error={error}
                onRetry={() => refetch()}
                tableRows={8}
                tableCols={5}
            >
                <EntityListTableWrap>
                    <table className="entity-list-table">
                        <thead>
                            <tr>
                                <th>Publisher</th>
                                <th>Company</th>
                                <th>Country</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAffiliates.length === 0 ? (
                                <EntityListEmpty colSpan={5} message="No publishers found" />
                            ) : (
                                filteredAffiliates.map((affiliate) => (
                                    <tr key={affiliate.id}>
                                        <td>
                                            <div className="entity-list-cell-primary">{affiliate.first_name}</div>
                                            <div className="entity-list-cell-meta">
                                                ID: {affiliate.public_publisher_id || affiliate.id}
                                            </div>
                                            <div className="entity-list-cell-meta">{affiliate.email}</div>
                                        </td>
                                        <td className="entity-list-cell-sub">{affiliate.company_name || '—'}</td>
                                        <td className="entity-list-cell-sub">{affiliate.country || '—'}</td>
                                        <td>
                                            <StatusBadge status={affiliate.status} />
                                        </td>
                                        <td>
                                            <div className="entity-list-actions">
                                                <button
                                                    type="button"
                                                    className={`entity-list-action-btn ${affiliate.status === 'active' ? 'warn' : 'success'}`}
                                                    title={affiliate.status === 'active' ? 'Suspend' : 'Activate'}
                                                    onClick={() => handleToggleStatus(affiliate)}
                                                    disabled={togglingStatus[affiliate.id]}
                                                >
                                                    {togglingStatus[affiliate.id] ? (
                                                        <span style={{ fontSize: 10 }}>…</span>
                                                    ) : affiliate.status === 'active' ? (
                                                        <PauseIcon />
                                                    ) : (
                                                        <PlayIcon />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn"
                                                    title="View Details"
                                                    onClick={() => navigate(`/affiliate/detail/${affiliate.public_publisher_id || affiliate.id}`)}
                                                >
                                                    <EyeIcon />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn"
                                                    title="Edit"
                                                    onClick={() => navigate(`/affiliate/edit/${affiliate.public_publisher_id || affiliate.id}`)}
                                                >
                                                    <EditIcon />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn delete"
                                                    title="Delete"
                                                    onClick={() => setDeleteModal({ open: true, affiliate })}
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
                <EntityListPagination
                    currentPage={page}
                    totalPages={pagination.totalPages || 1}
                    total={pagination.total || 0}
                    itemsPerPage={LIST_PAGE_SIZE}
                    onPageChange={setPage}
                />
            </EntityListBody>

            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, affiliate: null })}
                onConfirm={confirmDelete}
                title="Delete Publisher?"
                message={`Are you sure you want to delete "${deleteModal.affiliate?.first_name}"? This action cannot be undone.`}
                confirmText="Delete"
                loading={deletePublisherMutation.isPending}
            />
        </EntityListPage>
    );
}

export default ManageAffiliate;
