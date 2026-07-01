import { useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentsAPI } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { unwrapApiData } from '../../lib/apiQuery';
import { referenceDataQueryDefaults } from '../../lib/queryClient';
import {
    invalidateListCaches,
    patchAssignmentsListCaches,
    removeAssignmentFromListCaches,
    setAssignmentDetailCache,
} from '../../lib/queryCacheUtils';

export function useAssignmentsList(params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.assignments.list(params),
        queryFn: ({ signal }) =>
            unwrapApiData(assignmentsAPI.getAssignments(params, { signal })),
        enabled,
        select: (response) => ({
            data: response.data ?? [],
            pagination: response.pagination ?? null,
        }),
    });
}

export function useAssignmentDetail(id, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        queryKey: queryKeys.assignments.detail(id),
        queryFn: ({ signal }) =>
            unwrapApiData(assignmentsAPI.getAssignment(id, { signal })),
        enabled: Boolean(id) && enabled,
        select: (response) => response.data,
    });
}

export function getAssignmentTrackingUrlQueryOptions(assignmentId, params = {}) {
    return {
        ...referenceDataQueryDefaults,
        queryKey: queryKeys.assignments.trackingUrl(assignmentId, params),
        queryFn: ({ signal }) =>
            unwrapApiData(assignmentsAPI.getTrackingUrl(assignmentId, params, { signal })),
        select: (response) => response.data?.tracking_url ?? '',
    };
}

export function useAssignmentTrackingUrl(assignmentId, params = {}, options = {}) {
    const { enabled = true } = options;
    return useQuery({
        ...getAssignmentTrackingUrlQueryOptions(assignmentId, params),
        enabled: Boolean(assignmentId) && enabled,
    });
}

export function useAssignmentsTrackingUrls(assignmentIds, params = {}, options = {}) {
    const { enabled = true } = options;
    const uniqueIds = useMemo(
        () => [...new Set(assignmentIds.filter(Boolean))],
        [assignmentIds]
    );

    const queries = useQueries({
        queries: uniqueIds.map((assignmentId) => ({
            ...getAssignmentTrackingUrlQueryOptions(assignmentId, params),
            enabled: enabled && Boolean(assignmentId),
        })),
    });

    const byAssignmentId = useMemo(() => {
        const map = {};
        uniqueIds.forEach((assignmentId, index) => {
            const url = queries[index]?.data;
            if (url) {
                map[assignmentId] = url;
            }
        });
        return map;
    }, [uniqueIds, queries]);

    const loadingByAssignmentId = useMemo(() => {
        const map = {};
        uniqueIds.forEach((assignmentId, index) => {
            const result = queries[index];
            map[assignmentId] = Boolean(result?.isLoading && !result?.data);
        });
        return map;
    }, [uniqueIds, queries]);

    return { byAssignmentId, loadingByAssignmentId };
}

export function useCreateOrUpdateAssignments() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrapApiData(assignmentsAPI.createOrUpdateAssignments(data)),
        onSuccess: async () => {
            await Promise.all([
                invalidateListCaches(queryClient, queryKeys.assignments.lists()),
                queryClient.invalidateQueries({ queryKey: queryKeys.offers.all, refetchType: 'all' }),
            ]);
        },
    });
}

export function useUpdateAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => unwrapApiData(assignmentsAPI.updateAssignment(id, data)),
        onSuccess: async (response, { id }) => {
            const updated = response?.data;
            setAssignmentDetailCache(queryClient, id, updated);
            patchAssignmentsListCaches(queryClient, updated);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(id) }),
                invalidateListCaches(queryClient, queryKeys.assignments.lists()),
                queryClient.invalidateQueries({ queryKey: queryKeys.offers.all, refetchType: 'all' }),
            ]);
        },
    });
}

export function useDeleteAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrapApiData(assignmentsAPI.deleteAssignment(id)),
        onSuccess: async (_response, id) => {
            removeAssignmentFromListCaches(queryClient, { id });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all, refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: queryKeys.offers.all, refetchType: 'all' }),
            ]);
        },
    });
}
