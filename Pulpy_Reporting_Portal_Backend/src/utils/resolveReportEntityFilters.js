import offerService from '../services/offer.service.js';
import publisherService from '../services/publisherService.js';
import advertiserService from '../services/advertiser.service.js';

export class ResolveEntityFilterError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ResolveEntityFilterError';
    this.statusCode = 400;
    this.field = field;
  }
}

/**
 * Reports/clicks use internal FK ids. API query params carry public (or legacy internal) ids.
 */
export async function resolveReportEntityFilters(filters, tenantId) {
  const resolved = { ...filters };

  if (filters.offer_id != null && filters.offer_id !== '') {
    const internalId = await offerService.getInternalOfferIdByPublicId(filters.offer_id, tenantId);
    if (!internalId) {
      throw new ResolveEntityFilterError('Offer not found for the given id', 'offer_id');
    }
    resolved.offer_id = internalId;
  }

  if (filters.publisher_id != null && filters.publisher_id !== '') {
    const internalId = await publisherService.getInternalIdByPublicId(filters.publisher_id, tenantId);
    if (!internalId) {
      throw new ResolveEntityFilterError('Publisher not found for the given id', 'publisher_id');
    }
    resolved.publisher_id = internalId;
  }

  if (filters.advertiser_id != null && filters.advertiser_id !== '') {
    const internalId = await advertiserService.getInternalIdByPublicId(filters.advertiser_id, tenantId);
    if (!internalId) {
      throw new ResolveEntityFilterError('Advertiser not found for the given id', 'advertiser_id');
    }
    resolved.advertiser_id = internalId;
  }

  return resolved;
}

export function assignEntityFilterQuery(filters, query) {
  if (query.offer_id) filters.offer_id = query.offer_id;
  if (query.publisher_id) filters.publisher_id = query.publisher_id;
  if (query.advertiser_id) filters.advertiser_id = query.advertiser_id;
}
