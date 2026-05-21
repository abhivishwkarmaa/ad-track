import { useEffect, useRef } from 'react';

export const isAbortError = (err) => err?.name === 'AbortError';

/**
 * Creates a fresh AbortController when deps change and aborts on cleanup.
 * @param {unknown[]} deps - dependency array (same semantics as useEffect)
 * @returns {() => AbortSignal | undefined} getter for the current request signal
 */
export function useAbortableRequest(deps) {
    const controllerRef = useRef(null);

    useEffect(() => {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
        return () => {
            controllerRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns dep list
    }, deps);

    return () => controllerRef.current?.signal;
}
