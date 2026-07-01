import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
    useTenantsList,
    useSuspendTenant,
    useResumeTenant,
    useDeleteTenant,
} from '../../hooks/queries/useTenantsQuery';
import { formatDateIST } from '../../utils/dateTime';
import { useEntityListQueryState } from '../../hooks/useEntityListQueryState';
import ConfirmModal from '../../shared/ui/ConfirmModal';
import {
    EntityListPage,
    EntityListHeader,
    EntityListToolbar,
    EntityListSearch,
    EntityListFilterSelect,
    EntityListBody,
    EntityListTableWrap,
    EntityListEmpty,
    StatusBadge,
} from '../../shared/ui/EntityList';
import {
    PlusIcon,
    EyeIcon,
    EditIcon,
    PauseIcon,
    PlayIcon,
    TrashIcon,
} from '../../shared/ui/icons';

const normalizeStatus = (status) => String(status || '').toUpperCase();

const getStatusLabel = (status) => {
    switch (normalizeStatus(status)) {
        case 'TRIAL':
            return 'Trial';
        case 'ACTIVE':
            return 'Active';
        case 'EXPIRED':
            return 'Expired';
        case 'SUSPENDED':
            return 'Suspended';
        default:
            return 'Unknown';
    }
};

function ManageTenant() {
    const toast = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [actionModal, setActionModal] = useState({ open: false, type: null, tenant: null });

    const listParams = useMemo(() => {
        const params = { page: 1, limit: 100 };
        if (statusFilter !== 'all') params.status = statusFilter;
        return params;
    }, [statusFilter]);

    const tenantsQuery = useTenantsList(listParams);
    const { isInitialLoad, isRefreshing, error, refetch } = useEntityListQueryState(tenantsQuery);
    const suspendTenantMutation = useSuspendTenant();
    const resumeTenantMutation = useResumeTenant();
    const deleteTenantMutation = useDeleteTenant();

    const tenants = tenantsQuery.data?.data ?? [];

    const handleSuspend = async (tenant) => {
        try {
            await suspendTenantMutation.mutateAsync(tenant.id);
            toast.success(`Tenant "${tenant.name}" has been suspended`);
            setActionModal({ open: false, type: null, tenant: null });
        } catch (err) {
            console.error('Suspend tenant error:', err);
            toast.error(err.message || 'Failed to suspend tenant');
        }
    };

    const handleResume = async (tenant) => {
        try {
            await resumeTenantMutation.mutateAsync(tenant.id);
            toast.success(`Tenant "${tenant.name}" has been resumed`);
            setActionModal({ open: false, type: null, tenant: null });
        } catch (err) {
            console.error('Resume tenant error:', err);
            toast.error(err.message || 'Failed to resume tenant');
        }
    };

    const handleDelete = async (tenant) => {
        try {
            await deleteTenantMutation.mutateAsync({ id: tenant.id, hardDelete: false });
            toast.success(`Tenant "${tenant.name}" has been deleted`);
            setActionModal({ open: false, type: null, tenant: null });
        } catch (err) {
            console.error('Delete tenant error:', err);
            toast.error(err.message || 'Failed to delete tenant');
        }
    };

    const filteredTenants = tenants.filter((tenant) => {
        const matchesSearch =
            tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tenant.slug.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return formatDateIST(dateString, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }, 'en-US') || 'N/A';
    };

    const actionModalConfig = actionModal.open && actionModal.tenant ? {
        suspend: {
            title: 'Suspend Tenant',
            message: `Are you sure you want to suspend "${actionModal.tenant.name}"? This will block all access to their subdomain.`,
            confirmText: 'Suspend',
            confirmVariant: 'primary',
        },
        resume: {
            title: 'Resume Tenant',
            message: `Are you sure you want to resume "${actionModal.tenant.name}"? This will restore access to their subdomain.`,
            confirmText: 'Resume',
            confirmVariant: 'primary',
        },
        delete: {
            title: 'Delete Tenant',
            message: `Are you sure you want to delete "${actionModal.tenant.name}"? This action cannot be undone.`,
            confirmText: 'Delete',
            confirmVariant: 'danger',
        },
    }[actionModal.type] : null;

    const handleActionConfirm = () => {
        if (!actionModal.tenant) return;
        if (actionModal.type === 'suspend') handleSuspend(actionModal.tenant);
        else if (actionModal.type === 'resume') handleResume(actionModal.tenant);
        else if (actionModal.type === 'delete') handleDelete(actionModal.tenant);
    };

    return (
        <EntityListPage>
            <EntityListHeader
                title="Tenant Management"
                subtitle="Manage platform tenants and subdomains"
                action={(
                    <Link to="/tenant/new" className="btn btn-primary">
                        <PlusIcon />
                        <span>Create Tenant</span>
                    </Link>
                )}
            />

            <EntityListToolbar>
                <EntityListSearch
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search tenants by name or slug..."
                    onClear={() => setSearchTerm('')}
                />
                <EntityListFilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="TRIAL">Trial</option>
                    <option value="ACTIVE">Active</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="SUSPENDED">Suspended</option>
                </EntityListFilterSelect>
            </EntityListToolbar>

            <EntityListBody
                isInitialLoad={isInitialLoad}
                isRefreshing={isRefreshing}
                error={error}
                onRetry={() => refetch()}
                tableRows={8}
                tableCols={5}
            >
                <EntityListTableWrap>
                    <table className="entity-list-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Subdomain</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTenants.length === 0 ? (
                                <EntityListEmpty colSpan={5} message="No tenants found" />
                            ) : (
                                filteredTenants.map((tenant) => (
                                    <tr key={tenant.id}>
                                        <td>
                                            <div className="entity-list-cell-primary">{tenant.name}</div>
                                        </td>
                                        <td className="entity-list-cell-sub">
                                            {tenant.slug}.track-myads.com
                                        </td>
                                        <td>
                                            <StatusBadge status={getStatusLabel(tenant.status)} />
                                        </td>
                                        <td className="entity-list-cell-sub">{formatDate(tenant.created_at)}</td>
                                        <td>
                                            <div className="entity-list-actions">
                                                <Link
                                                    to={`/tenant/detail/${tenant.id}`}
                                                    className="entity-list-action-btn"
                                                    title="View Details"
                                                >
                                                    <EyeIcon />
                                                </Link>
                                                <Link
                                                    to={`/tenant/edit/${tenant.id}`}
                                                    className="entity-list-action-btn"
                                                    title="Edit Tenant"
                                                >
                                                    <EditIcon />
                                                </Link>
                                                {normalizeStatus(tenant.status) === 'SUSPENDED' ? (
                                                    <button
                                                        type="button"
                                                        className="entity-list-action-btn success"
                                                        onClick={() => setActionModal({ open: true, type: 'resume', tenant })}
                                                        title="Resume Tenant"
                                                    >
                                                        <PlayIcon />
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="entity-list-action-btn warn"
                                                        onClick={() => setActionModal({ open: true, type: 'suspend', tenant })}
                                                        title="Suspend Tenant"
                                                    >
                                                        <PauseIcon />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="entity-list-action-btn delete"
                                                    onClick={() => setActionModal({ open: true, type: 'delete', tenant })}
                                                    title="Delete Tenant"
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </EntityListTableWrap>
            </EntityListBody>

            <ConfirmModal
                open={Boolean(actionModalConfig)}
                onClose={() => setActionModal({ open: false, type: null, tenant: null })}
                onConfirm={handleActionConfirm}
                title={actionModalConfig?.title}
                message={actionModalConfig?.message}
                confirmText={actionModalConfig?.confirmText}
                confirmVariant={actionModalConfig?.confirmVariant}
                variant="simple"
                loading={
                    suspendTenantMutation.isPending ||
                    resumeTenantMutation.isPending ||
                    deleteTenantMutation.isPending
                }
            />
        </EntityListPage>
    );
}

export default ManageTenant;
