/** Centralized TanStack Query keys for reference data entities. */

export const queryKeys = {
    offers: {
        all: ['offers'],
        lists: () => [...queryKeys.offers.all, 'list'],
        list: (params) => [...queryKeys.offers.lists(), params],
        details: () => [...queryKeys.offers.all, 'detail'],
        detail: (id) => [...queryKeys.offers.details(), id],
        assignments: (id) => [...queryKeys.offers.all, 'assignments', id],
        stats: (id, params) => [...queryKeys.offers.all, 'stats', id, params],
        publisherStats: (id, params) => [...queryKeys.offers.all, 'publisher-stats', id, params],
    },
    advertisers: {
        all: ['advertisers'],
        lists: () => [...queryKeys.advertisers.all, 'list'],
        list: (params) => [...queryKeys.advertisers.lists(), params],
        details: () => [...queryKeys.advertisers.all, 'detail'],
        detail: (id) => [...queryKeys.advertisers.details(), id],
    },
    publishers: {
        all: ['publishers'],
        lists: () => [...queryKeys.publishers.all, 'list'],
        list: (params) => [...queryKeys.publishers.lists(), params],
        details: () => [...queryKeys.publishers.all, 'detail'],
        detail: (id) => [...queryKeys.publishers.details(), id],
    },
    assignments: {
        all: ['assignments'],
        lists: () => [...queryKeys.assignments.all, 'list'],
        list: (params) => [...queryKeys.assignments.lists(), params],
        details: () => [...queryKeys.assignments.all, 'detail'],
        detail: (id) => [...queryKeys.assignments.details(), id],
        trackingUrl: (assignmentId, params = {}) =>
            [...queryKeys.assignments.all, 'tracking-url', assignmentId, params],
    },
    tenants: {
        all: ['tenants'],
        lists: () => [...queryKeys.tenants.all, 'list'],
        list: (params) => [...queryKeys.tenants.lists(), params],
        details: () => [...queryKeys.tenants.all, 'detail'],
        detail: (id) => [...queryKeys.tenants.details(), id],
    },
};

/** All reference-entity root keys — used by global refresh invalidation. */
export const referenceDataRootKeys = [
    queryKeys.offers.all,
    queryKeys.advertisers.all,
    queryKeys.publishers.all,
    queryKeys.assignments.all,
    queryKeys.tenants.all,
];
