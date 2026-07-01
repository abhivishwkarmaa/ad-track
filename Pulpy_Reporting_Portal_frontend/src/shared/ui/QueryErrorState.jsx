/**
 * Standard error state for React Query list/detail pages.
 */
export default function QueryErrorState({ error, onRetry }) {
    const message = typeof error === 'string' ? error : error?.message ?? 'Something went wrong';

    return (
        <div className="query-error-state">
            <p className="query-error-state-message">Error: {message}</p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
                Retry
            </button>
        </div>
    );
}
