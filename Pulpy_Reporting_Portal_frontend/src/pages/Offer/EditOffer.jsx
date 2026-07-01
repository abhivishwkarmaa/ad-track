import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useOfferDetail, useOffersList, useUpdateOffer } from '../../hooks/queries/useOffersQuery';
import { useAdvertisersList } from '../../hooks/queries/useAdvertisersQuery';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import { OFFER_COUNTRIES } from '../../utils/countries';
import { useOfferFormState } from './hooks/useOfferFormState';
import { createEmptyOfferFormData } from './utils/offerFormState';
import { buildOfferPayload, mapOfferToFormData } from './utils/offerFormPayload';
import OfferForm from './components/OfferForm';
import './Offer.css';

function EditOffer() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const updateOfferMutation = useUpdateOffer();
    const [loading, setLoading] = useState(false);

    const { data: offer, isLoading: loadingOffer, error: offerError } = useOfferDetail(id);
    const { data: advertisersResult, isLoading: loadingAdvertisers } = useAdvertisersList({ status: 'active', limit: 100 });
    const { data: offersResult } = useOffersList({ limit: 1000 });

    const advertisers = advertisersResult?.data ?? [];
    const offers = useMemo(() => {
        const allOffers = offersResult?.data ?? [];
        return allOffers.filter((o) => {
            const publicId = o.public_offer_id ?? o.display_id ?? o.id;
            return String(publicId) !== String(id);
        });
    }, [offersResult?.data, id]);

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
        const isStandardCountry = OFFER_COUNTRIES.some((c) => c.code === (offer.country || 'US'));
        if (!isStandardCountry && offer.country) {
            form.setShowCustomCountry(true);
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

            const offerData = buildOfferPayload(form.formData, {
                showCustomCategory: form.showCustomCategory,
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

    return (
        <div className="offer-page">
            <div className="offer-header">
                <div className="offer-header-left">
                    <h1>Edit Offer</h1>
                    <p>Update offer details and settings</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <OfferForm
                    headerSubtitle="Update the details below to modify the offer"
                    advertisers={advertisers}
                    offers={offers}
                    loadingAdvertisers={loadingAdvertisers}
                    loading={loading}
                    submitLabel="Save Offer"
                    submittingLabel="Saving..."
                    onCancel={() => navigate('/offer/list')}
                    {...form}
                />
            </form>
        </div>
    );
}

export default EditOffer;
