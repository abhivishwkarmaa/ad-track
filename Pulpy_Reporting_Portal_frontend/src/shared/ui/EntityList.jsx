import { ClearIcon, SearchIcon } from './icons';
import { SkeletonTable } from '../../components/Skeleton/Skeleton';
import QueryErrorState from './QueryErrorState';

export function EntityListPage({ children, className = '' }) {
    return <div className={`entity-list-page ${className}`.trim()}>{children}</div>;
}

export function EntityListHeader({ title, subtitle, action }) {
    return (
        <div className="entity-list-header">
            <div className="entity-list-header-text">
                <h1>{title}</h1>
                {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {action}
        </div>
    );
}

export function EntityListToolbar({ children }) {
    return <div className="entity-list-toolbar">{children}</div>;
}

export function EntityListSearch({
    value,
    onChange,
    placeholder = 'Search...',
    onClear,
}) {
    return (
        <div className="entity-list-search">
            <span className="entity-list-search-icon">
                <SearchIcon size={18} />
            </span>
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={onChange}
            />
            {value && onClear ? (
                <button
                    type="button"
                    className="entity-list-search-clear"
                    onClick={onClear}
                    aria-label="Clear search"
                >
                    <ClearIcon size={14} />
                </button>
            ) : null}
        </div>
    );
}

export function EntityListFilterSelect({ value, onChange, children, className = '' }) {
    return (
        <select
            className={`entity-list-filter-select form-control ${className}`.trim()}
            value={value}
            onChange={onChange}
        >
            {children}
        </select>
    );
}

export function EntityListFilterActions({ onApply, onReset, applyDisabled = false, showReset = true }) {
    return (
        <div className="entity-list-filter-actions">
            <button
                type="button"
                className="btn btn-primary entity-list-apply-btn"
                onClick={onApply}
                disabled={applyDisabled}
            >
                Apply
            </button>
            {showReset ? (
                <button
                    type="button"
                    className="btn btn-secondary entity-list-reset-btn"
                    onClick={onReset}
                >
                    Reset
                </button>
            ) : null}
        </div>
    );
}

export function EntityListRefreshBar() {
    return <div className="entity-list-refresh-bar" aria-hidden="true" />;
}

export function EntityListCard({ children, className = '' }) {
    return <div className={`entity-list-card ${className}`.trim()}>{children}</div>;
}

export function EntityListBody({
    isInitialLoad,
    isRefreshing,
    error,
    onRetry,
    tableRows = 8,
    tableCols = 5,
    children,
}) {
    if (error) {
        return (
            <EntityListCard>
                <div className="entity-list-error-wrap">
                    <QueryErrorState error={error} onRetry={onRetry} />
                </div>
            </EntityListCard>
        );
    }

    return (
        <>
            {isRefreshing ? <EntityListRefreshBar /> : null}
            <EntityListCard>
                {isInitialLoad ? (
                    <SkeletonTable rows={tableRows} cols={tableCols} />
                ) : (
                    <div className={`entity-list-card-body${isRefreshing ? ' is-refreshing' : ''}`}>
                        {children}
                    </div>
                )}
            </EntityListCard>
        </>
    );
}

export function EntityListTableWrap({ children }) {
    return <div className="entity-list-table-wrap">{children}</div>;
}

export function EntityListEmpty({ colSpan, message = 'No records found' }) {
    return (
        <tr>
            <td colSpan={colSpan} className="entity-list-empty">
                <div className="entity-list-empty-icon" aria-hidden="true">—</div>
                {message}
            </td>
        </tr>
    );
}

export function StatusBadge({ status, className = '' }) {
    const key = String(status || 'unknown').toLowerCase().replace(/\s+/g, '_');
    return (
        <span className={`entity-list-status ${key} ${className}`.trim()}>
            {status}
        </span>
    );
}

export function EntityListPagination({
    currentPage,
    totalPages,
    total,
    itemsPerPage,
    onPageChange,
}) {
    if (!total || total <= 0) return null;

    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, total);

    const pageNumbers = Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
        if (totalPages <= 10) return i + 1;
        if (currentPage <= 5) return i + 1;
        if (currentPage >= totalPages - 4) return totalPages - 9 + i;
        return currentPage - 5 + i;
    });

    return (
        <div className="entity-list-pagination">
            <div className="entity-list-pagination-info">
                Showing {start} to {end} of {total} entries
            </div>
            <div className="entity-list-pagination-buttons">
                <button
                    type="button"
                    className="entity-list-pagination-btn"
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                >
                    Previous
                </button>
                {pageNumbers.map((page) => (
                    <button
                        key={page}
                        type="button"
                        className={`entity-list-pagination-btn ${currentPage === page ? 'active' : ''}`}
                        onClick={() => onPageChange(page)}
                    >
                        {page}
                    </button>
                ))}
                <button
                    type="button"
                    className="entity-list-pagination-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
