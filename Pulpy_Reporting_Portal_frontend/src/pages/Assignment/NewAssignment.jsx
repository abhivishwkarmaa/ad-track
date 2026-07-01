import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { assignmentsAPI, offersAPI, publishersAPI } from '../../services/api';
import { isAbortError } from '../../hooks/useAbortableRequest';
import './Assignment.css';

function NewAssignment() {
    const navigate = useNavigate();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const [loading, setLoading] = useState(false);
    const [offers, setOffers] = useState([]);
    const [publishers, setPublishers] = useState([]);
    const [selectedOffer, setSelectedOffer] = useState('');
    const [selectedPublishers, setSelectedPublishers] = useState([]);
    const [publisherAssignments, setPublisherAssignments] = useState([]);
    /** publisher_id -> list of internal offer_ids that publisher already has an active assignment for */
    const [assignedOffersByPublisher, setAssignedOffersByPublisher] = useState({});

    const publisherIdsKey = publisherAssignments.map(a => a.publisher_id).sort((a, b) => a - b).join(',');

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const fetchData = async () => {
            try {
                const [offersRes, publishersRes] = await Promise.all([
                    offersAPI.getOffers({ limit: 100 }, { signal }),
                    publishersAPI.getPublishers({ limit: 100 }, { signal })
                ]);
                if (signal.aborted) return;
                if (offersRes.success) setOffers(offersRes.data);
                if (publishersRes.success) setPublishers(publishersRes.data);
            } catch (err) {
                if (isAbortError(err)) return;
                console.error('Error fetching data:', err);
                toast.error('Failed to load data');
            }
        };
        fetchData();
        return () => controller.abort();
    }, [toast, refreshKey]);

    useEffect(() => {
        const loadAssignedOffers = async () => {
            const ids = [...new Set(publisherAssignments.map(a => a.publisher_id))];
            if (ids.length === 0) {
                setAssignedOffersByPublisher({});
                return;
            }
            const next = {};
            await Promise.all(
                ids.map(async (pid) => {
                    try {
                        const res = await assignmentsAPI.getAssignments({ publisher_id: pid, status: 'active' });
                        if (res.success && Array.isArray(res.data)) {
                            next[pid] = res.data.map(a => String(a.offer_id));
                        } else {
                            next[pid] = [];
                        }
                    } catch (err) {
                        console.error('Error loading assignments for publisher', pid, err);
                        next[pid] = [];
                    }
                })
            );
            setAssignedOffersByPublisher(next);
        };
        loadAssignedOffers();
    }, [publisherIdsKey, refreshKey]);

    const handleAddPublisher = (publisherId) => {
        if (!publisherId) return;
        const publisher = publishers.find(p => p.id === parseInt(publisherId));
        if (publisher && !publisherAssignments.find(a => a.publisher_id === publisher.id)) {
            setPublisherAssignments(prev => [...prev, {
                publisher_id: publisher.id,
                payout_override: '',
                conversion_approval_percentage: '',
                capping_type: 'none',
                capping_duration: 'daily',
                capping_amount: '',
                capping_action: 'stop',
                fallback_type: 'offer',
                fallback_url: '',
                fallback_offer_id: '',
                callback_url: '',
                offer_url: '',
                notes: '',
                status: 'active'
            }]);
        }
    };

    const handleRemovePublisher = (index) => {
        setPublisherAssignments(prev => prev.filter((_, i) => i !== index));
    };

    const handlePublisherChange = (index, field, value) => {
        const updated = [...publisherAssignments];
        updated[index][field] = value;
        setPublisherAssignments(updated);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedOffer) {
            toast.error('Please select an offer');
            return;
        }
        if (publisherAssignments.length === 0) {
            toast.error('Please add at least one publisher');
            return;
        }

        setLoading(true);
        try {
            const assignmentData = {
                offer_id: parseInt(selectedOffer),
                publishers: publisherAssignments.map(assignment => ({
                    publisher_id: assignment.publisher_id,
                    payout_override: assignment.payout_override ? parseFloat(assignment.payout_override) : null,
                    conversion_approval_percentage: assignment.conversion_approval_percentage ? parseFloat(assignment.conversion_approval_percentage) : null,

                    // Unified Capping
                    capping_type: assignment.capping_type,
                    capping_duration: assignment.capping_duration,
                    capping_action: assignment.capping_action,
                    capping_amount: assignment.capping_type !== 'none' && assignment.capping_amount !== '' && assignment.capping_amount != null
                        ? parseFloat(assignment.capping_amount)
                        : null,
                    fallback_type: assignment.capping_action === 'fallback' ? assignment.fallback_type : null,
                    fallback_url: assignment.capping_action === 'fallback' && assignment.fallback_type === 'custom' ? (assignment.fallback_url || null) : null,
                    fallback_offer_id: assignment.capping_action === 'fallback' && assignment.fallback_type === 'offer' && assignment.fallback_offer_id
                        ? parseInt(assignment.fallback_offer_id, 10)
                        : null,

                    callback_url: assignment.callback_url || null,
                    offer_url: assignment.offer_url || null,
                    notes: assignment.notes || null,
                    status: assignment.status
                }))
            };

            await assignmentsAPI.createOrUpdateAssignments(assignmentData);
            toast.success('Assignment created successfully!');
            navigate('/assignment/manage');
        } catch (error) {
            console.error('Error creating assignment:', error);
            toast.error(error.message || 'Failed to create assignment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="assignment-page">
            <div className="assignment-form-container">
                <div className="assignment-form-header">
                    <h2>New Assignment</h2>
                    <p>Assign an offer to one or more publishers</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="assignment-form-section">
                        <div className="assignment-form-row">
                            <div className="form-group">
                                <label className="form-label required">Select Offer</label>
                                <select
                                    className="form-control"
                                    value={selectedOffer}
                                    onChange={(e) => setSelectedOffer(e.target.value)}
                                    required
                                >
                                    <option value="">Select an offer</option>
                                    {offers.map(offer => (
                                        <option key={offer.id} value={offer.id}>
                                            {offer.name} ({offer.category})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="assignment-form-section" style={{ marginTop: '32px' }}>
                            <h3 className="assignment-form-section-title">Add Publishers</h3>
                            <div className="form-group">
                                <label className="form-label">Add Publisher</label>
                                <select
                                    className="form-control"
                                    value=""
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleAddPublisher(e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                >
                                    <option value="">Select Publisher to Add</option>
                                    {publishers
                                        .filter(p => !publisherAssignments.find(a => a.publisher_id === p.id))
                                        .map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.first_name} ({p.email}) - {p.company_name}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            {publisherAssignments.length > 0 && (
                                <div style={{ marginTop: '20px' }}>
                                    {publisherAssignments.map((assignment, index) => {
                                        const publisher = publishers.find(p => p.id === assignment.publisher_id);
                                        return (
                                            <div key={index} style={{
                                                border: '1px solid #ddd',
                                                borderRadius: '8px',
                                                padding: '15px',
                                                marginBottom: '15px',
                                                background: '#f9f9f9'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                    <h5 style={{ margin: 0 }}>
                                                        {publisher ? `${publisher.first_name} (${publisher.email})` : `Publisher ID: ${assignment.publisher_id}`}
                                                    </h5>
                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleRemovePublisher(index)}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                <div className="assignment-form-row two-col">
                                                    <div className="form-group">
                                                        <label className="form-label">Payout Override</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="form-control"
                                                            value={assignment.payout_override}
                                                            onChange={(e) => handlePublisherChange(index, 'payout_override', e.target.value)}
                                                            placeholder="Leave empty for default"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Conversion Approval %</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            max="100"
                                                            className="form-control"
                                                            value={assignment.conversion_approval_percentage}
                                                            onChange={(e) => handlePublisherChange(index, 'conversion_approval_percentage', e.target.value)}
                                                            placeholder="0-100"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Unified Capping UI */}
                                                <div className="assignment-form-row">
                                                    <div className="form-group" style={{ flex: 1 }}>
                                                        <label className="form-label">Capping Type</label>
                                                        <select
                                                            className="form-control"
                                                            value={assignment.capping_type}
                                                            onChange={(e) => handlePublisherChange(index, 'capping_type', e.target.value)}
                                                        >
                                                            <option value="none">No Capping</option>
                                                            <option value="budget">Budget Cap ($)</option>
                                                            <option value="conversion">Conversion Cap (Count)</option>
                                                        </select>
                                                    </div>

                                                    {assignment.capping_type !== 'none' && (
                                                        <>
                                                            <div className="form-group" style={{ flex: 1 }}>
                                                                <label className="form-label">Duration</label>
                                                                <select
                                                                    className="form-control"
                                                                    value={assignment.capping_duration}
                                                                    onChange={(e) => handlePublisherChange(index, 'capping_duration', e.target.value)}
                                                                >
                                                                    <option value="daily">Daily</option>
                                                                    <option value="weekly">Weekly</option>
                                                                    <option value="monthly">Monthly</option>
                                                                </select>
                                                            </div>
                                                            <div className="form-group" style={{ flex: 1 }}>
                                                                <label className="form-label required">Limit</label>
                                                                <input
                                                                    type="number"
                                                                    step={assignment.capping_type === 'budget' ? "0.01" : "1"}
                                                                    className="form-control"
                                                                    value={assignment.capping_amount}
                                                                    onChange={(e) => handlePublisherChange(index, 'capping_amount', e.target.value)}
                                                                    placeholder={assignment.capping_type === 'budget' ? "100.00" : "50"}
                                                                    required
                                                                />
                                                            </div>
                                                            <div className="form-group" style={{ flex: 1 }}>
                                                                <label className="form-label">Action</label>
                                                                <select
                                                                    className="form-control"
                                                                    value={assignment.capping_action}
                                                                    onChange={(e) => handlePublisherChange(index, 'capping_action', e.target.value)}
                                                                >
                                                                    <option value="stop">Stop Traffic</option>
                                                                    <option value="reject">Reject Conversions</option>
                                                                    <option value="fallback">Fallback (redirect)</option>
                                                                </select>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {assignment.capping_type !== 'none' && assignment.capping_action === 'fallback' && (
                                                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e0e0e0' }}>
                                                        <h5 style={{ margin: '0 0 10px' }}>Publisher cap — fallback</h5>
                                                        <div className="assignment-form-row two-col">
                                                            <div className="form-group">
                                                                <label className="form-label">Fallback type</label>
                                                                <select
                                                                    className="form-control"
                                                                    value={assignment.fallback_type}
                                                                    onChange={(e) => handlePublisherChange(index, 'fallback_type', e.target.value)}
                                                                >
                                                                    <option value="offer">Redirect to another offer</option>
                                                                    <option value="custom">Custom URL</option>
                                                                </select>
                                                            </div>
                                                            {assignment.fallback_type === 'custom' ? (
                                                                <div className="form-group">
                                                                    <label className="form-label required">Custom URL</label>
                                                                    <input
                                                                        type="url"
                                                                        className="form-control"
                                                                        value={assignment.fallback_url}
                                                                        onChange={(e) => handlePublisherChange(index, 'fallback_url', e.target.value)}
                                                                        placeholder="https://..."
                                                                        required
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="form-group">
                                                                    <label className="form-label required">Fallback offer</label>
                                                                    <select
                                                                        className="form-control"
                                                                        value={assignment.fallback_offer_id}
                                                                        onChange={(e) => handlePublisherChange(index, 'fallback_offer_id', e.target.value)}
                                                                        required
                                                                    >
                                                                        <option value="">Select offer…</option>
                                                                        {(offers.filter(o => {
                                                                            const id = String(o.id);
                                                                            const assignedIds = assignedOffersByPublisher[assignment.publisher_id] || [];
                                                                            if (id === String(assignment.fallback_offer_id)) return true;
                                                                            if (id === String(selectedOffer)) return false;
                                                                            return assignedIds.includes(id);
                                                                        })).map(offer => (
                                                                                <option key={offer.id} value={offer.id}>
                                                                                    #{offer.public_offer_id ?? offer.id} — {offer.name}
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                                                            Only offers this publisher is already assigned to (excluding the offer above). If the list is empty, assign them to the fallback offer first, then return here. Clicks after redirect are counted on the fallback offer only.
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="form-group">
                                                    <label className="form-label">Callback URL</label>
                                                    <input
                                                        type="url"
                                                        className="form-control"
                                                        value={assignment.callback_url}
                                                        onChange={(e) => handlePublisherChange(index, 'callback_url', e.target.value)}
                                                        placeholder="https://affiliate.com/postback?click_id={click_id}&payout={payout}"
                                                    />
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Offer URL</label>
                                                    <input
                                                        type="url"
                                                        className="form-control"
                                                        value={assignment.offer_url}
                                                        onChange={(e) => handlePublisherChange(index, 'offer_url', e.target.value)}
                                                        placeholder="https://pulpy.com/click?offer_id=10&publisher_id=7&tid={TID}"
                                                    />
                                                </div>

                                                <div className="assignment-form-row two-col">
                                                    <div className="form-group">
                                                        <label className="form-label">Status</label>
                                                        <select
                                                            className="form-control"
                                                            value={assignment.status}
                                                            onChange={(e) => handlePublisherChange(index, 'status', e.target.value)}
                                                        >
                                                            <option value="active">Active</option>
                                                            <option value="inactive">Inactive</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Notes</label>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            value={assignment.notes}
                                                            onChange={(e) => handlePublisherChange(index, 'notes', e.target.value)}
                                                            placeholder="Optional notes"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="assignment-form-actions">
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Assignment'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/assignment/manage')}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default NewAssignment;

