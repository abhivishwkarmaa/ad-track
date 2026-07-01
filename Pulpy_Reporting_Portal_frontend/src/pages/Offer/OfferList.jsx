import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useToast } from '../../context/ToastContext';
import {
    useOffersList,
    useDeleteOffer,
    useUpdateOfferStatus,
} from '../../hooks/queries/useOffersQuery';
import { formatDateIST } from '../../utils/dateTime';
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
} from '../../shared/ui/EntityList';
import { PlusIcon, EditIcon, TrashIcon, EyeIcon } from '../../shared/ui/icons';

function OfferList() {
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deleteModal, setDeleteModal] = useState({ open: false, offer: null });
    const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const itemsPerPage = 10;
    const [searchDebounced, setSearchDebounced] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState({});
    const effectiveSearch = searchDebounced.trim().length >= 3 ? searchDebounced.trim() : '';
    const prevSearchAndFilter = useRef({ search: effectiveSearch, filter: statusFilter });

    const listParams = useMemo(() => {
        const params = { page: currentPage, limit: itemsPerPage };
        if (effectiveSearch) params.search = effectiveSearch;
        if (statusFilter !== 'all') params.type = statusFilter;
        return params;
    }, [currentPage, effectiveSearch, statusFilter]);

    const offersQuery = useOffersList(listParams);
    const { isInitialLoad, isRefreshing, error, refetch } = useEntityListQueryState(offersQuery);
    const deleteOfferMutation = useDeleteOffer();
    const updateOfferStatusMutation = useUpdateOfferStatus();

    const offers = offersQuery.data?.data ?? [];
    const pagination = offersQuery.data?.pagination ?? { total: 0, totalPages: 1 };

    useEffect(() => {
        const t = setTimeout(() => setSearchDebounced(searchTerm), 400);
        return () => clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => {
        const prev = prevSearchAndFilter.current;
        const searchChanged = prev.search !== effectiveSearch;
        const filterChanged = prev.filter !== statusFilter;
        prevSearchAndFilter.current = { search: effectiveSearch, filter: statusFilter };
        if (searchChanged || filterChanged) {
            setSearchParams((p) => {
                const next = new URLSearchParams(p);
                next.set('page', '1');
                return next;
            }, { replace: true });
        }
    }, [effectiveSearch, statusFilter, setSearchParams]);

    const { total, totalPages } = pagination;

    const handleDelete = (offer) => {
        setDeleteModal({ open: true, offer });
    };

    const confirmDelete = async () => {
        if (!deleteModal.offer) return;
        try {
            await deleteOfferMutation.mutateAsync(deleteModal.offer.id);
            toast.success('Offer archived successfully');
            setDeleteModal({ open: false, offer: null });
            if (offers.length === 1 && currentPage > 1) {
                setSearchParams((p) => {
                    const next = new URLSearchParams(p);
                    next.set('page', '1');
                    return next;
                }, { replace: true });
            }
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to delete offer');
        }
    };

    const handleStatusChange = async (offerId, newStatus) => {
        try {
            setUpdatingStatus((prev) => ({ ...prev, [offerId]: true }));
            await updateOfferStatusMutation.mutateAsync({ id: offerId, status: newStatus });
            toast.success('Offer status updated successfully');
        } catch (err) {
            console.error('Status update error:', err);
            toast.error(err.message || 'Failed to update offer status');
        } finally {
            setUpdatingStatus((prev) => ({ ...prev, [offerId]: false }));
        }
    };

    const handlePageChange = (page) => {
        setSearchParams((p) => {
            const next = new URLSearchParams(p);
            next.set('page', String(page));
            return next;
        }, { replace: page === currentPage });
    };

    return (
        <EntityListPage>
            <EntityListHeader
                title="Offer List"
                subtitle="Manage all your offers in one place"
                action={(
                    <Link to="/offer/new" className="btn btn-primary">
                        <PlusIcon />
                        <span>New Offer</span>
                    </Link>
                )}
            />

            <EntityListToolbar>
                <EntityListSearch
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search offers (min 3 characters)..."
                    onClear={() => setSearchTerm('')}
                />
                <EntityListFilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                </EntityListFilterSelect>
            </EntityListToolbar>

            <EntityListBody
                isInitialLoad={isInitialLoad}
                isRefreshing={isRefreshing}
                error={error}
                onRetry={() => refetch()}
                tableRows={8}
                tableCols={10}
            >
                <EntityListTableWrap>
                    <table className="entity-list-table">
                        <thead>
                            <tr>
                                <th>Offer Name</th>
                                <th>Advertiser</th>
                                <th>Category</th>
                                <th>Country</th>
                                <th>Revenue</th>
                                <th>Payout</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {offers.length === 0 ? (
                                <EntityListEmpty colSpan={10} message="No offers found" />
                            ) : (
                                offers.map((offer) => {
                                    const offerPath = `/offer/detail/${offer.public_offer_id || offer.display_id}`;
                                    const isArchived = offer.status.toLowerCase() === 'archived';

                                    return (
                                        <tr key={offer.id}>
                                            <td>
                                                <Link to={offerPath} className="entity-list-row-link" aria-label={`View ${offer.name}`} />
                                                <div className="entity-list-cell-primary">{offer.name}</div>
                                                <div className="entity-list-cell-meta">
                                                    ID: {offer.public_offer_id || offer.display_id}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="entity-list-cell-primary">{offer.advertiser_name || '—'}</div>
                                                <div className="entity-list-cell-meta">
                                                    ID: {offer.public_advertiser_id || offer.advertiser_id || '—'}
                                                </div>
                                            </td>
                                            <td className="entity-list-cell-sub">{offer.category || '—'}</td>
                                            <td className="entity-list-cell-sub">{offer.country || '—'}</td>
                                            <td className="entity-list-cell-sub">
                                                {offer.offer_currency} {offer.advertiser_amount || '0.00'}
                                            </td>
                                            <td className="entity-list-cell-sub">
                                                {offer.offer_currency} {offer.affiliate_amount || '0.00'}
                                            </td>
                                            <td className="entity-list-cell-sub">
                                                {offer.start_date ? formatDateIST(offer.start_date) : '—'}
                                            </td>
                                            <td className="entity-list-cell-sub">
                                                {offer.end_date ? formatDateIST(offer.end_date) : '—'}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {isArchived ? (
                                                        <span className="entity-list-status-badge archived">
                                                            Archived
                                                        </span>
                                                    ) : (
                                                        <select
                                                            className={`entity-list-status-select ${offer.status.toLowerCase()}`}
                                                            value={offer.status.toLowerCase()}
                                                            onChange={(e) => handleStatusChange(offer.id, e.target.value)}
                                                            disabled={updatingStatus[offer.id]}
                                                        >
                                                            <option value="draft">Draft</option>
                                                            <option value="live">Live</option>
                                                            <option value="paused">Paused</option>
                                                        </select>
                                                    )}
                                                    {updatingStatus[offer.id] && (
                                                        <span className="entity-list-cell-meta">Updating…</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="entity-list-actions">
                                                    <Link
                                                        to={offerPath}
                                                        className="entity-list-action-btn"
                                                        title="View Details"
                                                    >
                                                        <EyeIcon size={16} />
                                                    </Link>
                                                    <Link
                                                        to={`/offer/edit/${offer.public_offer_id || offer.display_id}`}
                                                        className="entity-list-action-btn"
                                                        title="Edit"
                                                    >
                                                        <EditIcon />
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        className="entity-list-action-btn delete"
                                                        title="Archive"
                                                        onClick={() => handleDelete(offer)}
                                                        disabled={isArchived}
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </EntityListTableWrap>

                <EntityListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    total={total}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                />
            </EntityListBody>

            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, offer: null })}
                onConfirm={confirmDelete}
                title="Archive Offer?"
                message={`Are you sure you want to archive "${deleteModal.offer?.name}"? The offer will be hidden but tracking URLs will remain valid. You can view archived offers using the status filter.`}
                confirmText="Archive"
                loading={deleteOfferMutation.isPending}
            />
        </EntityListPage>
    );
}

export default OfferList;
