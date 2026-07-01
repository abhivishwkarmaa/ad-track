import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantsAPI } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { unwrapApiData } from '../../lib/apiQuery';
import {
    invalidateListCaches,
    patchTenantsListCaches,
    removeTenantFromListCaches,
    setTenantDetailCache,
} from '../../lib/queryCacheUtils';

export function useTenantsList(params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.tenants.list(params),
        queryFn: () => unwrapApiData(tenantsAPI.getTenants(params)),
        enabled,
        select: (response) => ({
            data: response.data ?? [],
            pagination: response.pagination ?? null,
        }),
    });
}

export function useTenantDetail(id, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.tenants.detail(id),
        queryFn: () => unwrapApiData(tenantsAPI.getTenant(id)),
        enabled: Boolean(id) && enabled,
        select: (response) => response.data,
    });
}

export function useCreateTenant() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrapApiData(tenantsAPI.createTenant(data)),
        onSuccess: async () => {
            await invalidateListCaches(queryClient, queryKeys.tenants.lists());
        },
    });
}

export function useUpdateTenant() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => unwrapApiData(tenantsAPI.updateTenant(id, data)),
        onSuccess: async (response, { id }) => {
            const updated = response?.data;
            setTenantDetailCache(queryClient, id, updated);
            patchTenantsListCaches(queryClient, updated);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.tenants.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.tenants.lists()),
            ]);
        },
    });
}

export function useSuspendTenant() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrapApiData(tenantsAPI.suspendTenant(id)),
        onSuccess: async (response, id) => {
            const updated = response?.data;
            setTenantDetailCache(queryClient, id, updated);
            patchTenantsListCaches(queryClient, updated ?? { id, status: 'SUSPENDED' });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.tenants.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.tenants.lists()),
            ]);
        },
    });
}

export function useResumeTenant() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrapApiData(tenantsAPI.resumeTenant(id)),
        onSuccess: async (response, id) => {
            const updated = response?.data;
            setTenantDetailCache(queryClient, id, updated);
            patchTenantsListCaches(queryClient, updated ?? { id, status: 'ACTIVE' });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.tenants.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.tenants.lists()),
            ]);
        },
    });
}

export function useDeleteTenant() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, hardDelete = false }) =>
            unwrapApiData(tenantsAPI.deleteTenant(id, hardDelete)),
        onSuccess: async (_response, { id }) => {
            removeTenantFromListCaches(queryClient, { id });
            await queryClient.invalidateQueries({
                queryKey: queryKeys.tenants.all,
                refetchType: 'all',
            });
        },
    });
}
