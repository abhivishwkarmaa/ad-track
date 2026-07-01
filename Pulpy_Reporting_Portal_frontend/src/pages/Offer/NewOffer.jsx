import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useOffersList, useCreateOffer } from '../../hooks/queries/useOffersQuery';
import { useAdvertisersList } from '../../hooks/queries/useAdvertisersQuery';
import { useOfferFormState } from './hooks/useOfferFormState';
import { createEmptyOfferFormData } from './utils/offerFormState';
import { buildOfferPayload } from './utils/offerFormPayload';
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

            const offerData = buildOfferPayload(form.formData, {
                showCustomCategory: form.showCustomCategory,
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
            <div className="offer-header">
                <div className="offer-header-left">
                    <h1>New Offer</h1>
                    <p>Create a new offer for your campaigns</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <OfferForm
                    headerSubtitle="Fill in the details below to create a new offer"
                    advertisers={advertisers}
                    offers={offers}
                    loadingAdvertisers={loadingAdvertisers}
                    loading={loading}
                    submitLabel="Create Offer"
                    submittingLabel="Creating..."
                    onCancel={() => navigate('/offer/list')}
                    {...form}
                />
            </form>
        </div>
    );
}

export default NewOffer;
