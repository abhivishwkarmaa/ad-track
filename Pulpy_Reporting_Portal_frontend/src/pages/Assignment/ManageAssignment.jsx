import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { assignmentsAPI } from '../../services/api';
import {
    useAssignmentsList,
    useDeleteAssignment,
    useUpdateAssignment,
} from '../../hooks/queries/useAssignmentsQuery';
import { useOffersList } from '../../hooks/queries/useOffersQuery';
import { usePublishersList } from '../../hooks/queries/usePublishersQuery';
import { copyToClipboard as safeCopyToClipboard } from '../../utils/clipboard';
import { normalizeTrackingUrlMeta } from '../Offer/utils/trackingUrlUtils';
import { formatDateIST } from '../../utils/dateTime';
import { useEntityListQueryState } from '../../hooks/useEntityListQueryState';
import ConfirmModal from '../../shared/ui/ConfirmModal';
import {
    EntityListPage,
    EntityListHeader,
    EntityListToolbar,
    EntityListSearch,
    EntityListFilterSelect,
    EntityListFilterActions,
    EntityListBody,
    EntityListTableWrap,
    EntityListEmpty,
    StatusBadge,
} from '../../shared/ui/EntityList';
import {
    PlusIcon,
    EditIcon,
    EyeIcon,
    CopyIcon,
    LinkIcon,
    TrashIcon,
    PauseIcon,
    PlayIcon,
} from '../../shared/ui/icons';

const DEFAULT_FILTERS = { offer: 'all', publisher: 'all', status: 'all' };

function getOfferFilterId(offer) {
    return String(offer.public_offer_id || offer.display_id || offer.id);
}

function getPublisherFilterId(publisher) {
    return String(publisher.public_publisher_id || publisher.id);
}

