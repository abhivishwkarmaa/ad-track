import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { offersAPI } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { unwrapApiData } from '../../lib/apiQuery';
import { offerStatsQueryDefaults } from '../../lib/queryClient';
import { patchOffersListCaches, setOfferDetailCache, removeOfferFromListCaches, invalidateListCaches } from '../../lib/queryCacheUtils';

export function useOffersList(params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.offers.list(params),
        queryFn: ({ signal }) =>
            unwrapApiData(offersAPI.getOffers(params, { signal })),
        enabled,
        select: (response) => ({
            data: response.data ?? [],
            pagination: response.pagination ?? null,
        }),
    });
}

export function useOfferDetail(id, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.offers.detail(id),
        queryFn: ({ signal }) =>
            unwrapApiData(offersAPI.getOffer(id, { signal })),
        enabled: Boolean(id) && enabled,
        select: (response) => response.data,
    });
}

export function useOfferAssignments(offerId, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.offers.assignments(offerId),
        queryFn: ({ signal }) =>
            unwrapApiData(offersAPI.getOfferAssignments(offerId, { signal })),
        enabled: Boolean(offerId) && enabled,
        select: (response) => response.data ?? [],
    });
}

export function useOfferStats(offerId, params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        ...offerStatsQueryDefaults,
        queryKey: queryKeys.offers.stats(offerId, params),
        queryFn: ({ signal }) =>
            unwrapApiData(offersAPI.getOfferStats(offerId, params, { signal })),
        enabled: Boolean(offerId) && enabled,
        select: (response) => response.data ?? null,
    });
}

export function useOfferPublisherStats(offerId, params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        ...offerStatsQueryDefaults,
        queryKey: queryKeys.offers.publisherStats(offerId, params),
        queryFn: ({ signal }) =>
            unwrapApiData(offersAPI.getOfferPublisherStats(offerId, params, { signal })),
        enabled: Boolean(offerId) && enabled,
        select: (response) => (Array.isArray(response.data) ? response.data : []),
    });
}

export function useCreateOffer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrapApiData(offersAPI.createOffer(data)),
        onSuccess: async () => {
            await invalidateListCaches(queryClient, queryKeys.offers.lists());
        },
    });
}

export function useUpdateOffer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => unwrapApiData(offersAPI.updateOffer(id, data)),
        onSuccess: async (response, { id }) => {
            const updatedOffer = response?.data;
            setOfferDetailCache(queryClient, id, updatedOffer);
            patchOffersListCaches(queryClient, updatedOffer);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.offers.detail(id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.offers.assignments(id) }),
                invalidateListCaches(queryClient, queryKeys.offers.lists()),
            ]);
        },
    });
}

export function useUpdateOfferStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }) => unwrapApiData(offersAPI.updateOfferStatus(id, status)),
        onSuccess: async (response, { id }) => {
            const updatedOffer = response?.data;
            setOfferDetailCache(queryClient, id, updatedOffer);
            patchOffersListCaches(queryClient, updatedOffer);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.offers.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.offers.lists()),
            ]);
        },
    });
}

export function useDeleteOffer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrapApiData(offersAPI.deleteOffer(id)),
        onSuccess: async (_response, id) => {
            removeOfferFromListCaches(queryClient, { id });
            await queryClient.invalidateQueries({
                queryKey: queryKeys.offers.all,
                refetchType: 'all',
            });
        },
    });
}
