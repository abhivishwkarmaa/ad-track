import { Link } from 'react-router-dom';
import { formatDateTimeIST } from '../../utils/dateTime';
import './LogDetail.css';

export function LogNavLink({ to, children, className = 'log-row-link' }) {
    if (!to) return <span>{children ?? '—'}</span>;
    return (
        <Link to={to} className={className} onClick={(e) => e.stopPropagation()}>
            {children}
        </Link>
    );
}

export function StatusBadge({ status }) {
    const normalized = (status || 'neutral').toLowerCase();
    return <span className={`log-status-badge ${normalized}`}>{status || '—'}</span>;
}

export function DetailCard({ title, children }) {
    return (
        <div className="log-detail-card">
            {title && <h2>{title}</h2>}
            {children}
        </div>
    );
}

export function FieldGrid({ fields }) {
    return (
        <div className="log-detail-grid">
            {fields.map((field) => (
                <div className="log-detail-field" key={field.label}>
                    <label>{field.label}</label>
                    <div className={`value${field.mono ? ' mono' : ''}`}>{field.value ?? '—'}</div>
                </div>
            ))}
        </div>
    );
}

export function ExtraParamsBlock({ extraParams, offerParams = [] }) {
    const parsed =
        extraParams && typeof extraParams === 'object'
            ? extraParams
            : extraParams
              ? (() => {
                    try {
                        return JSON.parse(extraParams);
                    } catch {
                        return null;
                    }
                })()
              : null;

    const entries = parsed && typeof parsed === 'object' ? Object.entries(parsed) : [];

    if (entries.length === 0) {
        return <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>No pass-through parameters on this event.</p>;
    }

    const defByKey = {};
    offerParams.forEach((p) => {
        if (p?.param_key) defByKey[p.param_key] = p;
    });

    return (
        <table className="log-detail-params-table">
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th>Required</th>
                    <th>Default (offer)</th>
                </tr>
            </thead>
            <tbody>
                {entries.map(([key, value]) => (
                    <tr key={key}>
                        <td><code>{key}</code></td>
                        <td>{value}</td>
                        <td>{defByKey[key]?.is_required ? 'Yes' : 'No'}</td>
                        <td>{defByKey[key]?.default_value || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function JsonBlock({ data, label }) {
    if (data == null) return null;
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return (
        <div style={{ marginTop: label ? '12px' : 0 }}>
            {label && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{label}</div>}
            <pre className="log-detail-json">{text}</pre>
        </div>
    );
}

export function formatLogDate(value) {
    if (!value) return '—';
    return formatDateTimeIST(value) || String(value);
}

export function entityLink(path, id, label) {
    if (!id) return '—';
    return (
        <Link to={`${path}/${id}`} className="log-detail-link">
            {label ?? id}
        </Link>
    );
}
