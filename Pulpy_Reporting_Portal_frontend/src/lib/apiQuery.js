/**
 * Unwrap standard API `{ success, data, pagination, message }` responses for useQuery.
 * Throws on failure so TanStack Query can surface errors.
 */
export async function unwrapApiData(apiCall) {
    const response = await apiCall;
    if (response?.success) {
        return response;
    }
    throw new Error(response?.message || 'Request failed');
}
