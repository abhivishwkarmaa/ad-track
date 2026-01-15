import advertiserService from '../services/advertiser.service.js';
import logger from '../utils/logger.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

const buildSuccess = (data, message) => ({
  success: true,
  message,
  data,
});

const buildError = (message, status = 500, error = 'Internal Server Error') => ({
  success: false,
  error,
  message,
});

class AdvertiserController {
  async createAdvertiser(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request and pass to service
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send(buildError('Tenant context required to create advertiser', 400, 'Bad Request'));
      }
      
      const advertiser = await advertiserService.createAdvertiser(request.body, tenantId);
      return reply.code(201).send(buildSuccess(advertiser, 'Advertiser created successfully'));
    } catch (error) {
      logger.error('AdvertiserController.createAdvertiser error:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return reply.code(409).send(
          buildError('Email already exists for another advertiser', 409, 'Conflict')
        );
      }
      const status = error.statusCode || 500;
      return reply.code(status).send(buildError(error.message || 'Failed to create advertiser', status));
    }
  }

  async updateAdvertiser(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send(buildError('Tenant context required', 400, 'Bad Request'));
      }
      
      const advertiser = await advertiserService.updateAdvertiser(request.params.id, request.body, tenantId);
      if (!advertiser) {
        return reply.code(404).send(buildError('Advertiser not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(advertiser, 'Advertiser updated'));
    } catch (error) {
      logger.error('AdvertiserController.updateAdvertiser error:', error);
      const status = error.statusCode || 500;
      return reply.code(status).send(buildError(error.message || 'Failed to update advertiser', status));
    }
  }

  async getAdvertiser(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send(buildError('Tenant context required', 400, 'Bad Request'));
      }
      
      const advertiser = await advertiserService.getAdvertiserById(request.params.id, tenantId);
      if (!advertiser) {
        return reply.code(404).send(buildError('Advertiser not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(advertiser));
    } catch (error) {
      logger.error('AdvertiserController.getAdvertiser error:', error);
      return reply.code(500).send(buildError('Failed to fetch advertiser'));
    }
  }

  async listAdvertisers(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send(buildError('Tenant context required', 400, 'Bad Request'));
      }
      
      const result = await advertiserService.listAdvertisers(request.query, tenantId);
      return reply.send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error('AdvertiserController.listAdvertisers error:', error);
      return reply.code(500).send(buildError('Failed to list advertisers'));
    }
  }

  async deleteAdvertiser(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send(buildError('Tenant context required', 400, 'Bad Request'));
      }
      
      const advertiser = await advertiserService.deleteAdvertiser(request.params.id, tenantId);
      if (!advertiser) {
        return reply.code(404).send(buildError('Advertiser not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(advertiser, 'Advertiser deactivated'));
    } catch (error) {
      logger.error('AdvertiserController.deleteAdvertiser error:', error);
      return reply.code(500).send(buildError('Failed to deactivate advertiser'));
    }
  }
}

export default new AdvertiserController();
