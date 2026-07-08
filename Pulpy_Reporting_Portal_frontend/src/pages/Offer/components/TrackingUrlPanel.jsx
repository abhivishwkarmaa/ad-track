import { useState } from 'react';
import { copyToClipboard as safeCopyToClipboard } from '../../../utils/clipboard';
import { useToast } from '../../../context/ToastContext';
import { normalizeTrackingUrlMeta } from '../utils/trackingUrlUtils';

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
);

const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const ExternalLinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

/**
 * Full tracking URL with offer param placeholders + publisher instructions.
 */
export default function TrackingUrlPanel({
    trackingMeta,
    loading = false,
    onGenerate,
    copyId = 'default',
    compact = false,
}) {
    const toast = useToast();
    const [copied, setCopied] = useState(false);
    const { tracking_url: trackingUrl, offer_params: offerParams, required_params: requiredParams } =
        normalizeTrackingUrlMeta(trackingMeta);

    const handleCopy = async () => {
        if (!trackingUrl) return;
        const result = await safeCopyToClipboard(trackingUrl);
        if (result.success) {
            setCopied(true);
            toast.success('Tracking URL copied');
            setTimeout(() => setCopied(false), 2000);
        } else {
            toast.error('Failed to copy');
        }
    };

    if (loading) {
        return <div className="url-skeleton" />;
    }

    if (!trackingUrl) {
        if (!onGenerate) {
            return <div className="tracking-url-placeholder">Tracking URL not available</div>;
        }
        return (
            <button type="button" className="copy-btn generate" onClick={onGenerate}>
                Generate Link
            </button>
        );
    }

    return (
        <div className="tracking-url-panel">
            <div className={`tracking-url-wrapper has-url${compact ? ' tracking-url-wrapper-compact' : ''}`}>
                <div className="tracking-url-display">{trackingUrl}</div>
                <button
                    type="button"
                    className={`copy-btn${copied ? ' copied' : ''}`}
                    onClick={handleCopy}
                    title="Copy tracking URL"
                >
                    {copied ? (
                        <>
                            <CheckIcon />
                            <span>Copied</span>
                        </>
                    ) : (
                        <>
                            <CopyIcon />
                            <span>Copy</span>
                        </>
                    )}
                </button>
                <button
                    type="button"
                    className="copy-btn generate"
                    onClick={() => window.open(trackingUrl, '_blank')}
                    title="Open tracking URL"
                    style={{ marginLeft: '8px' }}
                >
                    <ExternalLinkIcon />
                    <span>Open</span>
                </button>
            </div>

            {offerParams.length > 0 && (
                <div className="tracking-url-params-help" style={{ marginTop: '10px', fontSize: '13px', color: '#64748b' }}>
                    <strong style={{ color: '#334155' }}>URL parameters included:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                        {offerParams.map((p) => (
                            <li key={p.param_key}>
                                <code>{p.param_key}</code>
                                {p.is_required ? ' (required)' : ' (optional)'}
                                {p.default_value ? ` — default: ${p.default_value}` : ` — replace {${p.param_key}} with your value`}
                            </li>
                        ))}
                    </ul>
                    {requiredParams.length > 0 && (
                        <p style={{ margin: '8px 0 0' }}>
                            Replace placeholders before sending traffic:{' '}
                            <code>{requiredParams.map((k) => `{${k}}`).join(', ')}</code>
                        </p>
                    )}
                </div>
            )}

            {offerParams.length === 0 && (
                <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#64748b' }}>
                    No extra parameters on this offer. Send this link as-is to your publisher.
                </p>
            )}
        </div>
    );
}
