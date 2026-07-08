import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { dashboardAPI, logsAPI } from '../../services/api';
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
                        { label: 'Global Postback URL', value: publisher?.postback_url || '—', mono: true },
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
                        ]}
                    />
                </DetailCard>
            )}
        </>
    );
}

function ConversionDetail() {
    const { conversionUuid } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [approving, setApproving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const response = await logsAPI.getConversionDetail(conversionUuid);
                if (cancelled) return;
                if (response.success && response.data) {
                    setDetail(response.data);
                } else {
                    toast.error('Conversion not found');
                    navigate(-1);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                    toast.error('Failed to load conversion details');
                    navigate(-1);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        if (conversionUuid) load();
        return () => {
            cancelled = true;
        };
    }, [conversionUuid, navigate, toast]);

    const handleApprove = async () => {
        if (!detail?.click?.click_uuid) return;
        if (!window.confirm('Manually approve this conversion?')) return;
        setApproving(true);
        try {
            const response = await dashboardAPI.approveClick(detail.click.click_uuid);
            if (response.success) {
                toast.success(response.already_approved ? 'Already approved' : 'Conversion approved');
                const refreshed = await logsAPI.getConversionDetail(conversionUuid);
                if (refreshed.success) setDetail(refreshed.data);
            } else {
                toast.error(response.message || 'Failed to approve');
            }
        } catch (err) {
            toast.error(err.message || 'Failed to approve');
        } finally {
            setApproving(false);
        }
    };

    if (loading) {
        return (
            <div className="log-detail-page">
                <SkeletonDetail sections={4} />
            </div>
        );
    }

    if (!detail?.conversion) return null;

    const { conversion, click, offer, publisher, assignment, offer_params: offerParams } = detail;
    const status = (conversion.status || '').toLowerCase();
    const canApprove = ['pending', 'click_expired', 'rejected', 'rejected_cap'].includes(status);

    return (
        <div className="log-detail-page">
            <div className="log-detail-header">
                <div>
                    <h1>Conversion Detail</h1>
                    <p className="mono" style={{ fontFamily: 'monospace', fontSize: '13px' }}>{conversion.conversion_uuid}</p>
                </div>
                <div className="log-detail-header-actions">
                    {canApprove && click?.click_uuid && (
                        <button type="button" className="btn btn-primary" onClick={handleApprove} disabled={approving}>
                            {approving ? 'Approving…' : 'Approve Conversion'}
                        </button>
                    )}
                    {click?.click_uuid && (
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => navigate(`/logs/click/${encodeURIComponent(click.click_uuid)}`)}
                        >
                            View Click
                        </button>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        Back
                    </button>
                </div>
            </div>

            <DetailCard title="Conversion">
                <FieldGrid
                    fields={[
                        { label: 'Conversion UUID', value: conversion.conversion_uuid, mono: true },
                        {
                            label: 'Click UUID',
                            value: click?.click_uuid ? (
                                <LogNavLink to={`/logs/click/${encodeURIComponent(click.click_uuid)}`}>
                                    {click.click_uuid}
                                </LogNavLink>
                            ) : conversion.click_uuid,
                            mono: true,
                        },
                        { label: 'RCID', value: conversion.rcid, mono: true },
                        { label: 'Status', value: <StatusBadge status={conversion.status} /> },
                        { label: 'Revenue (Amount)', value: conversion.amount != null ? `$${Number(conversion.amount).toFixed(2)}` : '—' },
                        { label: 'Publisher Payout', value: conversion.payout != null ? `$${Number(conversion.payout).toFixed(2)}` : '—' },
                        { label: 'IP', value: conversion.ip || click?.ip },
                        { label: 'Timestamp', value: formatLogDate(conversion.timestamp || conversion.created_at) },
                        { label: 'Created At', value: formatLogDate(conversion.created_at) },
                        { label: 'Updated At', value: formatLogDate(conversion.updated_at) },
                        { label: 'Test Conversion', value: conversion.is_test ? 'Yes' : 'No' },
                        { label: 'Affiliate Postback Fired', value: conversion.affiliate_postback_fired ? 'Yes' : 'No' },
                    ]}
                />
            </DetailCard>

            <DetailCard title="Pass-through Parameters">
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>
                    From original click (stored on click record):
                </p>
                <ExtraParamsBlock extraParams={click?.extra_params} offerParams={offerParams} />
                {conversion.extra_params && (
                    <>
                        <p style={{ margin: '16px 0 12px', fontSize: '13px', color: '#64748b' }}>
                            On conversion record:
                        </p>
                        <ExtraParamsBlock extraParams={conversion.extra_params} offerParams={offerParams} />
                    </>
                )}
            </DetailCard>

            {conversion.postback_payload && (
                <DetailCard title="Advertiser Postback Payload">
                    <JsonBlock data={conversion.postback_payload} />
                </DetailCard>
            )}

            {click && (
                <DetailCard title="Linked Click Summary">
                    <FieldGrid
                        fields={[
                            { label: 'TID', value: click.tid, mono: true },
                            { label: 'Country / City', value: [click.country, click.city].filter(Boolean).join(', ') || '—' },
                            { label: 'Device', value: [click.device_type, click.os].filter(Boolean).join(' / ') || '—' },
                            { label: 'Browser', value: click.browser },
                            { label: 'ISP', value: click.isp },
                            { label: 'Referrer', value: click.referrer || 'Direct' },
                            { label: 'Click Time', value: formatLogDate(click.timestamp || click.created_at) },
                        ]}
                    />
                </DetailCard>
            )}

            <EntityCards offer={offer} publisher={publisher} assignment={assignment} />
        </div>
    );
}

export default ConversionDetail;
