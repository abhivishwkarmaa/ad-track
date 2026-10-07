import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useOffersList, useCreateOffer } from '../../hooks/queries/useOffersQuery';
import { useAdvertisersList } from '../../hooks/queries/useAdvertisersQuery';
import { useOfferFormState } from './hooks/useOfferFormState';
import { createEmptyOfferFormData } from './utils/offerFormState';
import { buildOfferPayload, validateOfferParamsClient, validateOfferEventsClient } from './utils/offerFormPayload';
import { ArrowLeftIcon } from '../../shared/ui/icons';
import OfferForm from './components/OfferForm';
import './Offer.css';

function NewOffer() {
    const navigate = useNavigate();
    const toast = useToast();
    const createOfferMutation = useCreateOffer();
    const [loading, setLoading] = useState(false);

    const { data: advertisersResult, isLoading: loadingAdvertisers } = useAdvertisersList({ status: 'active', limit: 100 });
    const { data: offersResult } = useOffersList({ limit: 1000, status: 'live' });
    const advertisers = advertisersResult?.data ?? [];
    const offers = offersResult?.data ?? [];

    const form = useOfferFormState(createEmptyOfferFormData());

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!form.formData.name) {
                toast.error('Offer name is required');
                return;
            }
            if (!form.formData.advertiser_id) {
                toast.error('Advertiser is required');
                return;
            }
            if (!form.formData.advertiser_amount) {
                toast.error('Advertiser amount is required');
                return;
            }
            if (!form.formData.affiliate_amount) {
                toast.error('Affiliate amount is required');
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

            await createOfferMutation.mutateAsync(offerData);
            toast.success('Offer created successfully!');
            navigate('/offer/list');
        } catch (error) {
            console.error('Create offer error:', error);
            toast.error('Failed to create offer');
        } finally {
            setLoading(false);
        }
    };

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
                            <span className="offer-form-badge-id">NEW CAMPAIGN</span>
                            <span className="offer-form-badge-status" data-status={form.formData.status}>
                                <span className="status-indicator-dot" />
                                {form.formData.status?.toUpperCase() || 'LIVE'}
                            </span>
                            {form.formData.offer_currency && (
                                <span className="offer-form-badge-currency">{form.formData.offer_currency}</span>
                            )}
                        </div>
                        <h1 className="offer-form-title">Create Offer</h1>
                        <p className="offer-form-top-subtitle">
                            Configure destination URL, partner payouts, targeting rules, and caps
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <OfferForm
                    headerSubtitle="Fill in the details below to create a new campaign offer"
                    advertisers={advertisers}
                    offers={offers}
                    loadingAdvertisers={loadingAdvertisers}
                    loading={loading}
                    submitLabel="Create Offer"
                    submittingLabel="Creating..."
                    onCancel={() => navigate('/offer/list')}
                    isEdit={false}
                    {...form}
                />
            </form>
        </div>
    );
}

export default NewOffer;
