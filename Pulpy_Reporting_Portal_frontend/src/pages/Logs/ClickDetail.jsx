import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { logsAPI } from '../../services/api';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import {
    DetailCard,
    ExtraParamsBlock,
    FieldGrid,
    JsonBlock,
    LogNavLink,
    StatusBadge,
    formatLogDate,
    entityLink,
} from './LogDetailShared';
import './LogDetail.css';

function EntityCards({ offer, publisher, assignment }) {
    return (
        <>
            <DetailCard title="Offer">
                <FieldGrid
                    fields={[
                        {
                            label: 'Offer',
                            value: entityLink(
                                '/offer/detail',
                                offer?.public_offer_id,
                                `${offer?.public_offer_id} — ${offer?.name || ''}`
                            ),
                        },
                        { label: 'Status', value: <StatusBadge status={offer?.status} /> },
                        { label: 'Category', value: offer?.category },
                        { label: 'Default Payout', value: offer?.affiliate_amount != null ? `${offer?.offer_currency || ''} ${offer.affiliate_amount}${offer?.affiliate_model ? ` (${offer.affiliate_model})` : ''}` : '—' },
                        {
                            label: 'Advertiser',
                            value: offer?.public_advertiser_id
                                ? entityLink('/advertiser/detail', offer.public_advertiser_id, `${offer.public_advertiser_id} — ${offer.advertiser_name || ''}`)
                                : '—',
                        },
                        {
                            label: 'Preview URL',
                            value: offer?.preview_url ? (
                                <a href={offer.preview_url} target="_blank" rel="noreferrer" className="log-detail-link">
                                    {offer.preview_url}
                                </a>
                            ) : '—',
                        },
                    ]}
                />
            </DetailCard>

            <DetailCard title="Publisher">
                <FieldGrid
                    fields={[
                        {
                            label: 'Publisher',
                            value: entityLink(
                                '/affiliate/detail',
                                publisher?.public_publisher_id,
                                `${publisher?.public_publisher_id} — ${publisher?.company_name || publisher?.email || ''}`
                            ),
                        },
                        { label: 'Email', value: publisher?.email },
                        { label: 'Status', value: <StatusBadge status={publisher?.status} /> },
                        {
                            label: 'Global Postback URL',
                            value: publisher?.postback_url ? (
                                <span className="mono" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{publisher.postback_url}</span>
                            ) : '—',
                        },
                    ]}
                />
            </DetailCard>

            {assignment && (
                <DetailCard title="Assignment">
                    <FieldGrid
                        fields={[
                            {
                                label: 'Assignment ID',
                                value: assignment.public_assignment_id
                                    ? entityLink('/assignment/edit', assignment.public_assignment_id, String(assignment.public_assignment_id))
                                    : assignment.id,
                            },
                            { label: 'Status', value: <StatusBadge status={assignment.status} /> },
                            { label: 'Payout Override', value: assignment.payout_override ?? '—' },
                            { label: 'Callback URL', value: assignment.callback_url || '—', mono: true },
                            { label: 'Destination URL', value: assignment.destination_url || '—', mono: true },
                            {
                                label: 'Capping',
                                value: assignment.capping_type && assignment.capping_type !== 'none'
                                    ? `${assignment.capping_type} / ${assignment.capping_duration || ''} / ${assignment.capping_action || ''}`
                                    : 'None',
                            },
                        ]}
                    />
                </DetailCard>
            )}
        </>
    );
}

