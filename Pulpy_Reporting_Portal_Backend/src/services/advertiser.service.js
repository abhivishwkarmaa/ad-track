import logger from '../utils/logger.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

export class AdvertiserService {
  constructor(advertiserRepository, offerPublicIdService) {
    this.advertiserRepository = advertiserRepository;
    this.offerPublicIdService = offerPublicIdService;
  }

  async createAdvertiser(data, tenantId = null) {
    try {
      if (!tenantId) {
        const err = new Error('Tenant context required to create advertiser');
        err.statusCode = 400;
        throw err;
      }

      const emailExists = await this.advertiserRepository.checkEmailExists(data.email, tenantId);
      if (emailExists) {
        const err = new Error('Advertiser with this email already exists for this tenant');
        err.statusCode = 409;
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }

      const publicAdvertiserId = await this.offerPublicIdService.generatePublicAdvertiserId(tenantId);

      const insertId = await this.advertiserRepository.create({
        ...data,
        tenant_id: tenantId,
        public_advertiser_id: publicAdvertiserId
      });

      return this.getAdvertiserById(insertId, tenantId);
    } catch (error) {
      logger.error('AdvertiserService.createAdvertiser error:', error);
      throw error;
    }
  }

  async updateAdvertiser(id, data, tenantId = null) {
    try {
      const existing = await this.getAdvertiserById(id, tenantId);
      if (!existing) {
        const err = new Error('Advertiser not found');
        err.statusCode = 404;
        throw err;
      }

      if (tenantId && existing.tenant_id !== tenantId) {
        const err = new Error('Advertiser does not belong to this tenant');
        err.statusCode = 403;
        throw err;
      }

      const fields = [];
      const params = [];

      const updatable = [
        'name',
        'email',
        'company_name',
        'country',
        'website',
        'notes',
        'status',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(data[key] ?? null);
        }
      });

      if (!fields.length) {
        return this.getAdvertiserById(id, tenantId);
      }

      fields.push('updated_at = UTC_TIMESTAMP()');
      const internalId = existing.id;

      await this.advertiserRepository.update(internalId, tenantId, fields, params);

      return this.getAdvertiserById(id, tenantId);
    } catch (error) {
      logger.error('AdvertiserService.updateAdvertiser error:', error);
      throw error;
    }
  }

  async getAdvertiserById(id, tenantId = null) {
    if (!id) return null;

    if (tenantId) {
      const publicAdvertiser = await this.advertiserRepository.findByPublicId(id, tenantId);
      if (publicAdvertiser) return publicAdvertiser;
    }

    return await this.advertiserRepository.findById(id, tenantId);
  }

  async listAdvertisers(filters = {}, tenantId = null) {
    const conditions = [];
    const params = [];

    if (tenantId) {
      conditions.push('tenant_id = ?');
      params.push(tenantId);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.country) {
      conditions.push('country = ?');
      params.push(filters.country);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push('(name LIKE ? OR email LIKE ? OR company_name LIKE ?)');
      params.push(term, term, term);
    }

    const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const { dataRows, total } = await this.advertiserRepository.findAll({ whereClause, params, limit, offset });

    return {
      data: dataRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async deleteAdvertiser(id, tenantId = null) {
    try {
      const existing = await this.getAdvertiserById(id, tenantId);
      if (!existing) {
        return null;
      }

      const internalId = existing.id;
      await this.advertiserRepository.delete(internalId, tenantId);

      return existing;
    } catch (error) {
      logger.error('AdvertiserService.deleteAdvertiser error:', error);
      throw error;
    }
  }
}


// (no singleton export)
