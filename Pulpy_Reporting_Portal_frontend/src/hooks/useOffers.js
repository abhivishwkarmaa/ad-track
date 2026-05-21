import { useState, useEffect, useCallback } from 'react';
import { offersAPI } from '../services/api';
import { isAbortError } from './useAbortableRequest';

/**
 * Hook to fetch offer details for editing
 * @param {string|number} id - The ID of the offer to fetch
 * @param {boolean} shouldFetch - Whether to fetch immediately (default: true)
 * @returns {Object} Data, loading state, error, and refetch function
 */
export const useOfferForEdit = (id, shouldFetch = true) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(shouldFetch);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async (signal) => {
        if (!id) return;

        try {
            setLoading(true);
            setError(null);
            const response = await offersAPI.getOfferForEdit(id, signal ? { signal } : {});
            if (response.success) {
                setData(response.data);
            } else {
                setError(response.message || 'Failed to fetch offer details');
            }
        } catch (err) {
            if (!isAbortError(err)) {
                console.error(`Error fetching offer ${id} for edit:`, err);
                setError(err.message || 'An error occurred while fetching offer details');
            }
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [id]);

    useEffect(() => {
        if (!shouldFetch || !id) return undefined;

        const controller = new AbortController();
        fetchData(controller.signal);
        return () => controller.abort();
    }, [shouldFetch, fetchData, id]);

    return {
        data,
        loading,
        error,
        refetch: () => fetchData(),
    };
};

/**
 * Hook to fetch all offers with pagination and filtering
 * @param {Object} initialParams - Initial query parameters
 * @returns {Object} Offers data, loading state, error, pagination controls
 */
export const useOffers = (initialParams = {}) => {
    const [data, setData] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [params, setParams] = useState(initialParams);

    useEffect(() => {
        const controller = new AbortController();

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await offersAPI.getOffers(params, { signal: controller.signal });
                if (response.success) {
                    setData(response.data);
                    if (response.pagination) {
                        setPagination(response.pagination);
                    }
                } else {
                    setError(response.message || 'Failed to fetch offers');
                }
            } catch (err) {
                if (!isAbortError(err)) {
                    console.error('Error fetching offers:', err);
                    setError(err.message || 'An error occurred while fetching offers');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchData();
        return () => controller.abort();
    }, [params]);

    const updateParams = (newParams) => {
        setParams(prev => ({ ...prev, ...newParams }));
    };

    const refetch = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await offersAPI.getOffers(params);
            if (response.success) {
                setData(response.data);
                if (response.pagination) {
                    setPagination(response.pagination);
                }
            } else {
                setError(response.message || 'Failed to fetch offers');
            }
        } catch (err) {
            console.error('Error fetching offers:', err);
            setError(err.message || 'An error occurred while fetching offers');
        } finally {
            setLoading(false);
        }
    }, [params]);

    return { data, pagination, loading, error, refetch, updateParams };
};

export default {
    useOfferForEdit,
    useOffers
};