function ManageAssignment() {
    const toast = useToast();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [draftOfferFilter, setDraftOfferFilter] = useState('all');
    const [draftPublisherFilter, setDraftPublisherFilter] = useState('all');
    const [draftStatusFilter, setDraftStatusFilter] = useState('all');
    const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
    const [trackingUrls, setTrackingUrls] = useState({});
    const [loadingTrackingUrls, setLoadingTrackingUrls] = useState({});
    const [deleteModal, setDeleteModal] = useState({ open: false, assignment: null });
    const [deleting, setDeleting] = useState(false);
    const [togglingStatus, setTogglingStatus] = useState({});

    const { data: offersResult } = useOffersList({ limit: 100 });
    const { data: publishersResult } = usePublishersList({ limit: 100 });

    const listParams = useMemo(() => {
        const params = { page: 1, limit: 100 };
        if (appliedFilters.offer !== 'all') params.offer_id = appliedFilters.offer;
        if (appliedFilters.publisher !== 'all') params.publisher_id = appliedFilters.publisher;
        if (appliedFilters.status !== 'all') params.status = appliedFilters.status;
        return params;
    }, [appliedFilters]);

    const assignmentsQuery = useAssignmentsList(listParams);
    const {
        isInitialLoad,
        isRefreshing,
        error,
        refetch,
    } = useEntityListQueryState(assignmentsQuery);
    const deleteAssignmentMutation = useDeleteAssignment();
    const updateAssignmentMutation = useUpdateAssignment();

    const assignments = assignmentsQuery.data?.data ?? [];
    const offers = offersResult?.data ?? [];
    const publishers = publishersResult?.data ?? [];

    const filtersDirty =
        draftOfferFilter !== appliedFilters.offer
        || draftPublisherFilter !== appliedFilters.publisher
        || draftStatusFilter !== appliedFilters.status;

    const filteredAssignments = assignments.filter((assignment) => {
        const matchesSearch =
            assignment.offer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            assignment.publisher_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            assignment.publisher_company?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const handleApplyFilters = () => {
        setAppliedFilters({
            offer: draftOfferFilter,
            publisher: draftPublisherFilter,
            status: draftStatusFilter,
        });
    };

    const handleResetFilters = () => {
        setDraftOfferFilter('all');
        setDraftPublisherFilter('all');
        setDraftStatusFilter('all');
        setAppliedFilters(DEFAULT_FILTERS);
    };

    const handleGetTrackingUrl = async (assignmentId) => {
        try {
            setLoadingTrackingUrls((prev) => ({ ...prev, [assignmentId]: true }));
            const response = await assignmentsAPI.getTrackingUrl(assignmentId);
            if (response.success && response.data) {
                const meta = normalizeTrackingUrlMeta(response.data);
                const trackingUrl = meta.tracking_url;
                setTrackingUrls((prev) => ({ ...prev, [assignmentId]: trackingUrl }));

                if (trackingUrl) {
                    await navigator.clipboard.writeText(trackingUrl);
                    toast.success('Tracking URL copied to clipboard!');
                } else {
                    toast.error('No tracking URL available');
                }
            } else {
                toast.error('Failed to fetch tracking URL');
            }
        } catch (err) {
            console.error('Error fetching tracking URL:', err);
            toast.error('Failed to fetch tracking URL');
        } finally {
            setLoadingTrackingUrls((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    const handleCopyTrackingUrl = async (trackingUrl) => {
        const result = await safeCopyToClipboard(trackingUrl);
        if (result.success) {
            toast.success('Tracking URL copied to clipboard!');
        } else {
            toast.error(result.error || 'Failed to copy to clipboard');
        }
    };

    const handleDelete = (assignment) => {
        setDeleteModal({ open: true, assignment });
    };

    const confirmDelete = async () => {
        if (!deleteModal.assignment) return;

        try {
            setDeleting(true);
            await deleteAssignmentMutation.mutateAsync(deleteModal.assignment.id);
            toast.success('Assignment deleted successfully');
            setDeleteModal({ open: false, assignment: null });
        } catch (err) {
            console.error('Delete assignment error:', err);
            toast.error('Failed to delete assignment');
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleStatus = async (assignment) => {
        const newStatus = assignment.status === 'active' ? 'inactive' : 'active';
        try {
            setTogglingStatus((prev) => ({ ...prev, [assignment.id]: true }));
            await updateAssignmentMutation.mutateAsync({
                id: assignment.id,
                data: { status: newStatus },
            });
            toast.success(`Assignment ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
        } catch (err) {
            console.error('Update status error:', err);
            toast.error('Failed to update status');
        } finally {
            setTogglingStatus((prev) => ({ ...prev, [assignment.id]: false }));
        }
    };

    return (
        <EntityListPage>
            <EntityListHeader
                title="Manage Assignments"
                subtitle="View and manage offer-to-publisher assignments"
                action={(
                    <Link to="/assignment/new" className="btn btn-primary">
                        <PlusIcon />
                        <span>New Assignment</span>
                    </Link>
                )}
            />

            <EntityListToolbar>
                <EntityListSearch
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search assignments..."
                    onClear={() => setSearchTerm('')}
                />
                <EntityListFilterSelect
                    value={draftOfferFilter}
                    onChange={(e) => setDraftOfferFilter(e.target.value)}
                >
                    <option value="all">All Offers</option>
                    {offers.map((offer) => (
                        <option key={offer.id} value={getOfferFilterId(offer)}>
                            {offer.name}
                        </option>
                    ))}
                </EntityListFilterSelect>
                <EntityListFilterSelect
                    value={draftPublisherFilter}
                    onChange={(e) => setDraftPublisherFilter(e.target.value)}
                >
                    <option value="all">All Publishers</option>
                    {publishers.map((publisher) => (
                        <option key={publisher.id} value={getPublisherFilterId(publisher)}>
                            {publisher.first_name} ({publisher.email})
                        </option>
                    ))}
                </EntityListFilterSelect>
                <EntityListFilterSelect
                    value={draftStatusFilter}
                    onChange={(e) => setDraftStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </EntityListFilterSelect>
                <EntityListFilterActions
                    onApply={handleApplyFilters}
                    onReset={handleResetFilters}
                    applyDisabled={!filtersDirty || isRefreshing}
                />
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
                                <th>Offer</th>
                                <th>Publisher</th>
                                <th>Payout Override</th>
                                <th>Status</th>
                                <th>Assigned At</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAssignments.length === 0 ? (
                                <EntityListEmpty colSpan={6} message="No assignments found" />
                            ) : (
                                filteredAssignments.map((assignment) => (
                                    <tr key={assignment.id}>
                                        <td>
                                            <div className="entity-list-cell-primary">
                                                {assignment.offer_name || `Offer #${assignment.offer_id}`}
                                            </div>
                                            <div className="entity-list-cell-meta">
                                                {assignment.offer_category || '—'}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="entity-list-cell-primary">
                                                {assignment.publisher_email || `Publisher #${assignment.publisher_id}`}
                                            </div>
                                            <div className="entity-list-cell-meta">
                                                {assignment.publisher_company || '—'}
                                            </div>
                                        </td>
                                        <td className="entity-list-cell-sub">
                                            {assignment.payout_override ? `$${assignment.payout_override}` : '—'}
                                        </td>
                                        <td>
                                            <StatusBadge status={assignment.status} />
                                        </td>
                                        <td className="entity-list-cell-sub">
                                            {assignment.assigned_at
                                                ? formatDateIST(assignment.assigned_at)
                                                : '—'}
                                        </td>
                                        <td>
                                            <div className="entity-list-actions">
                                                <button
                                                    type="button"
                                                    className={`entity-list-action-btn ${assignment.status === 'active' ? 'warn' : 'success'}`}
                                                    title={assignment.status === 'active' ? 'Pause' : 'Activate'}
                                                    onClick={() => handleToggleStatus(assignment)}
                                                    disabled={togglingStatus[assignment.id]}
                                                >
                                                    {togglingStatus[assignment.id] ? (
                                                        <span style={{ fontSize: 10 }}>…</span>
                                                    ) : assignment.status === 'active' ? (
                                                        <PauseIcon />
                                                    ) : (
                                                        <PlayIcon />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn"
                                                    title="View Details"
                                                    onClick={() => navigate(`/assignment/edit/${assignment.id}`)}
                                                >
                                                    <EyeIcon />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn"
                                                    title="Edit"
                                                    onClick={() => navigate(`/assignment/edit/${assignment.id}`)}
                                                >
                                                    <EditIcon />
                                                </button>
                                                {trackingUrls[assignment.id] ? (
                                                    <button
                                                        type="button"
                                                        className="entity-list-action-btn success"
                                                        title="Copy Tracking URL"
                                                        onClick={() => handleCopyTrackingUrl(trackingUrls[assignment.id])}
                                                    >
                                                        <CopyIcon />
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="entity-list-action-btn"
                                                        title="Get Tracking URL"
                                                        onClick={() => handleGetTrackingUrl(assignment.id)}
                                                        disabled={loadingTrackingUrls[assignment.id]}
                                                    >
                                                        {loadingTrackingUrls[assignment.id] ? (
                                                            <span style={{ fontSize: 12 }}>…</span>
                                                        ) : (
                                                            <LinkIcon />
                                                        )}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn delete"
                                                    title="Delete Assignment"
                                                    onClick={() => handleDelete(assignment)}
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
                onClose={() => !deleting && setDeleteModal({ open: false, assignment: null })}
                onConfirm={confirmDelete}
                title="Delete Assignment"
                message={`Are you sure you want to delete the assignment between ${deleteModal.assignment?.offer_name || `Offer #${deleteModal.assignment?.offer_id}`} and ${deleteModal.assignment?.publisher_email || `Publisher #${deleteModal.assignment?.publisher_id}`}? This action cannot be undone.`}
                confirmText="Delete"
                loading={deleting}
                variant="simple"
            />
        </EntityListPage>
    );
}

export default ManageAssignment;
