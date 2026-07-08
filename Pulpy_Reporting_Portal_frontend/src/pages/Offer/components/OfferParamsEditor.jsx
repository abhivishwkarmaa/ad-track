import { emptyOfferParamRow } from '../utils/offerFormPayload';

/** Common pass-through keys (aligned with backend alias map). */
const PARAM_SUGGESTION_GROUPS = [
    {
        label: 'Sub IDs',
        items: [
            { key: 'sub1', tip: 'Primary tag — traffic source (e.g. facebook, google)' },
            { key: 'sub2', tip: 'Campaign or ad set name' },
            { key: 'sub3', tip: 'Ad / creative ID' },
            { key: 'sub4', tip: 'Placement or keyword' },
            { key: 'sub5', tip: 'Extra custom tag' },
        ],
    },
    {
        label: 'UTM / Campaign',
        items: [
            { key: 'source', tip: 'Traffic source (utm_source)' },
            { key: 'campaign', tip: 'Campaign name (utm_campaign)' },
            { key: 'creative', tip: 'Creative or content (utm_content)' },
            { key: 'keyword', tip: 'Keyword (utm_term)' },
        ],
    },
    {
        label: 'Ad placement',
        items: [
            { key: 'placement', tip: 'Where the ad was shown' },
            { key: 'ad_id', tip: 'Ad unit / creative ID from ad platform' },
            { key: 'ad_group', tip: 'Ad group or ad set ID' },
        ],
    },
];

/**
 * Dynamic URL pass-through parameters (offer_params table).
 */
export default function OfferParamsEditor({ params, onChange, disabled = false }) {
    const rows = Array.isArray(params) && params.length > 0 ? params : [emptyOfferParamRow()];

    const usedKeys = new Set(
        rows.map((r) => String(r.param_key || '').trim().toLowerCase()).filter(Boolean)
    );

    const updateRow = (index, field, value) => {
        const next = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
        onChange(next);
    };

    const addRow = () => {
        onChange([...rows, emptyOfferParamRow()]);
    };

    const removeRow = (index) => {
        const next = rows.filter((_, i) => i !== index);
        onChange(next.length > 0 ? next : [emptyOfferParamRow()]);
    };

    const addSuggestion = (key) => {
        const lower = key.toLowerCase();
        if (usedKeys.has(lower)) return;

        const emptyIndex = rows.findIndex((r) => !String(r.param_key || '').trim());
        if (emptyIndex >= 0) {
            updateRow(emptyIndex, 'param_key', key);
            return;
        }
        onChange([...rows, { ...emptyOfferParamRow(), param_key: key }]);
    };

    return (
        <div className="offer-params-editor">
            <p className="offer-form-hint" style={{ marginBottom: '12px', fontSize: '14px', color: '#64748b' }}>
                Define parameters affiliates must pass in the tracking URL (e.g. sub1, source).
                Required params are auto-added to generated tracking links as placeholders like {'{sub1}'}.
                Optional params use defaults when set, otherwise placeholders. Values are saved on each click.
            </p>

            <div className="offer-params-suggestions" style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                    Quick add (click to insert)
                </div>
                {PARAM_SUGGESTION_GROUPS.map((group) => (
                    <div key={group.label} style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{group.label}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {group.items.map((item) => {
                                const taken = usedKeys.has(item.key.toLowerCase());
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className={`btn btn-sm ${taken ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            fontFamily: 'ui-monospace, monospace',
                                            opacity: taken ? 0.55 : 1,
                                            cursor: taken || disabled ? 'not-allowed' : 'pointer',
                                        }}
                                        title={taken ? `${item.key} already added` : item.tip}
                                        disabled={disabled || taken}
                                        onClick={() => addSuggestion(item.key)}
                                    >
                                        {taken ? `✓ ${item.key}` : `+ ${item.key}`}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="offer-params-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="offer-params-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Parameter name</th>
                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', width: '100px' }}>Required</th>
                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Default value</th>
                            <th style={{ width: '48px', borderBottom: '1px solid #e2e8f0' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={index}>
                                <td style={{ padding: '8px 8px 8px 0', verticalAlign: 'middle' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={row.param_key}
                                        onChange={(e) => updateRow(index, 'param_key', e.target.value)}
                                        placeholder="sub1"
                                        maxLength={64}
                                        disabled={disabled}
                                    />
                                </td>
                                <td style={{ padding: '8px', verticalAlign: 'middle', textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(row.is_required)}
                                        onChange={(e) => updateRow(index, 'is_required', e.target.checked)}
                                        disabled={disabled}
                                        aria-label={`Required ${row.param_key || 'parameter'}`}
                                    />
                                </td>
                                <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={row.default_value ?? ''}
                                        onChange={(e) => updateRow(index, 'default_value', e.target.value)}
                                        placeholder="Optional default"
                                        maxLength={255}
                                        disabled={disabled}
                                    />
                                </td>
                                <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => removeRow(index)}
                                        disabled={disabled || rows.length <= 1}
                                        title="Remove row"
                                    >
                                        ×
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                style={{ marginTop: '10px' }}
                onClick={addRow}
                disabled={disabled}
            >
                + Add parameter
            </button>
        </div>
    );
}