function ClickDetail() {
    const { clickUuid } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const response = await logsAPI.getClickDetail(clickUuid);
                if (cancelled) return;
                if (response.success && response.data) {
                    setDetail(response.data);
                } else {
                    toast.error('Click not found');
                    navigate(-1);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                    toast.error('Failed to load click details');
                    navigate(-1);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        if (clickUuid) load();
        return () => {
            cancelled = true;
        };
    }, [clickUuid, navigate, toast]);

    if (loading) {
        return (
            <div className="log-detail-page">
                <SkeletonDetail sections={4} />
            </div>
        );
    }

    if (!detail?.click) return null;

    const { click, conversion, offer, publisher, assignment, offer_params: offerParams, events } = detail;
    const eventList = Array.isArray(events) ? events : [];

    return (
        <div className="log-detail-page">
            <div className="log-detail-header">
                <div>
                    <h1>Click Detail</h1>
                    <p className="mono" style={{ fontFamily: 'monospace', fontSize: '13px' }}>{click.click_uuid}</p>
                </div>
                <div className="log-detail-header-actions">
                    {conversion?.conversion_uuid && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => navigate(`/logs/conversion/${encodeURIComponent(conversion.conversion_uuid)}`)}
                        >
                            View Conversion
                        </button>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        Back
                    </button>
                </div>
            </div>

            <DetailCard title="Click Event">
                <FieldGrid
                    fields={[
                        { label: 'Click UUID', value: click.click_uuid, mono: true },
                        { label: 'TID (Affiliate Click ID)', value: click.tid, mono: true },
                        { label: 'RCID', value: click.rcid, mono: true },
                        { label: 'Timestamp', value: formatLogDate(click.timestamp || click.created_at) },
                        { label: 'Created At', value: formatLogDate(click.created_at) },
                        {
                            label: 'Conversion',
                            value: conversion?.conversion_uuid ? (
                                <LogNavLink to={`/logs/conversion/${encodeURIComponent(conversion.conversion_uuid)}`}>
                                    {conversion.conversion_uuid}
                                </LogNavLink>
                            ) : (
                                <StatusBadge status="click only" />
                            ),
                        },
                        {
                            label: 'Conversion Status',
                            value: conversion?.status ? <StatusBadge status={conversion.status} /> : '—',
                        },
                    ]}
                />
            </DetailCard>

            {/* Events & Funnel Journey Card */}
            {eventList.length > 0 && (
                <DetailCard title={`Events & Funnel Journey (${eventList.length})`}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                    <th style={{ padding: '8px 10px' }}>#</th>
                                    <th style={{ padding: '8px 10px' }}>Event Name</th>
                                    <th style={{ padding: '8px 10px' }}>Role</th>
                                    <th style={{ padding: '8px 10px' }}>Revenue</th>
                                    <th style={{ padding: '8px 10px' }}>Payout</th>
                                    <th style={{ padding: '8px 10px' }}>Status</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Postback Fired</th>
                                    <th style={{ padding: '8px 10px' }}>Logged At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {eventList.map((ev, idx) => {
                                    const isConv = Boolean(ev.is_conversion);
                                    return (
                                        <tr
                                            key={ev.id || idx}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                background: isConv ? 'rgba(254, 243, 199, 0.2)' : 'transparent',
                                            }}
                                        >
                                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                                                    {ev.event_name}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                {isConv ? (
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        👑 Primary Goal
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                                        Funnel Signal
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                {offer?.offer_currency || '$'}{Number(ev.amount || 0).toFixed(2)}
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                {offer?.offer_currency || '$'}{Number(ev.payout || 0).toFixed(2)}
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <StatusBadge status={ev.status} />
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                {ev.affiliate_postback_fired ? (
                                                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '12px' }}>✓ Sent</span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '12px' }}>
                                                {formatLogDate(ev.created_at)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </DetailCard>
            )}

            <DetailCard title="Pass-through Parameters (extra_params)">
                <ExtraParamsBlock extraParams={click.extra_params} offerParams={offerParams} />
            </DetailCard>

            <DetailCard title="Network & Device">
                <FieldGrid
                    fields={[
                        { label: 'IP Address', value: click.ip },
                        { label: 'X-Forwarded-For', value: click.x_forwarded_for, mono: true },
                        { label: 'Country', value: click.country },
                        { label: 'Region', value: click.region },
                        { label: 'City', value: click.city },
                        { label: 'ISP', value: click.isp },
                        { label: 'Domain', value: click.domain },
                        { label: 'Device', value: [click.device_type, click.os, click.os_version].filter(Boolean).join(' / ') || '—' },
                        { label: 'Browser', value: click.browser },
                        { label: 'Device Brand / Model', value: [click.device_brand, click.device_model].filter(Boolean).join(' ') || '—' },
                        { label: 'Referrer', value: click.referrer || 'Direct' },
                        { label: 'User Agent', value: click.user_agent, mono: true },
                    ]}
                />
            </DetailCard>

            <DetailCard title="Tracking IDs">
                <FieldGrid
                    fields={[
                        { label: 'Source ID', value: click.source_id, mono: true },
                        { label: 'Device ID', value: click.device_id, mono: true },
                        { label: 'Google ID', value: click.google_id, mono: true },
                        { label: 'Android ID', value: click.android_id, mono: true },
                        { label: 'Auth Token', value: click.authorization_token, mono: true },
                    ]}
                />
            </DetailCard>

            <EntityCards offer={offer} publisher={publisher} assignment={assignment} />

            {click.location && (
                <DetailCard title="Raw Location JSON">
                    <JsonBlock data={click.location} />
                </DetailCard>
            )}
        </div>
    );
}

export default ClickDetail;
