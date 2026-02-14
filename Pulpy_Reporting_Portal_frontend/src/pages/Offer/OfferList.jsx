import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { offersAPI } from '../../services/api';
import { SkeletonPage } from '../../components/Skeleton/Skeleton';
import './Offer.css';

// Icons
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const ClearIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
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

function OfferList() {

    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const { refreshKey } = useRefresh();
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [initialLoading, setInitialLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deleteModal, setDeleteModal] = useState({ open: false, offer: null });
    const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const itemsPerPage = 10;
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
    const [searchDebounced, setSearchDebounced] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState({});
    const effectiveSearch = searchDebounced.trim().length >= 3 ? searchDebounced.trim() : '';
    const prevSearchAndFilter = useRef({ search: effectiveSearch, filter: statusFilter });

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
    }, [effectiveSearch, statusFilter]);

    useEffect(() => {
        const fetchOffers = async () => {
            try {
                if (initialLoading) {
                    setLoading(true);
                } else {
                    setIsRefreshing(true);
                }
                setError(null);
                const params = { page: currentPage, limit: itemsPerPage };
                if (effectiveSearch) params.search = effectiveSearch;
                if (statusFilter !== 'all') params.type = statusFilter;

                const response = await offersAPI.getOffers(params);
                if (response.success) {
                    setOffers(response.data || []);
                    setPagination(response.pagination || { total: 0, totalPages: 1 });
                } else {
                    setError('Failed to load offers');
                }
            } catch (err) {
                console.error('Offers fetch error:', err);
                setError(err.message || 'Failed to load offers');
            } finally {
                setLoading(false);
                setIsRefreshing(false);
                if (initialLoading) {
                    setInitialLoading(false);
                }
            }
        };

        fetchOffers();
    }, [currentPage, effectiveSearch, statusFilter, refreshKey]);

    const { total, totalPages } = pagination;

    const handleDelete = (offer) => {
        setDeleteModal({ open: true, offer });
    };

    const confirmDelete = async () => {
        if (deleteModal.offer) {
            try {
                // Call the API to archive the offer (backend will set status to 'archived')
                await offersAPI.deleteOffer(deleteModal.offer.id);
                toast.success('Offer archived successfully');
                setDeleteModal({ open: false, offer: null });

                const params = { page: currentPage, limit: itemsPerPage };
                if (effectiveSearch) params.search = effectiveSearch;
                if (statusFilter !== 'all') params.type = statusFilter;
                const response = await offersAPI.getOffers(params);
                if (response.success) {
                    setOffers(response.data || []);
                    setPagination(response.pagination || pagination);
                    if (response.data?.length === 0 && currentPage > 1) {
                        setSearchParams((p) => {
                            const next = new URLSearchParams(p);
                            next.set('page', '1');
                            return next;
                        }, { replace: true });
                    }
                }
            } catch (err) {
                console.error('Delete error:', err);
                toast.error('Failed to delete offer');
            }
        }
    };

    const handleStatusChange = async (offerId, newStatus) => {
        try {
            setUpdatingStatus(prev => ({ ...prev, [offerId]: true }));
            const response = await offersAPI.updateOfferStatus(offerId, newStatus);

            if (response.success) {
                toast.success('Offer status updated successfully');

                const params = { page: currentPage, limit: itemsPerPage };
                if (effectiveSearch) params.search = effectiveSearch;
                if (statusFilter !== 'all') params.type = statusFilter;
                const offersResponse = await offersAPI.getOffers(params);
                if (offersResponse.success) {
                    setOffers(offersResponse.data || []);
                    setPagination(offersResponse.pagination || pagination);
                }
            } else {
                toast.error(response.message || 'Failed to update offer status');
            }
        } catch (err) {
            console.error('Status update error:', err);
            toast.error(err.message || 'Failed to update offer status');
        } finally {
            setUpdatingStatus(prev => ({ ...prev, [offerId]: false }));
        }
    };

    if (loading) {
        return (
            <div className="offer-page">
                <SkeletonPage tableRows={8} tableCols={10} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="offer-page">
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
        <div className="offer-page">
            <div className="offer-header">
                <div className="offer-header-left">
                    <h1>Offer List</h1>
                    <p>Manage all your offers in one place</p>
                </div>
                <Link to="/offer/new" className="btn btn-primary" style={{ whiteSpace: 'nowrap', minWidth: '140px', maxWidth: '100%', justifyContent: 'center' }}>
                    <PlusIcon />
                    <span>New Offer</span>
                </Link>
            </div>

            <div className="offer-filters">
                <div className="offer-search">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search offers (min 3 characters)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            className="offer-search-clear"
                            onClick={() => setSearchTerm('')}
                            aria-label="Clear search"
                            title="Clear search"
                        >
                            <ClearIcon />
                        </button>
                    )}
                </div>
                <select
                    className="form-control offer-filter-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                </select>
            </div>

            {isRefreshing && <div className="offer-search-glow-line" />}

            <div className="offer-table-container">
                <table className="offer-table">
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
                            <tr>
                                <td colSpan="10" style={{ textAlign: 'center', padding: '40px' }}>
                                    No offers found
                                </td>
                            </tr>
                        ) : (
                            offers.map((offer) => (
                                <tr key={offer.id}>
                                    <td>
                                        <Link to={`/offer/detail/${offer.public_offer_id || offer.display_id}`} className="offer-row-link" style={{ position: 'absolute', width: '100%', height: '100%', left: 0, top: 0, opacity: 0, zIndex: 1 }}></Link>
                                        <div className="offer-name">{offer.name}</div>
                                        <div className="offer-id">ID: {offer.public_offer_id || offer.display_id}</div>
                                    </td>
                                    <td>
                                        <div className="advertiser-name">{offer.advertiser_name || '-'}</div>
                                        <div className="advertiser-id" style={{ fontSize: '12px', color: '#666' }}>
                                            ID: {offer.public_advertiser_id || offer.advertiser_id || '-'}
                                        </div>
                                    </td>
                                    <td>{offer.category || '-'}</td>
                                    <td>{offer.country || '-'}</td>
                                    <td>{offer.offer_currency} {offer.advertiser_amount || '0.00'}</td>
                                    <td>{offer.offer_currency} {offer.affiliate_amount || '0.00'}</td>
                                    <td>{offer.start_date ? new Date(offer.start_date).toLocaleDateString() : '-'}</td>
                                    <td>{offer.end_date ? new Date(offer.end_date).toLocaleDateString() : '-'}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {offer.status.toLowerCase() === 'archived' ? (
                                                <span className="offer-status-badge archived">
                                                    Archived
                                                </span>
                                            ) : (
                                                <select
                                                    className={`offer-status-select ${offer.status.toLowerCase()}`}
                                                    value={offer.status.toLowerCase()}
                                                    onChange={(e) => handleStatusChange(offer.id, e.target.value)}
                                                    disabled={updatingStatus[offer.id]}
                                                    style={{ position: 'relative', zIndex: 2 }}
                                                >
                                                    <option value="draft">Draft</option>
                                                    <option value="live">Live</option>
                                                    <option value="paused">Paused</option>
                                                </select>
                                            )}
                                            {updatingStatus[offer.id] && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    Updating...
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="offer-actions">
                                            <Link
                                                to={`/offer/detail/${offer.public_offer_id || offer.display_id}`}
                                                className="offer-action-btn"
                                                title="View Details"
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', position: 'relative', zIndex: 2 }}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </Link>
                                            <Link
                                                to={`/offer/edit/${offer.public_offer_id || offer.display_id}`}
                                                className="offer-action-btn"
                                                title="Edit"
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', position: 'relative', zIndex: 2 }}
                                            >
                                                <EditIcon />
                                            </Link>
                                            <button
                                                className="offer-action-btn delete"
                                                title="Archive"
                                                onClick={() => handleDelete(offer)}
                                                disabled={offer.status.toLowerCase() === 'archived'}
                                                style={{ opacity: offer.status.toLowerCase() === 'archived' ? 0.5 : 1, position: 'relative', zIndex: 2 }}
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

                {total > 0 && (
                    <div className="offer-pagination">
                        <div className="offer-pagination-info">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, total)} of {total} entries
                        </div>
                        <div className="offer-pagination-buttons">
                            <button
                                className="offer-pagination-btn"
                                disabled={currentPage === 1}
                                onClick={() => setSearchParams((p) => {
                                    const next = new URLSearchParams(p);
                                    next.set('page', String(currentPage - 1));
                                    return next;
                                }, { replace: false })}
                            >
                                Previous
                            </button>
                            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                let page;
                                if (totalPages <= 10) page = i + 1;
                                else if (currentPage <= 5) page = i + 1;
                                else if (currentPage >= totalPages - 4) page = totalPages - 9 + i;
                                else page = currentPage - 5 + i;
                                return (
                                    <button
                                        key={page}
                                        className={`offer-pagination-btn ${currentPage === page ? 'active' : ''}`}
                                        onClick={() => setSearchParams((p) => {
                                            const next = new URLSearchParams(p);
                                            next.set('page', String(page));
                                            return next;
                                        }, { replace: false })}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                            <button
                                className="offer-pagination-btn"
                                disabled={currentPage === totalPages}
                                onClick={() => setSearchParams((p) => {
                                    const next = new URLSearchParams(p);
                                    next.set('page', String(currentPage + 1));
                                    return next;
                                }, { replace: false })}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModal.open && (
                <div className="modal-overlay" onClick={() => setDeleteModal({ open: false, offer: null })}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-body">
                            <div className="delete-modal">
                                <div className="delete-modal-icon">
                                    <AlertIcon />
                                </div>
                                <h3>Archive Offer?</h3>
                                <p>Are you sure you want to archive "{deleteModal.offer?.name}"? The offer will be hidden but tracking URLs will remain valid. You can view archived offers using the status filter.</p>
                                <div className="delete-modal-actions">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setDeleteModal({ open: false, offer: null })}
                                    >
                                        Cancel
                                    </button>
                                    <button className="btn btn-danger" onClick={confirmDelete}>
                                        Archive
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

export default OfferList;
