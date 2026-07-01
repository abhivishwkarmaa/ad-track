import { queryKeys } from './queryKeys';

function matchIdentity(a, b, publicFields = []) {
    if (!a || !b) return false;
    if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
    for (const field of publicFields) {
        const av = a[field];
        const bv = b[field];
        if (av != null && bv != null && String(av) === String(bv)) return true;
    }
    return false;
}

function patchListCaches(queryClient, listsKey, updated, publicFields) {
    if (!updated) return;
    queryClient.setQueriesData({ queryKey: listsKey }, (cached) => {
        if (!cached?.data || !Array.isArray(cached.data)) return cached;
        return {
            ...cached,
            data: cached.data.map((row) =>
                matchIdentity(row, updated, publicFields) ? { ...row, ...updated } : row
            ),
        };
    });
}

function removeFromListCaches(queryClient, listsKey, target, publicFields) {
    if (target == null) return;
    const targetObj = typeof target === 'object' ? target : { id: target };
    queryClient.setQueriesData({ queryKey: listsKey }, (cached) => {
        if (!cached?.data || !Array.isArray(cached.data)) return cached;
        return {
            ...cached,
            data: cached.data.filter((row) => !matchIdentity(row, targetObj, publicFields)),
        };
    });
}

function setDetailCaches(queryClient, detailsKey, routeId, entity, publicFields = []) {
    if (!entity) return;
    const keys = new Set(
        [routeId, entity.id, ...publicFields.map((f) => entity[f])]
            .filter((v) => v != null && v !== '')
            .map(String)
    );
    keys.forEach((key) => {
        queryClient.setQueriesData({ queryKey: [...detailsKey, key] }, (cached) => ({
            ...(cached && typeof cached === 'object' ? cached : { success: true }),
            data: entity,
        }));
    });
}

export async function invalidateListCaches(queryClient, listsKey) {
    await queryClient.invalidateQueries({ queryKey: listsKey, refetchType: 'all' });
}

// --- Offers ---
export const offersMatchIdentity = (a, b) =>
    matchIdentity(a, b, ['public_offer_id', 'display_id']);

export function patchOffersListCaches(queryClient, updatedOffer) {
    patchListCaches(queryClient, queryKeys.offers.lists(), updatedOffer, [
        'public_offer_id',
        'display_id',
    ]);
}

export function setOfferDetailCache(queryClient, routeId, updatedOffer) {
    setDetailCaches(queryClient, queryKeys.offers.details(), routeId, updatedOffer, [
        'public_offer_id',
        'display_id',
    ]);
}

export function removeOfferFromListCaches(queryClient, target) {
    removeFromListCaches(queryClient, queryKeys.offers.lists(), target, [
        'public_offer_id',
        'display_id',
    ]);
}

// --- Advertisers ---
export function patchAdvertisersListCaches(queryClient, updated) {
    patchListCaches(queryClient, queryKeys.advertisers.lists(), updated, ['public_advertiser_id']);
}

export function setAdvertiserDetailCache(queryClient, routeId, updated) {
    setDetailCaches(queryClient, queryKeys.advertisers.details(), routeId, updated, [
        'public_advertiser_id',
    ]);
}

export function removeAdvertiserFromListCaches(queryClient, target) {
    removeFromListCaches(queryClient, queryKeys.advertisers.lists(), target, ['public_advertiser_id']);
}

// --- Publishers (affiliates) ---
export function patchPublishersListCaches(queryClient, updated) {
    patchListCaches(queryClient, queryKeys.publishers.lists(), updated, ['public_publisher_id']);
}

export function setPublisherDetailCache(queryClient, routeId, updated) {
    setDetailCaches(queryClient, queryKeys.publishers.details(), routeId, updated, [
        'public_publisher_id',
    ]);
}

export function removePublisherFromListCaches(queryClient, target) {
    removeFromListCaches(queryClient, queryKeys.publishers.lists(), target, ['public_publisher_id']);
}

// --- Assignments ---
export function patchAssignmentsListCaches(queryClient, updated) {
    patchListCaches(queryClient, queryKeys.assignments.lists(), updated, [
        'public_assignment_id',
        'assignment_id',
    ]);
}

export function setAssignmentDetailCache(queryClient, routeId, updated) {
    setDetailCaches(queryClient, queryKeys.assignments.details(), routeId, updated, [
        'public_assignment_id',
    ]);
}

export function removeAssignmentFromListCaches(queryClient, target) {
    removeFromListCaches(queryClient, queryKeys.assignments.lists(), target, [
        'public_assignment_id',
        'assignment_id',
    ]);
}

// --- Tenants ---
export function patchTenantsListCaches(queryClient, updated) {
    patchListCaches(queryClient, queryKeys.tenants.lists(), updated, []);
}

export function setTenantDetailCache(queryClient, routeId, updated) {
    setDetailCaches(queryClient, queryKeys.tenants.details(), routeId, updated, []);
}

export function removeTenantFromListCaches(queryClient, target) {
    removeFromListCaches(queryClient, queryKeys.tenants.lists(), target, []);
}
