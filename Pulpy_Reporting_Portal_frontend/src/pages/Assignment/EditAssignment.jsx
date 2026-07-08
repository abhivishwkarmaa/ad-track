import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { assignmentsAPI } from '../../services/api';
import TrackingUrlPanel from '../Offer/components/TrackingUrlPanel';
import { normalizeTrackingUrlMeta } from '../Offer/utils/trackingUrlUtils';
import {
    useAssignmentDetail,
    useAssignmentsList,
    useUpdateAssignment,
} from '../../hooks/queries/useAssignmentsQuery';
import { useOffersList } from '../../hooks/queries/useOffersQuery';
import { usePublishersList } from '../../hooks/queries/usePublishersQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import './Assignment.css';

function EditAssignment() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const updateAssignmentMutation = useUpdateAssignment();
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
        tracking_url: '',
        tracking_meta: null,
    });
    const { data: assignment, isLoading: loadingAssignment, error: assignmentError } = useAssignmentDetail(id);
    const { data: offersResult } = useOffersList({ limit: 100 });
    const { data: publishersResult } = usePublishersList({ limit: 100 });
    const { data: publisherAssignmentsResult } = useAssignmentsList(
        { publisher_id: formData.publisher_id, status: 'active' },
        { enabled: Boolean(formData.publisher_id) }
    );

    const offers = offersResult?.data ?? [];
    const publishers = publishersResult?.data ?? [];

    useEffect(() => {
        if (assignmentError) {
            toast.error('Failed to load assignment');
            goBackToOrigin();
        }
    }, [assignmentError, goBackToOrigin, toast]);

    useEffect(() => {
        const rows = publisherAssignmentsResult?.data ?? [];
        if (!formData.publisher_id) {
            setPublisherAssignedOfferIds([]);
            return;
        }
        setPublisherAssignedOfferIds(rows.map((a) => String(a.offer_id)));
    }, [formData.publisher_id, publisherAssignmentsResult?.data]);

    useEffect(() => {
        if (!assignment) return;

        setFormData({
            offer_id: assignment.offer_id?.toString() || '',
            publisher_id: assignment.publisher_id?.toString() || '',
            payout_override: assignment.payout_override || '',
            conversion_approval_percentage: assignment.conversion_approval_percentage || '',
            capping_type: assignment.capping_type || 'none',
            capping_duration: assignment.capping_duration || 'daily',
            capping_action: assignment.capping_action || 'stop',
            fallback_type: assignment.fallback_type || 'offer',
            fallback_url: assignment.fallback_url || '',
            fallback_offer_id: assignment.fallback_offer_id?.toString() || '',
            capping_amount: assignment.capping_type !== 'none' ? assignment.capping_amount : '',
            callback_url: assignment.callback_url || '',
            offer_url: assignment.offer_url || '',
            notes: assignment.notes || '',
            status: assignment.status || 'active',
            tracking_url: '',
            tracking_meta: null,
        });

        let cancelled = false;
        const loadTrackingUrl = async () => {
            try {
                const trackingResponse = await assignmentsAPI.getTrackingUrl(id);
                if (!cancelled && trackingResponse.success) {
                    const meta = normalizeTrackingUrlMeta(trackingResponse.data);
                    setFormData((prev) => ({
                        ...prev,
                        tracking_url: meta.tracking_url,
                        tracking_meta: meta,
                    }));
                }
            } catch (err) {
                console.error('Error fetching tracking URL:', err);
            }
        };
        loadTrackingUrl();
        return () => {
            cancelled = true;
        };
    }, [assignment, id]);

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
                capping_amount: formData.capping_type !== 'none' && formData.capping_amount !== '' && formData.capping_amount != null
                    ? parseFloat(formData.capping_amount)
                    : null,
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

            await updateAssignmentMutation.mutateAsync({ id: targetId, data: assignmentData });
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

                        {formData.tracking_meta?.tracking_url && (
                            <div className="form-group">
                                <label className="form-label">Tracking URL</label>
                                <TrackingUrlPanel trackingMeta={formData.tracking_meta} compact />
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

