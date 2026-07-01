/**
 * Shared loading flags for entity list pages.
 * isInitialLoad — first fetch only (skeleton in table card).
 * isRefreshing — filter/pagination refetch (progress bar, dim table).
 */
export function useEntityListQueryState({ isLoading, isFetching, data, error, refetch }) {
    const isInitialLoad = isLoading && data === undefined;
    const isRefreshing = isFetching && !isInitialLoad;

    return {
        isInitialLoad,
        isRefreshing,
        error: error?.message ?? null,
        refetch,
    };
}
