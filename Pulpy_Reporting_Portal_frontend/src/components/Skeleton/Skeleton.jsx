import './Skeleton.css';

// Base shimmer element
export const SkeletonBox = ({ style = {}, className = '' }) => (
    <div className={`skeleton-base ${className}`} style={style} />
);

// Table skeleton - rows x cols
export const SkeletonTable = ({ rows = 8, cols = 5 }) => {
    const gridCols = `repeat(${cols}, minmax(80px, 1fr))`;
    return (
        <div className="skeleton-table-wrap">
            <div className="skeleton-table-header" style={{ gridTemplateColumns: gridCols }}>
                {Array.from({ length: cols }).map((_, i) => (
                    <SkeletonBox key={i} style={{ height: 14 }} />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, ri) => (
                <div key={ri} className="skeleton-table-row" style={{ gridTemplateColumns: gridCols }}>
                    {Array.from({ length: cols }).map((_, ci) => (
                        <SkeletonBox key={ci} style={{ height: 12 }} />
                    ))}
                </div>
            ))}
        </div>
    );
};

// List skeleton - card-like rows
export const SkeletonList = ({ rows = 5 }) => (
    <div className="skeleton-list">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="skeleton-list-item">
                <SkeletonBox style={{ height: 16, width: '60%' }} />
                <SkeletonBox style={{ height: 12, width: '40%' }} />
            </div>
        ))}
    </div>
);

// Stat card skeleton
export const SkeletonStatCard = () => (
    <div className="skeleton-stat-card">
        <SkeletonBox style={{ width: 36, height: 36, borderRadius: 6 }} />
        <SkeletonBox style={{ height: 18, width: 60 }} />
        <SkeletonBox style={{ height: 12, width: 80 }} />
    </div>
);

// Detail/Form page skeleton - header + form blocks
export const SkeletonDetail = ({ sections = 3 }) => (
    <div className="skeleton-detail">
        <div className="skeleton-detail-header">
            <SkeletonBox style={{ height: 28, width: 220 }} />
            <SkeletonBox style={{ height: 14, width: 300, marginTop: 8 }} />
            <div className="skeleton-detail-actions">
                <SkeletonBox style={{ height: 36, width: 120 }} />
                <SkeletonBox style={{ height: 36, width: 100 }} />
            </div>
        </div>
        <div className="skeleton-detail-body">
            {Array.from({ length: sections }).map((_, i) => (
                <div key={i} className="skeleton-detail-section">
                    <SkeletonBox style={{ height: 18, width: 160, marginBottom: 12 }} />
                    <div className="skeleton-detail-fields">
                        {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j} className="skeleton-field">
                                <SkeletonBox style={{ height: 12, width: 80, marginBottom: 6 }} />
                                <SkeletonBox style={{ height: 36, width: '100%' }} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// Full page skeleton for list pages (header + filters + table)
export const SkeletonPage = ({ title = true, filters = true, tableRows = 8, tableCols = 5 }) => (
    <div className="skeleton-page">
        <div className="skeleton-page-header">
            <div>
                {title && <SkeletonBox style={{ height: 26, width: 200 }} />}
                {title && <SkeletonBox style={{ height: 14, width: 280, marginTop: 8 }} />}
            </div>
            <SkeletonBox style={{ height: 40, width: 140 }} />
        </div>
        {filters && (
            <div className="skeleton-page-filters">
                <SkeletonBox style={{ height: 40, flex: 1, maxWidth: 280 }} />
                <SkeletonBox style={{ height: 40, width: 150 }} />
            </div>
        )}
        <div className="skeleton-page-content">
            <SkeletonTable rows={tableRows} cols={tableCols} />
        </div>
    </div>
);

export default {
    SkeletonBox,
    SkeletonTable,
    SkeletonList,
    SkeletonStatCard,
    SkeletonDetail,
    SkeletonPage
};
