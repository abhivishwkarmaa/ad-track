import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { publishersAPI } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { unwrapApiData } from '../../lib/apiQuery';
import {
    invalidateListCaches,
    patchPublishersListCaches,
    removePublisherFromListCaches,
    setPublisherDetailCache,
} from '../../lib/queryCacheUtils';

export function usePublishersList(params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.publishers.list(params),
        queryFn: ({ signal }) =>
            unwrapApiData(publishersAPI.getPublishers(params, { signal })),
        enabled,
        select: (response) => ({
            data: response.data ?? [],
            pagination: response.pagination ?? null,
        }),
    });
}

export function usePublisherDetail(id, options = {}) {
    const { enabled = true, internalOnly = false } = options;
    return useQuery({
        queryKey: [...queryKeys.publishers.detail(id), { internalOnly }],
        queryFn: ({ signal }) =>
            unwrapApiData(publishersAPI.getPublisher(id, { signal, internalOnly })),
        enabled: Boolean(id) && enabled,
        select: (response) => response.data,
    });
}

export function useCreatePublisher() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrapApiData(publishersAPI.createPublisher(data)),
        onSuccess: async () => {
            await invalidateListCaches(queryClient, queryKeys.publishers.lists());
        },
    });
}

export function useUpdatePublisher() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => unwrapApiData(publishersAPI.updatePublisher(id, data)),
        onSuccess: async (response, { id }) => {
            const updated = response?.data;
            setPublisherDetailCache(queryClient, id, updated);
            patchPublishersListCaches(queryClient, updated);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.publishers.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.publishers.lists()),
            ]);
        },
    });
}

export function useDeletePublisher() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrapApiData(publishersAPI.deletePublisher(id)),
        onSuccess: async (_response, id) => {
            removePublisherFromListCaches(queryClient, { id });
            await queryClient.invalidateQueries({
                queryKey: queryKeys.publishers.all,
                refetchType: 'all',
            });
        },
    });
}
