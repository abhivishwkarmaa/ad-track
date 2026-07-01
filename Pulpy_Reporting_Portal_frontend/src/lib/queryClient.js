import { QueryClient, keepPreviousData } from '@tanstack/react-query';

/** Default options for reference data (offers, advertisers, etc.) */
export const referenceDataQueryDefaults = {
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    // Fresh cache: no refetch on navigation. After invalidate (edit/save): stale → refetch on mount.
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
};

/** List pages — keep previous rows visible while filters/pagination refetch */
export const listQueryDefaults = {
    ...referenceDataQueryDefaults,
    placeholderData: keepPreviousData,
};

/** Offer detail stats: short cache to avoid refetch on quick back-navigation. */
export const OFFER_STATS_STALE_MS = 3000;
export const offerStatsQueryDefaults = {
    staleTime: OFFER_STATS_STALE_MS,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
};

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: referenceDataQueryDefaults,
    },
});
