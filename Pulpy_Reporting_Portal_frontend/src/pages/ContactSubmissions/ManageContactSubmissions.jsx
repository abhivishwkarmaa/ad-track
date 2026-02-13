import { useState, useEffect } from 'react';
import { contactSubmissionsAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { SkeletonTable } from '../../components/Skeleton/Skeleton';
import './ContactSubmissions.css';

// Icons
const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
);

const EmailIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
    </svg>
);

const CloseIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

function ManageContactSubmissions() {
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [submissions, setSubmissions] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);

    // Fetch stats
    useEffect(() => {
        fetchStats();
    }, [refreshKey]);

    // Fetch submissions
    useEffect(() => {
        fetchSubmissions();
    }, [page, statusFilter, refreshKey]);

    const fetchStats = async () => {
        try {
            const response = await contactSubmissionsAPI.getContactStats();
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchSubmissions = async () => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: 50,
            };
            if (statusFilter) params.status = statusFilter;
            if (searchQuery) params.search = searchQuery;

            const response = await contactSubmissionsAPI.getContactSubmissions(params);
            if (response.success) {
                setSubmissions(response.data);
                setPagination(response.pagination);
            }
        } catch (error) {
            console.error('Error fetching submissions:', error);
            toast.error('Failed to load contact submissions');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setPage(1);
        fetchSubmissions();
    };

    const handleViewSubmission = async (id) => {
        try {
            const response = await contactSubmissionsAPI.getContactSubmission(id);
            if (response.success) {
                setSelectedSubmission(response.data);
                setShowModal(true);
                // Refresh stats and list after viewing (status might change to 'read')
                fetchStats();
                fetchSubmissions();
            }
        } catch (error) {
            console.error('Error fetching submission:', error);
            toast.error('Failed to load submission details');
        }
    };

    const handleUpdateStatus = async (id, status) => {
        try {
            const response = await contactSubmissionsAPI.updateContactStatus(id, status);
            if (response.success) {
                toast.success(`Status updated to ${status}`);
                fetchStats();
                fetchSubmissions();
                if (selectedSubmission && selectedSubmission.id === id) {
                    setSelectedSubmission({ ...selectedSubmission, status });
                }
            }
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this submission?')) {
            return;
        }

        try {
            const response = await contactSubmissionsAPI.deleteContactSubmission(id);
            if (response.success) {
                toast.success('Submission deleted successfully');
                fetchStats();
                fetchSubmissions();
                if (selectedSubmission && selectedSubmission.id === id) {
                    setShowModal(false);
                    setSelectedSubmission(null);
                }
            }
        } catch (error) {
            console.error('Error deleting submission:', error);
            toast.error('Failed to delete submission');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString();
    };

    const copyEmail = (email) => {
        navigator.clipboard.writeText(email);
        toast.success('Email copied to clipboard');
    };

    return (
        <div className="contact-submissions-page">
            <div className="contact-submissions-header">
                <div className="contact-submissions-header-left">
                    <h1>Contact Submissions</h1>
                    <p>Manage and respond to contact form submissions</p>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="contact-stats-grid">
                    <div className="contact-stat-card total">
                        <div className="contact-stat-label">Total Submissions</div>
                        <div className="contact-stat-value">{stats.total}</div>
                    </div>
                    <div className="contact-stat-card new">
                        <div className="contact-stat-label">New</div>
                        <div className="contact-stat-value">{stats.byStatus.new}</div>
                    </div>
                    <div className="contact-stat-card read">
                        <div className="contact-stat-label">Read</div>
                        <div className="contact-stat-value">{stats.byStatus.read}</div>
                    </div>
                    <div className="contact-stat-card replied">
                        <div className="contact-stat-label">Replied</div>
                        <div className="contact-stat-value">{stats.byStatus.replied}</div>
                    </div>
                    <div className="contact-stat-card recent">
                        <div className="contact-stat-label">Last 7 Days</div>
                        <div className="contact-stat-value">{stats.recent}</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="contact-submissions-filters">
                <div className="contact-search">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search name, email, or message..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                </div>

                <select
                    className="form-control"
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                    }}
                    style={{ minWidth: '150px' }}
                >
                    <option value="">All Status</option>
                    <option value="new">New</option>
                    <option value="read">Read</option>
                    <option value="replied">Replied</option>
                    <option value="archived">Archived</option>
                </select>

                <button className="btn btn-primary" onClick={handleSearch}>
                    Search
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <SkeletonTable rows={8} cols={6} />
            ) : submissions.length === 0 ? (
                <div className="contact-empty">
                    <EmailIcon />
                    <h3>No Submissions Found</h3>
                    <p>There are no contact submissions matching your criteria.</p>
                </div>
            ) : (
                <>
                    <div className="contact-submissions-table-container">
                        <table className="contact-submissions-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Message Preview</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((submission) => (
                                    <tr key={submission.id} onClick={() => handleViewSubmission(submission.id)}>
                                        <td>{submission.id}</td>
                                        <td>
                                            <div className="contact-name">
                                                {submission.first_name} {submission.last_name}
                                            </div>
                                            <div className="contact-email">{submission.email}</div>
                                        </td>
                                        <td>
                                            <div className="contact-message-preview">
                                                {submission.message}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`contact-status ${submission.status}`}>
                                                {submission.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="contact-date">
                                                {formatDate(submission.created_at)}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="contact-actions" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="contact-action-btn"
                                                    onClick={() => handleViewSubmission(submission.id)}
                                                    title="View Details"
                                                >
                                                    <EyeIcon />
                                                </button>
                                                <button
                                                    className="contact-action-btn delete"
                                                    onClick={() => handleDelete(submission.id)}
                                                    title="Delete"
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination && (
                        <div className="contact-pagination">
                            <div className="contact-pagination-info">
                                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                                {pagination.total} submissions
                            </div>
                            <div className="contact-pagination-controls">
                                <button
                                    className="btn btn-sm"
                                    disabled={pagination.page === 1}
                                    onClick={() => setPage(page - 1)}
                                >
                                    Previous
                                </button>
                                <span style={{ padding: '0 12px', color: 'var(--text-secondary)' }}>
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    className="btn btn-sm"
                                    disabled={pagination.page === pagination.totalPages}
                                    onClick={() => setPage(page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Detail Modal */}
            {showModal && selectedSubmission && (
                <div className="modal-overlay contact-detail-modal" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Contact Submission #{selectedSubmission.id}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <CloseIcon />
                            </button>
                        </div>
                        <div className="contact-detail-content">
                            <div className="contact-detail-section">
                                <div className="contact-detail-label">From</div>
                                <div className="contact-detail-value">
                                    <strong>{selectedSubmission.first_name} {selectedSubmission.last_name}</strong>
                                    <br />
                                    <span
                                        style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
                                        onClick={() => copyEmail(selectedSubmission.email)}
                                        title="Click to copy email"
                                    >
                                        {selectedSubmission.email}
                                    </span>
                                </div>
                            </div>

                            <div className="contact-detail-section">
                                <div className="contact-detail-label">Status</div>
                                <span className={`contact-status ${selectedSubmission.status}`}>
                                    {selectedSubmission.status}
                                </span>
                            </div>

                            <div className="contact-detail-section">
                                <div className="contact-detail-label">Message</div>
                                <div className="contact-detail-message">
                                    {selectedSubmission.message}
                                </div>
                            </div>

                            <div className="contact-detail-section">
                                <div className="contact-detail-label">Additional Information</div>
                                <div className="contact-detail-metadata">
                                    <div className="contact-detail-meta-item">
                                        <div className="contact-detail-label">IP Address</div>
                                        <div className="contact-detail-value">{selectedSubmission.ip_address || '-'}</div>
                                    </div>
                                    <div className="contact-detail-meta-item">
                                        <div className="contact-detail-label">Submitted</div>
                                        <div className="contact-detail-value">{formatDate(selectedSubmission.created_at)}</div>
                                    </div>
                                    <div className="contact-detail-meta-item">
                                        <div className="contact-detail-label">Last Updated</div>
                                        <div className="contact-detail-value">{formatDate(selectedSubmission.updated_at)}</div>
                                    </div>
                                    {selectedSubmission.referer && (
                                        <div className="contact-detail-meta-item">
                                            <div className="contact-detail-label">Referer</div>
                                            <div className="contact-detail-value" style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                                                {selectedSubmission.referer}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="contact-detail-actions">
                                <button
                                    className="btn btn-outline"
                                    onClick={() => handleUpdateStatus(selectedSubmission.id, 'new')}
                                    disabled={selectedSubmission.status === 'new'}
                                >
                                    Mark as New
                                </button>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => handleUpdateStatus(selectedSubmission.id, 'read')}
                                    disabled={selectedSubmission.status === 'read'}
                                >
                                    Mark as Read
                                </button>
                                <button
                                    className="btn btn-success"
                                    onClick={() => handleUpdateStatus(selectedSubmission.id, 'replied')}
                                    disabled={selectedSubmission.status === 'replied'}
                                >
                                    Mark as Replied
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleUpdateStatus(selectedSubmission.id, 'archived')}
                                    disabled={selectedSubmission.status === 'archived'}
                                >
                                    Archive
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => handleDelete(selectedSubmission.id)}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ManageContactSubmissions;
