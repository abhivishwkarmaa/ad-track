import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useOfferDetail, useUpdateOffer } from '../../hooks/queries/useOffersQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import { OFFER_COUNTRIES } from '../../utils/countries';
import { useOfferFormState } from './hooks/useOfferFormState';
import { createEmptyOfferFormData, DEFAULT_TOKEN_MAPPINGS } from './utils/offerFormState';
import { buildOfferPayload, mapOfferToFormData, mapOfferParamsFromOffer, mapOfferEventsFromOffer, validateOfferParamsClient, validateOfferEventsClient } from './utils/offerFormPayload';
import { ArrowLeftIcon } from '../../shared/ui/icons';
import OfferForm from './components/OfferForm';
import './Offer.css';

function EditOffer() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const updateOfferMutation = useUpdateOffer();
    const [loading, setLoading] = useState(false);

    const { data: offer, isLoading: loadingOffer, error: offerError } = useOfferDetail(id);

    const form = useOfferFormState(createEmptyOfferFormData());

    useEffect(() => {
        if (offerError) {
            toast.error('Failed to load offer');
            navigate('/offer/list');
        }
    }, [offerError, navigate, toast]);

    useEffect(() => {
        if (!offer) return;
        form.setFormData(mapOfferToFormData(offer, id));
        form.setOfferParams(mapOfferParamsFromOffer(offer));
        form.setOfferEvents(mapOfferEventsFromOffer(offer));
        const isStandardCountry = OFFER_COUNTRIES.some((c) => c.code === (offer.country || 'US'));
        if (!isStandardCountry && offer.country) {
            form.setShowCustomCountry(true);
        }
        if (offer.token_type) {
            form.setShowTokenTable(true);
            form.setTokenMappings(DEFAULT_TOKEN_MAPPINGS);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once when offer loads
    }, [offer, id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!form.formData.name) {
                toast.error('Offer name is required');
                return;
            }

            const paramError = validateOfferParamsClient(form.offerParams);
            if (paramError) {
                toast.error(paramError);
                return;
            }

            const eventError = validateOfferEventsClient(form.offerEvents);
            if (eventError) {
                toast.error(eventError);
                return;
            }

            const offerData = buildOfferPayload(form.formData, {
                showCustomCategory: form.showCustomCategory,
                offerParams: form.offerParams,
                offerEvents: form.offerEvents,
            });

            await updateOfferMutation.mutateAsync({ id, data: offerData });
            toast.success('Offer updated successfully!');
            navigate('/offer/list');
        } catch (error) {
            console.error('Update offer error:', error);
            toast.error('Failed to update offer');
        } finally {
            setLoading(false);
        }
    };

    if (loadingOffer) {
        return (
            <div className="offer-page">
                <SkeletonDetail sections={4} />
            </div>
        );
    }

    const publicId = offer?.public_offer_id ?? offer?.display_id ?? id;

    return (
        <div className="offer-page">
            <div className="offer-form-top-bar">
                <div className="offer-form-top-left">
                    <button
                        type="button"
                        className="btn-back-circle"
                        onClick={() => navigate('/offer/list')}
                        title="Back to Offer List"
                    >
                        <ArrowLeftIcon size={18} />
                    </button>
                    <div className="offer-form-top-info">
                        <div className="offer-form-badge-group">
                            <span className="offer-form-badge-id">#{publicId}</span>
                            <span className="offer-form-badge-status" data-status={form.formData.status}>
                                <span className="status-indicator-dot" />
                                {form.formData.status?.toUpperCase() || 'LIVE'}
                            </span>
                            {form.formData.offer_currency && (
                                <span className="offer-form-badge-currency">{form.formData.offer_currency}</span>
                            )}
                        </div>
                        <h1 className="offer-form-title">Edit Offer</h1>
                        <p className="offer-form-top-subtitle">
                            Update tracking parameters, payout models, precision targeting, and cap rules
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <OfferForm
                    headerSubtitle="Update the details below to modify the offer"
                    advertiserLabel={offer?.advertiser?.public_advertiser_id
                        ? `#${offer.advertiser.public_advertiser_id} — ${offer.advertiser.name}`
                        : (offer?.advertiser?.name || '')}
                    fallbackOfferLabel={offer?.fallback_public_offer_id
                        ? `#${offer.fallback_public_offer_id} — ${offer.fallback_offer_name || 'Offer'}`
                        : ''}
                    loading={loading}
                    submitLabel="Save Changes"
                    submittingLabel="Saving..."
                    onCancel={() => navigate('/offer/list')}
                    isEdit={true}
                    offerId={id}
                    {...form}
                />
            </form>
        </div>
    );
}

export default EditOffer;
