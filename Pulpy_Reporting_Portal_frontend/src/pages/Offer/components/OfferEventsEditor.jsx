import { useState } from 'react';
import { emptyOfferEventRow } from '../utils/offerFormPayload';

const EVENT_SUGGESTIONS = [
    { key: 'install', title: 'App Install', tip: 'User downloaded and opened app' },
    { key: 'registration', title: 'User Registration', tip: 'User created account or OTP verified' },
    { key: 'first_deposit', title: 'First Deposit (FTD)', tip: 'User made first deposit or purchase' },
    { key: 'deposit', title: 'Repeat Deposit', tip: 'Subsequent cash deposits (allow multiple)', multiple: true },
    { key: 'kyc', title: 'KYC Verified', tip: 'User completed identity verification' },
    { key: 'lead', title: 'Lead Form', tip: 'User submitted lead inquiry form' },
];

export default function OfferEventsEditor({
    events,
    onChange,
    disabled = false,
    currency = 'USD',
    defaultAdvertiserAmount = '',
    defaultAffiliateAmount = '',
    onPrimaryPricingChange = null,
}) {
    const [copied, setCopied] = useState(false);
    const rows = Array.isArray(events) ? events : [];

    const usedKeys = new Set(
        rows.map((r) => String(r.event_name || '').trim().toLowerCase()).filter(Boolean)
    );

    const setPrimaryRow = (index) => {
        const next = rows.map((row, i) => ({
            ...row,
            is_primary: i === index,
        }));
        onChange(next);
        if (onPrimaryPricingChange && rows[index]) {
            onPrimaryPricingChange({
                advertiser_amount: rows[index].advertiser_amount ?? '',
                affiliate_amount: rows[index].affiliate_amount ?? '',
            });
        }
    };

    const updateRow = (index, field, value) => {
        const next = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
        onChange(next);
        if (rows[index]?.is_primary && onPrimaryPricingChange && (field === 'advertiser_amount' || field === 'affiliate_amount')) {
            onPrimaryPricingChange({ [field]: value });
        }
    };

    const addRow = (defaults = {}) => {
        const isFirst = rows.length === 0;
        const initialAdv = isFirst ? (defaults.advertiser_amount ?? defaultAdvertiserAmount ?? '') : (defaults.advertiser_amount ?? '');
        const initialAff = isFirst ? (defaults.affiliate_amount ?? defaultAffiliateAmount ?? '') : (defaults.affiliate_amount ?? '');
        onChange([...rows, {
            ...emptyOfferEventRow(),
            is_primary: isFirst,
            advertiser_amount: initialAdv,
            affiliate_amount: initialAff,
            ...defaults
        }]);
    };

    const removeRow = (index) => {
        const remaining = rows.filter((_, i) => i !== index);
        // If we removed the primary goal and other rows exist, make the first remaining primary
        if (rows[index]?.is_primary && remaining.length > 0 && !remaining.some(r => r.is_primary)) {
            remaining[0].is_primary = true;
            if (onPrimaryPricingChange) {
                onPrimaryPricingChange({
                    advertiser_amount: remaining[0].advertiser_amount ?? '',
                    affiliate_amount: remaining[0].affiliate_amount ?? '',
                });
            }
        }
        onChange(remaining);
    };

    const addSuggestion = (item) => {
        const key = item.key.toLowerCase();
        if (usedKeys.has(key)) return;

        const isFirst = rows.length === 0;
        const emptyIndex = rows.findIndex((r) => !String(r.event_name || '').trim());
        if (emptyIndex >= 0) {
            const next = rows.map((row, i) =>
                i === emptyIndex
                    ? {
                          ...row,
                          event_name: key,
                          title: item.title,
                          allow_multiple: Boolean(item.multiple),
                          is_primary: row.is_primary || (isFirst && i === 0),
                          advertiser_amount: row.advertiser_amount || ((row.is_primary || (isFirst && i === 0)) ? defaultAdvertiserAmount : ''),
                          affiliate_amount: row.affiliate_amount || ((row.is_primary || (isFirst && i === 0)) ? defaultAffiliateAmount : ''),
                      }
                    : row
            );
            onChange(next);
            return;
        }

        addRow({
            event_name: key,
            title: item.title,
            allow_multiple: Boolean(item.multiple),
            is_primary: isFirst,
            advertiser_amount: isFirst ? defaultAdvertiserAmount : '',
            affiliate_amount: isFirst ? defaultAffiliateAmount : '',
        });
    };

    const copyPostbackTemplate = () => {
        const host = window.location.hostname || 'track.yourdomain.com';
        const url = `https://${host}/postback?click_id={click_id}&event={event_name}&amount={amount}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    };

    const host = window.location.hostname || 'track.yourdomain.com';
    const samplePostback = `https://${host}/postback?click_id={click_id}&event={event_name}&amount={amount}`;

    return (
        <div className="offer-events-editor">
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', marginBottom: '4px' }}>
                    🎯 Multi-Event Tracking & Conversion Architecture
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                    Advertisers can fire callbacks for multiple steps along the funnel (e.g. <code>install</code> ➡️ <code>registration</code> ➡️ <code>deposit</code>).
                    <strong style={{ color: '#0f172a' }}> Exactly ONE event is your Primary Goal</strong> (billable conversion, consumes caps, increments stats).
                    Other events are recorded in event history and forwarded to publisher/Google Ads with <code>{'{event}'}</code> so bidding algorithms optimize automatically.
                </p>
            </div>

            {/* Quick add chips */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                    Quick add event templates:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {EVENT_SUGGESTIONS.map((item) => {
                        const taken = usedKeys.has(item.key.toLowerCase());
                        return (
                            <button
                                key={item.key}
                                type="button"
                                className={`btn btn-sm ${taken ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '12px',
                                    borderRadius: '6px',
                                    opacity: taken ? 0.5 : 1,
                                    cursor: taken || disabled ? 'not-allowed' : 'pointer',
                                }}
                                onClick={() => !taken && !disabled && addSuggestion(item)}
                                title={taken ? `${item.key} already added` : item.tip}
                                disabled={taken || disabled}
                            >
                                + {item.title} (<code>{item.key}</code>)
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Events Table */}
            {rows.length > 0 ? (
                <div style={{ overflowX: 'auto', marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'center', width: '130px' }} title="The primary event that counts as official billable conversion and consumes offer caps">
                                    Primary Goal*
                                </th>
                                <th style={{ padding: '10px 12px' }}>Event Code*</th>
                                <th style={{ padding: '10px 12px' }}>Display Title</th>
                                <th style={{ padding: '10px 12px' }}>Revenue ({currency})</th>
                                <th style={{ padding: '10px 12px' }}>Payout ({currency})</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center' }} title="Allow multiple conversions per click for this event (e.g. repeat purchase)">
                                    Allow Multiples?
                                </th>
                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => {
                                const isPrimary = Boolean(row.is_primary);
                                return (
                                    <tr
                                        key={index}
                                        style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            background: isPrimary ? 'rgba(254, 243, 199, 0.25)' : 'transparent',
                                            transition: 'background 0.2s',
                                        }}
                                    >
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'default' : 'pointer', margin: 0 }}>
                                                <input
                                                    type="radio"
                                                    name="primary_event_goal"
                                                    checked={isPrimary}
                                                    onChange={() => setPrimaryRow(index)}
                                                    disabled={disabled}
                                                    style={{ cursor: disabled ? 'default' : 'pointer', width: '15px', height: '15px' }}
                                                />
                                                {isPrimary ? (
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                                        👑 Main Goal
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                        Signal
                                                    </span>
                                                )}
                                            </label>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <input
                                                type="text"
                                                className="form-control form-control-sm"
                                                placeholder="e.g. install"
                                                value={row.event_name}
                                                onChange={(e) => updateRow(index, 'event_name', e.target.value.toLowerCase())}
                                                disabled={disabled}
                                                style={{ fontFamily: 'ui-monospace, monospace' }}
                                                required
                                            />
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <input
                                                type="text"
                                                className="form-control form-control-sm"
                                                placeholder="e.g. App Install"
                                                value={row.title}
                                                onChange={(e) => updateRow(index, 'title', e.target.value)}
                                                disabled={disabled}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 12px', width: '130px' }}>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                className="form-control form-control-sm"
                                                placeholder="0.00"
                                                value={row.advertiser_amount}
                                                onChange={(e) => updateRow(index, 'advertiser_amount', e.target.value)}
                                                disabled={disabled}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 12px', width: '130px' }}>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                className="form-control form-control-sm"
                                                placeholder="0.00"
                                                value={row.affiliate_amount}
                                                onChange={(e) => updateRow(index, 'affiliate_amount', e.target.value)}
                                                disabled={disabled}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(row.allow_multiple)}
                                                onChange={(e) => updateRow(index, 'allow_multiple', e.target.checked)}
                                                disabled={disabled}
                                                style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                                                title="Check this if one user/click can trigger this event multiple times"
                                            />
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => removeRow(index)}
                                                disabled={disabled}
                                                style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px' }}
                                            >
                                                ✕ Remove
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center', marginBottom: '16px' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748b' }}>
                        No multi-event goals defined. This offer will use standard single conversion tracking.
                    </p>
                    <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => addRow()}
                        disabled={disabled}
                    >
                        + Add First Event
                    </button>
                </div>
            )}

            {rows.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => addRow()}
                        disabled={disabled}
                    >
                        + Add Another Event
                    </button>
                </div>
            )}

            {/* Advertiser Postback Guide Box */}
            <div style={{ background: '#f1f5f9', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #3b82f6', marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                        📢 Advertiser Postback URL Template:
                    </span>
                    <button
                        type="button"
                        onClick={copyPostbackTemplate}
                        style={{
                            background: copied ? '#10b981' : '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer'
                        }}
                    >
                        {copied ? '✓ Copied!' : 'Copy Template'}
                    </button>
                </div>
                <code style={{ display: 'block', padding: '8px', background: '#fff', borderRadius: '4px', fontSize: '12px', color: '#0f172a', wordBreak: 'break-all' }}>
                    {samplePostback}
                </code>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Ask the advertiser / MMP to replace <code>{'{event_name}'}</code> with the event code (e.g. <code>install</code>, <code>registration</code>, <code>deposit</code>).
                </p>
            </div>
        </div>
    );
}
