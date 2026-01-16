import publisherService from '../services/publisherService.js';
import offerService from '../services/offer.service.js';
import assignmentService from '../services/assignmentService.js';
import trackingService from '../services/trackingService.js';
import postbackService from '../services/postbackService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import { createOfferSchema, updateOfferStatusSchema } from '../validators/offerValidator.js';
import { updateOfferSchema } from '../validators/offerValidator.js';
import { createPublisherSchema, updatePublisherSchema } from '../validators/publisherValidator.js';
import { createAssignmentSchema, updateAssignmentSchema } from '../validators/assignmentValidator.js';
import { testConversionSchema, testAffiliatePostbackSchema } from '../validators/trackingValidator.js';

export class AdminController {
  // Publisher endpoints
  async createPublisher(request, reply) {
    try {
      const { error, value } = createPublisherSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      // ✅ CRITICAL: Get tenant_id from request and pass to service
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required to create publisher',
        });
      }

      const publisher = await publisherService.create(value, tenantId);
      return reply.code(201).send({
        success: true,
        data: publisher,
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
        return reply.code(409).send({
          success: false,
          error: 'Conflict',
          message: 'Publisher with this email already exists',
          timestamp: new Date().toISOString(),
        });
      }
      logger.error('AdminController.createPublisher error:', error);
      return reply.code(400).send({
        success: false,
        error: 'Bad Request',
        message: error.message || 'Failed to create publisher',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async updatePublisher(request, reply) {
    try {
      const { error, value } = updatePublisherSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const updated = await publisherService.update(request.params.id, value, tenantId);
      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('AdminController.updatePublisher error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async deletePublisher(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      // Update softDelete to accept tenantId
      const existing = await publisherService.findById(request.params.id, tenantId);
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
        });
      }

      // Update status with tenant isolation
      let query = `UPDATE publishers SET status = 'suspended', updated_at = UTC_TIMESTAMP() WHERE id = ?`;
      const params = [request.params.id];
      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const { default: pool } = await import('../db/connection.js');
      await pool.query(query, params);

      const deleted = await publisherService.findById(request.params.id, tenantId);
      return reply.send({ success: true, data: deleted });
    } catch (error) {
      logger.error('AdminController.deletePublisher error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async updateOffer(request, reply) {
    try {
      const { error, value } = updateOfferSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const updated = await offerService.update(request.params.id, value);
      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('AdminController.updateOffer error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async deleteOffer(request, reply) {
    try {
      const deleted = await offerService.softDelete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
        });
      }
      return reply.send({ success: true, data: deleted });
    } catch (error) {
      logger.error('AdminController.deleteOffer error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async listPublishers(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        status: request.query.status,
        email: request.query.email,
        company_name: request.query.company_name,
        page: request.query.page,
        limit: request.query.limit,
      };

      const publishers = await publisherService.findAll(filters, tenantId);
      return reply.send({
        success: true,
        data: publishers.data,
        pagination: publishers.pagination,
      });
    } catch (error) {
      logger.error('AdminController.listPublishers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPublisher(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const publisher = await publisherService.findById(request.params.id, tenantId);
      if (!publisher) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.send({
        success: true,
        data: publisher,
      });
    } catch (error) {
      logger.error('AdminController.getPublisher error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  // Offer endpoints
  async createOffer(request, reply) {
    try {
      // Validate request body
      const { error, value } = createOfferSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      // ✅ CRITICAL: Get tenant_id from request and pass to service
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required to create offer',
        });
      }

      const offer = await offerService.create(value, tenantId);
      return reply.code(201).send({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error('AdminController.createOffer error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }

  async listOffers(request, reply) {
    try {
      const type = request.params.type || 'all';
      let offers;

      switch (type) {
        case 'live':
          // ✅ CRITICAL: Get tenant_id from request
          const tenantId = getTenantIdFromRequest(request);
          if (!tenantId) {
            return reply.code(400).send({
              success: false,
              error: 'Bad Request',
              message: 'Tenant context required',
            });
          }
          offers = await offerService.getLive(tenantId);
          break;
        case 'approved':
          offers = await offerService.getApproved(tenantId);
          break;
        case 'all':
        default:
          offers = await offerService.getAll(tenantId);
          break;
      }

      return reply.send({
        success: true,
        data: offers,
      });
    } catch (error) {
      logger.error('AdminController.listOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getOfferCategories(request, reply) {
    try {
      const categories = await offerService.getCategories();
      return reply.send({
        success: true,
        data: categories,
      });
    } catch (error) {
      logger.error('AdminController.getOfferCategories error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getOffer(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const offer = await offerService.getOfferByIdWithDetails(request.params.id, '+05:30', tenantId);
      if (!offer) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.send({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error('AdminController.getOffer error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async updateOfferStatus(request, reply) {
    try {
      // Validate request body
      const { error, value } = updateOfferStatusSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const { status } = value;
      const offer = await offerService.updateStatus(request.params.id, status);
      if (!offer) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.send({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error('AdminController.updateOfferStatus error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }

  // Assignment endpoints
  async createAssignment(request, reply) {
    try {
      // Validate request body
      console.log(request.body);
      const { error, value } = createAssignmentSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      // ✅ CRITICAL: Get tenant_id from request and pass to service
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required to create assignment',
        });
      }

      const result = await assignmentService.create(value, tenantId);

      // Handle multi-publisher response format
      if (result.assignments) {
        return reply.code(201).send({
          success: true,
          data: result.assignments,
          errors: result.errors,
          message: result.errors && result.errors.length > 0
            ? `Created ${result.assignments.length} assignment(s) with ${result.errors.length} error(s)`
            : `Successfully created ${result.assignments.length} assignment(s)`,
        });
      }

      // Single assignment response (legacy format)
      return reply.code(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('AdminController.createAssignment error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }

  async getAssignment(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const assignment = await assignmentService.findById(request.params.id, tenantId);
      if (!assignment) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }
      return reply.send({ success: true, data: assignment });
    } catch (error) {
      logger.error('AdminController.getAssignment error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async updateAssignment(request, reply) {
    try {
      const { error, value } = updateAssignmentSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const updated = await assignmentService.update(request.params.id, value, tenantId);
      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('AdminController.updateAssignment error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async deleteAssignment(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const deleted = await assignmentService.delete(request.params.id, tenantId);
      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }
      return reply.send({ success: true, data: deleted });
    } catch (error) {
      logger.error('AdminController.deleteAssignment error:', error);
      const status = error.statusCode || 500;
      return reply.code(status).send(createErrorResponse(error, status));
    }
  }
  async listAssignments(request, reply) {
    try {
      const filters = {};
      if (request.query.publisher_id) {
        filters.publisher_id = parseInt(request.query.publisher_id);
      }
      if (request.query.offer_id) {
        filters.offer_id = parseInt(request.query.offer_id);
      }
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const assignments = await assignmentService.findAll(filters, tenantId);
      return reply.send({
        success: true,
        data: assignments,
      });
    } catch (error) {
      logger.error('AdminController.listAssignments error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTrackingURL(request, reply) {
    try {
      // 🔒 STRICT: Tenant identity MUST come from subdomain (Host header) ONLY
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        logger.error('❌ getTrackingURL: No tenant resolved from subdomain - REJECTED', {
          host: request.headers.host,
          url: request.url
        });
        return reply.code(400).send({
          success: false,
          error: 'Tenant Required',
          message: 'This endpoint requires a valid tenant subdomain. Access via tenant subdomain (e.g., tenant1.domain.com/api/...).',
        });
      }

      // 🔒 STRICT: Tenant subdomain MUST be available from request.tenant (set by middleware)
      if (!request.tenant || !request.tenant.slug) {
        logger.error('❌ getTrackingURL: Tenant subdomain not available - REJECTED', {
          host: request.headers.host,
          tenantId: tenantId,
          tenant: request.tenant
        });
        return reply.code(400).send({
          success: false,
          error: 'Tenant Subdomain Required',
          message: 'Could not determine tenant subdomain from request. This should not happen if tenant was resolved from subdomain.',
        });
      }

      // ✅ Build base URL from actual request Host header (not from env)
      // This ensures tracking URLs use the real domain (e.g., ravi.track-myads.com)
      // instead of localhost or env variables
      
      const host = request.headers.host || request.hostname || '';
      
      // Determine protocol from request
      // Check X-Forwarded-Proto first (set by NGINX/proxy), then request.protocol
      const protocol = request.headers['x-forwarded-proto'] || 
                      (request.protocol === 'https' ? 'https' : 'http') ||
                      (process.env.NODE_ENV === 'production' ? 'https' : 'http');
      
      // Extract domain and port from host header
      // host format: "ravi.track-myads.com" or "ravi.track-myads.com:5001"
      let domain = host;
      let port = '';
      
      if (host.includes(':')) {
        const parts = host.split(':');
        domain = parts[0];
        port = parts[1];
        
        // Remove port if it's standard (80 for http, 443 for https)
        // Also remove port in production (always use standard ports)
        if ((protocol === 'http' && port === '80') || 
            (protocol === 'https' && port === '443') ||
            process.env.NODE_ENV === 'production') {
          port = '';
        }
      }
      
      // Build baseURL: {protocol}://{domain}{port}
      // Example (production): https://ravi.track-myads.com
      // Example (dev): http://ravi.localhost:5001
      const baseURL = `${protocol}://${domain}${port ? `:${port}` : ''}`;
      
      logger.debug('Tracking URL base generated from request Host', {
        host: host,
        protocol: protocol,
        domain: domain,
        port: port,
        baseURL: baseURL,
        tenantSubdomain: request.tenant.slug
      });

      const format = request.query.format || 'standard'; // 'standard' or 'alternative'

      const trackingURL = await assignmentService.generateTrackingURL(
        request.params.id,
        baseURL,
        format
      );
      if (!trackingURL) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }
      return reply.send({
        success: true,
        data: {
          tracking_url: trackingURL,
          format: format,
        },
      });
    } catch (error) {
      logger.error('AdminController.getTrackingURL error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }

  // Test conversion endpoint
  async testConversion(request, reply) {
    try {
      // Validate request body
      const { error, value } = testConversionSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const { affiliate_url, click_id } = value;

      // Parse the affiliate URL to extract parameters
      const url = new URL(affiliate_url);
      const offerId = url.searchParams.get('offer_id');
      const pubId = url.searchParams.get('pub_id');

      if (!offerId || !pubId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Invalid affiliate URL. Must contain offer_id and pub_id parameters.',
          timestamp: new Date().toISOString(),
        });
      }

      // Simulate a click if click_id not provided
      let clickUuid = click_id;
      if (!clickUuid) {
        // Create a test click
        const clickResult = await trackingService.trackClick(
          { offer_id: offerId, pub_id: pubId },
          request
        );
        clickUuid = clickResult.clickId;
      }

      return reply.send({
        success: true,
        message: 'Test conversion processed',
        data: {
          click_id: clickUuid,
          offer_id: offerId,
          publisher_id: pubId,
        },
      });
    } catch (error) {
      logger.error('AdminController.testConversion error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }

  async testAffiliatePostback(request, reply) {
    const startTime = Date.now();
    try {
      const { error, value } = testAffiliatePostbackSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
        });
      }

      const { publisher_id, affiliate_click_id, status, payout, amount } = value;

      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const publisher = await publisherService.findById(publisher_id, tenantId);
      if (!publisher) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
        });
      }

      if (!publisher.global_postback_url) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Publisher does not have a Global Postback URL configured',
        });
      }

      // Manual macro replacement for testing
      let finalUrl = publisher.global_postback_url;
      finalUrl = finalUrl
        .replace(/{click_id}/gi, affiliate_click_id) // Map click_id to affiliate_click_id
        .replace(/{affiliate_click_id}/gi, affiliate_click_id)
        .replace(/{status}/gi, status || 'approved')
        .replace(/{payout}/gi, (payout || 0).toString())
        .replace(/{amount}/gi, (amount || 0).toString());

      // Fire Request
      const urlObj = new URL(finalUrl);
      const client = urlObj.protocol === 'https:' ? https : http; // Import https/http at top if needed, or use fetch

      // Improving implementation to use fetch for simplicity and consistency with modern node
      const postbackResponse = await fetch(finalUrl);
      const responseText = await postbackResponse.text().catch(() => '');

      return reply.send({
        success: true,
        fired_url: finalUrl,
        http_status: postbackResponse.status,
        response_body: responseText.substring(0, 1000),
        execution_time_ms: Date.now() - startTime,
      });

    } catch (error) {
      logger.error('AdminController.testAffiliatePostback error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        execution_time_ms: Date.now() - startTime,
      });
    }
  }

  async getAffiliatePostbackLogs(request, reply) {
    try {
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        publisher_id: request.query.publisher_id,
        conversion_id: request.query.conversion_id,
        affiliate_click_id: request.query.affiliate_click_id,
        limit: request.query.limit || 50,
        offset: request.query.offset || 0
      };

      const logs = await postbackService.getPostbackLogs(filters, tenantId);

      return reply.send({
        success: true,
        data: logs.data,
        pagination: {
          total: logs.total,
          limit: filters.limit,
          offset: filters.offset
        }
      });
    } catch (error) {
      logger.error('AdminController.getAffiliatePostbackLogs error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new AdminController();
