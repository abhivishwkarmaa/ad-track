import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { advertisersAPI } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { unwrapApiData } from '../../lib/apiQuery';
import { listQueryDefaults } from '../../lib/queryClient';
import {
    invalidateListCaches,
    patchAdvertisersListCaches,
    removeAdvertiserFromListCaches,
    setAdvertiserDetailCache,
} from '../../lib/queryCacheUtils';

export function useAdvertisersList(params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        ...listQueryDefaults,
        queryKey: queryKeys.advertisers.list(params),
        queryFn: ({ signal }) =>
            unwrapApiData(advertisersAPI.getAdvertisers(params, { signal })),
        enabled,
        select: (response) => ({
            data: response.data ?? [],
            pagination: response.pagination ?? null,
        }),
    });
}

export function useAdvertiserDetail(id, options = {}) {
    const { enabled = true, internalOnly = false } = options;
    return useQuery({
        queryKey: [...queryKeys.advertisers.detail(id), { internalOnly }],
        queryFn: ({ signal }) =>
            unwrapApiData(advertisersAPI.getAdvertiser(id, { signal, internalOnly })),
        enabled: Boolean(id) && enabled,
        select: (response) => response.data,
    });
}

export function useCreateAdvertiser() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrapApiData(advertisersAPI.createAdvertiser(data)),
        onSuccess: async () => {
            await invalidateListCaches(queryClient, queryKeys.advertisers.lists());
        },
    });
}

export function useUpdateAdvertiser() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => unwrapApiData(advertisersAPI.updateAdvertiser(id, data)),
        onSuccess: async (response, { id }) => {
            const updated = response?.data;
            setAdvertiserDetailCache(queryClient, id, updated);
            patchAdvertisersListCaches(queryClient, updated);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.advertisers.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.advertisers.lists()),
            ]);
        },
    });
}

export function useDeleteAdvertiser() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrapApiData(advertisersAPI.deleteAdvertiser(id)),
        onSuccess: async (_response, id) => {
            removeAdvertiserFromListCaches(queryClient, { id });
            await queryClient.invalidateQueries({
                queryKey: queryKeys.advertisers.all,
                refetchType: 'all',
            });
        },
    });
}
