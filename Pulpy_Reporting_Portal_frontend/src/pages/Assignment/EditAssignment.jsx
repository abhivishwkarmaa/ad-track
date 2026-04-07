import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { assignmentsAPI, offersAPI, publishersAPI } from '../../services/api';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import './Assignment.css';

function EditAssignment() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const { refreshKey } = useRefresh();
    const returnToFromQuery = new URLSearchParams(location.search).get('returnTo');
    const returnToFromState = location.state?.returnTo;
    const returnTo = returnToFromQuery || returnToFromState;

    const goBackToOrigin = useCallback(() => {
        if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
            navigate(returnTo);
            return;
        }
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/assignment/manage');
    }, [navigate, returnTo]);
    const [loading, setLoading] = useState(false);
    const [loadingAssignment, setLoadingAssignment] = useState(true);
    const [assignment, setAssignment] = useState(null);
    const [offers, setOffers] = useState([]);
    const [publishers, setPublishers] = useState([]);
    /** Internal offer_ids this publisher already has an active assignment for (for fallback-offer picker). */
    const [publisherAssignedOfferIds, setPublisherAssignedOfferIds] = useState([]);
    const [formData, setFormData] = useState({
        offer_id: '',
        publisher_id: '',
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
        status: 'active',
        tracking_url: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [offersRes, publishersRes] = await Promise.all([
                    offersAPI.getOffers({ limit: 100 }),
                    publishersAPI.getPublishers({ limit: 100 })
                ]);
                if (offersRes.success) setOffers(offersRes.data);
                if (publishersRes.success) setPublishers(publishersRes.data);
            } catch (err) {
                console.error('Error fetching data:', err);
            }
        };
        fetchData();
    }, [refreshKey]);

    useEffect(() => {
        const loadPublisherAssignments = async () => {
            const pubId = formData.publisher_id;
            if (!pubId) {
                setPublisherAssignedOfferIds([]);
                return;
            }
            try {
                const res = await assignmentsAPI.getAssignments({ publisher_id: pubId, status: 'active' });
                if (res.success && Array.isArray(res.data)) {
                    setPublisherAssignedOfferIds(res.data.map(a => String(a.offer_id)));
                } else {
                    setPublisherAssignedOfferIds([]);
                }
            } catch (err) {
                console.error('Error loading publisher assignments for fallback offers:', err);
                setPublisherAssignedOfferIds([]);
            }
        };
        loadPublisherAssignments();
    }, [formData.publisher_id, refreshKey]);

    useEffect(() => {
        const fetchAssignment = async () => {
            try {
                setLoadingAssignment(true);
                const response = await assignmentsAPI.getAssignment(id);
                if (response.success && response.data) {
                    const data = response.data;
                    setAssignment(data);
                    setFormData({
                        offer_id: data.offer_id?.toString() || '',
                        publisher_id: data.publisher_id?.toString() || '',
                        payout_override: data.payout_override || '',
                        conversion_approval_percentage: data.conversion_approval_percentage || '',
                        capping_type: data.capping_type || 'none',
                        capping_duration: data.capping_duration || 'daily',
                        capping_action: data.capping_action || 'stop',
                        fallback_type: data.fallback_type || 'offer',
                        fallback_url: data.fallback_url || '',
                        fallback_offer_id: data.fallback_offer_id?.toString() || '',
                        capping_amount: data.capping_type !== 'none' ? data.capping_amount : '',
                        callback_url: data.callback_url || '',
                        offer_url: data.offer_url || '',
                        notes: data.notes || '',
                        status: data.status || 'active',
                        tracking_url: ''
                    });

                    // Fetch tracking URL
                    try {
                        const trackingResponse = await assignmentsAPI.getTrackingUrl(id);
                        if (trackingResponse.success) {
                            setFormData(prev => ({ ...prev, tracking_url: trackingResponse.data.tracking_url }));
                        }
                    } catch (err) {
                        console.error('Error fetching tracking URL:', err);
                    }
                }
            } catch (err) {
                console.error('Error fetching assignment:', err);
                toast.error('Failed to load assignment');
                goBackToOrigin();
            } finally {
                setLoadingAssignment(false);
            }
        };

        if (id) {
            fetchAssignment();
        }
    }, [id, toast, refreshKey, goBackToOrigin]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Use updateAssignment for editing (PATCH)
            // Use internal_id if available, otherwise fallback to id from params

            const assignmentData = {
                payout_override: formData.payout_override ? parseFloat(formData.payout_override) : null,
                conversion_approval_percentage: formData.conversion_approval_percentage ? parseFloat(formData.conversion_approval_percentage) : null,

                // Unified Capping
                capping_type: formData.capping_type,
                capping_duration: formData.capping_duration,
                capping_action: formData.capping_action,
                capping_amount: formData.capping_type !== 'none' && formData.capping_amount ? parseFloat(formData.capping_amount) : null,
                fallback_type: formData.capping_action === 'fallback' ? formData.fallback_type : null,
                fallback_url: formData.capping_action === 'fallback' && formData.fallback_type === 'custom' ? (formData.fallback_url || null) : null,
                fallback_offer_id: formData.capping_action === 'fallback' && formData.fallback_type === 'offer' && formData.fallback_offer_id
                    ? parseInt(formData.fallback_offer_id, 10)
                    : null,

                callback_url: formData.callback_url || null,
                offer_url: formData.offer_url || null, // Will be mapped to destination_url in backend
                notes: formData.notes || null,
                status: formData.status
            };

            // Use internal_id to ensure we are updating the correct record in DB
            // (assignment.id might be Public ID string)
            const targetId = assignment?.internal_id || id;

            await assignmentsAPI.updateAssignment(targetId, assignmentData);
            toast.success('Assignment updated successfully!');
            goBackToOrigin();
        } catch (error) {
            console.error('Error updating assignment:', error);
            toast.error(error.message || 'Failed to update assignment');
        } finally {
            setLoading(false);
        }
    };

    if (loadingAssignment) {
        return (
            <div className="assignment-page">
                <SkeletonDetail sections={3} />
            </div>
        );
    }

    const fallbackOfferOptions = offers.filter(offer => {
        const id = String(offer.id);
        if (id === String(formData.fallback_offer_id)) return true;
        if (id === String(formData.offer_id)) return false;
        return publisherAssignedOfferIds.includes(id);
    });

    return (
        <div className="assignment-page">
            <div className="assignment-form-container">
                <div className="assignment-form-header">
                    <h2>Edit Assignment {assignment?.public_assignment_id || assignment?.id ? `(ID: ${assignment.public_assignment_id || assignment.id})` : ''}</h2>
                    <p>Update assignment details</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="assignment-form-section">
                        <div className="assignment-form-row two-col">
                            <div className="form-group">
                                <label className="form-label required">Offer</label>
                                <select
                                    className="form-control"
                                    value={formData.offer_id}
                                    onChange={(e) => handleChange('offer_id', e.target.value)}
                                    required
                                    disabled
                                >
                                    <option value="">Select an offer</option>
                                    {offers.map(offer => (
                                        <option key={offer.id} value={offer.id}>
                                            {offer.name} ({offer.category})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label required">Publisher</label>
                                <select
                                    className="form-control"
                                    value={formData.publisher_id}
                                    onChange={(e) => handleChange('publisher_id', e.target.value)}
                                    required
                                    disabled
                                >
                                    <option value="">Select a publisher</option>
                                    {publishers.map(publisher => (
                                        <option key={publisher.id} value={publisher.id}>
                                            {publisher.first_name} ({publisher.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="assignment-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Payout Override</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={formData.payout_override}
                                    onChange={(e) => handleChange('payout_override', e.target.value)}
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
                                    value={formData.conversion_approval_percentage}
                                    onChange={(e) => handleChange('conversion_approval_percentage', e.target.value)}
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
                                    value={formData.capping_type}
                                    onChange={(e) => handleChange('capping_type', e.target.value)}
                                >
                                    <option value="none">No Capping</option>
                                    <option value="budget">Budget Cap ($)</option>
                                    <option value="conversion">Conversion Cap (Count)</option>
                                </select>
                            </div>

                            {formData.capping_type !== 'none' && (
                                <>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Duration</label>
                                        <select
                                            className="form-control"
                                            value={formData.capping_duration}
                                            onChange={(e) => handleChange('capping_duration', e.target.value)}
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
                                            step={formData.capping_type === 'budget' ? "0.01" : "1"}
                                            className="form-control"
                                            value={formData.capping_amount}
                                            onChange={(e) => handleChange('capping_amount', e.target.value)}
                                            placeholder={formData.capping_type === 'budget' ? "100.00" : "50"}
                                            required
                                        />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Action</label>
                                        <select
                                            className="form-control"
                                            value={formData.capping_action}
                                            onChange={(e) => handleChange('capping_action', e.target.value)}
                                        >
                                            <option value="stop">Stop Traffic</option>
                                            <option value="reject">Reject Conversions</option>
                                            <option value="fallback">Fallback (redirect)</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                        {formData.capping_type !== 'none' && formData.capping_action === 'fallback' && (
                            <div className="assignment-form-section" style={{ marginTop: '16px' }}>
                                <h3 className="assignment-form-section-title">Publisher cap — fallback</h3>
                                <div className="assignment-form-row two-col">
                                    <div className="form-group">
                                        <label className="form-label">Fallback type</label>
                                        <select
                                            className="form-control"
                                            value={formData.fallback_type}
                                            onChange={(e) => handleChange('fallback_type', e.target.value)}
                                        >
                                            <option value="offer">Redirect to another offer</option>
                                            <option value="custom">Custom URL</option>
                                        </select>
                                    </div>
                                    {formData.fallback_type === 'custom' ? (
                                        <div className="form-group">
                                            <label className="form-label required">Custom URL</label>
                                            <input
                                                type="url"
                                                className="form-control"
                                                value={formData.fallback_url}
                                                onChange={(e) => handleChange('fallback_url', e.target.value)}
                                                placeholder="https://..."
                                                required
                                            />
                                        </div>
                                    ) : (
                                        <div className="form-group">
                                            <label className="form-label required">Fallback offer</label>
                                            <select
                                                className="form-control"
                                                value={formData.fallback_offer_id}
                                                onChange={(e) => handleChange('fallback_offer_id', e.target.value)}
                                                required
                                            >
                                                <option value="">Select offer…</option>
                                                {fallbackOfferOptions.map(offer => (
                                                    <option key={offer.id} value={offer.id}>
                                                        #{offer.public_offer_id ?? offer.id} — {offer.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <p className="form-hint" style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                                    Only offers this publisher is already assigned to (active) are listed. Clicks after redirect are counted on the fallback offer only — not on this offer.
                                </p>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Callback URL</label>
                            <input
                                type="url"
                                className="form-control"
                                value={formData.callback_url}
                                onChange={(e) => handleChange('callback_url', e.target.value)}
                                placeholder="https://affiliate.com/postback?click_id={click_id}&payout={payout}"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Offer URL</label>
                            <input
                                type="url"
                                className="form-control"
                                value={formData.offer_url}
                                onChange={(e) => handleChange('offer_url', e.target.value)}
                                placeholder="https://pulpy.com/click?offer_id=10&publisher_id=7&tid={TID}"
                            />
                        </div>

                        {formData.tracking_url && (
                            <div className="form-group">
                                <label className="form-label">Tracking URL</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={formData.tracking_url}
                                    readOnly
                                />
                            </div>
                        )}

                        <div className="assignment-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-control"
                                    value={formData.status}
                                    onChange={(e) => handleChange('status', e.target.value)}
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
                                    value={formData.notes}
                                    onChange={(e) => handleChange('notes', e.target.value)}
                                    placeholder="Optional notes"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="assignment-form-actions">
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Updating...' : 'Update Assignment'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={goBackToOrigin}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default EditAssignment;

