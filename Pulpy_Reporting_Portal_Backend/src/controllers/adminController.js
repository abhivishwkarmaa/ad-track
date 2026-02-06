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
import { testConversionSchema, testAffiliatePostbackSchema, testTrackingUrlLoopSchema } from '../validators/trackingValidator.js';

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

      // Hard Delete with tenant isolation
      let query = `DELETE FROM publishers WHERE id = ?`;
      const params = [request.params.id];
      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const { default: pool } = await import('../db/connection.js');
      await pool.query(query, params);

      return reply.send({ success: true, data: existing });
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
      logger.info(`Attempting to update assignment ${request.params.id} with data:`, request.body);
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
      console.error('!!! DEBUG DELETE ASSIGNMENT !!!', request.params.id);
      logger.info(`Attempting to delete assignment ${request.params.id}`);
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
      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {};
      if (request.query.publisher_id) {
        const pub = await publisherService.findById(request.query.publisher_id, tenantId);
        filters.publisher_id = pub ? pub.id : request.query.publisher_id;
      }
      if (request.query.offer_id) {
        const offer = await offerService.getOfferById(request.query.offer_id, tenantId);
        filters.offer_id = offer ? offer.id : request.query.offer_id;
      }
      if (request.query.status) {
        filters.status = request.query.status;
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

      // ✅ CRITICAL: Use X-Forwarded-Host for VPS/NGINX reverse proxy
      const host = request.headers['x-forwarded-host'] ||
        request.headers.host ||
        request.hostname ||
        '';

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

      // ✅ Resolve Public Assignment ID to Internal ID for the service call
      const assignment = await assignmentService.findById(request.params.id, tenantId);
      const internalAssignmentId = assignment ? assignment.internal_id : request.params.id;

      const trackingURL = await assignmentService.generateTrackingURL(
        internalAssignmentId,
        baseURL,
        format,
        tenantId
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

      const { publisher_id, affiliate_click_id, rcid, status, payout, amount, txid, method, dry_run } = value;
      const clickIdToUse = affiliate_click_id || rcid;

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
      const payoutVal = (payout || amount || 0).toString();
      const statusVal = status || 'approved';
      const txidVal = txid || '';

      finalUrl = finalUrl
        .replace(/{click_id}/gi, clickIdToUse || '')
        .replace(/{clickid}/gi, clickIdToUse || '')
        .replace(/{affiliate_click_id}/gi, clickIdToUse || '')
        .replace(/{rcid}/gi, clickIdToUse || '') // Support {rcid}
        .replace(/{status}/gi, statusVal)
        .replace(/{payout}/gi, payoutVal)
        .replace(/{amount}/gi, payoutVal)
        .replace(/{txid}/gi, txidVal)
        .replace(/{transaction_id}/gi, txidVal);

      // Support for DRY RUN mode
      if (dry_run) {
        return reply.send({
          success: true,
          mode: 'DRY_RUN',
          fired_url: finalUrl,
          method: method || 'GET',
          http_status: null,
          response_body: '(Dry run - request not sent)',
          execution_time_ms: Date.now() - startTime,
        });
      }

      // Fire Real Request
      let postbackResponse;
      let responseText = '';

      try {
        if (method === 'POST') {
          // For POST, we assume the URL is the endpoint and params might need to be handling differently
          // But usually postbacks embed params in URL even for POST. 
          // If payload is needed, it's not specified in prompt, so we assume empty body or query params.
          postbackResponse = await fetch(finalUrl, { method: 'POST' });
        } else {
          postbackResponse = await fetch(finalUrl);
        }
        responseText = await postbackResponse.text().catch(() => '');
      } catch (reqError) {
        return reply.send({
          success: false,
          fired_url: finalUrl,
          method: method || 'GET',
          error: reqError.message,
          execution_time_ms: Date.now() - startTime,
        });
      }

      return reply.send({
        success: true,
        fired_url: finalUrl,
        method: method || 'GET',
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

  async testTrackingUrlLoop(request, reply) {
    const startTime = Date.now();
    try {
      const { error, value } = testTrackingUrlLoopSchema.validate(request.body, {
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

      const { tracking_url } = value;

      // ✅ CRITICAL: Get tenant_id from request for tenant isolation
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      // 1. Parse Tracking URL
      // We accept absolute URLs. If relative, we might need strict validation.
      let urlObj;
      try {
        let urlToParse = tracking_url;
        if (!urlToParse.match(/^https?:\/\//)) {
          urlToParse = 'http://' + urlToParse;
        }
        urlObj = new URL(urlToParse);
      } catch (e) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Invalid Tracking URL format',
        });
      }

      const offerId = urlObj.searchParams.get('offer_id');
      const pubId = urlObj.searchParams.get('pub_id');

      if (!offerId || !pubId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tracking URL must contain offer_id and pub_id',
        });
      }

      // 2. Simulate Click (Hit Tracking URL)
      // We pass the parsed query params to trackingService
      // We mock the request object to pass context.
      // NOTE: trackClick uses request.headers['user-agent'], request.ip, etc.
      // We reuse the current admin request for these, which is fine for testing.
      const clickParams = Object.fromEntries(urlObj.searchParams);

      let clickResult;
      try {
        clickResult = await trackingService.trackClick(clickParams, request);
      } catch (e) {
        return reply.code(400).send({
          success: false,
          error: 'Tracking Error',
          message: `Failed to track click: ${e.message}`,
        });
      }

      const generatedClickId = clickResult.clickId;
      if (!generatedClickId) {
        return reply.code(500).send({
          success: false,
          error: 'Tracking Error',
          message: 'No click_id returned from tracking service',
        });
      }

      // 3. Fetch Publisher Postback URL
      const publisher = await publisherService.findById(pubId, tenantId);
      if (!publisher) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
          data: { click_id: generatedClickId }
        });
      }

      if (!publisher.global_postback_url) {
        return reply.send({
          success: true,
          message: 'Click generated, but Publisher has no global postback URL',
          data: {
            click_id: generatedClickId,
            publisher_id: pubId,
            postback_fired: false
          }
        });
      }

      // 4. Fire Postback
      let finalUrl = publisher.global_postback_url;
      // Replace standard macros
      finalUrl = finalUrl
        .replace(/{click_id}/gi, generatedClickId)
        .replace(/{clickid}/gi, generatedClickId)
        .replace(/{affiliate_click_id}/gi, generatedClickId) // Assuming mapping
        .replace(/{status}/gi, 'approved')
        .replace(/{payout}/gi, '0.00') // Placeholder
        .replace(/{amount}/gi, '0.00'); // Placeholder

      const postbackStartTime = Date.now();
      let responseText = '';
      let status = 0;
      let postbackError = null;

      try {
        const postbackResponse = await fetch(finalUrl);
        status = postbackResponse.status;
        responseText = await postbackResponse.text().catch(() => '');
      } catch (e) {
        postbackError = e.message;
        status = 0;
      }

      return reply.send({
        success: true,
        message: 'Click generated and Postback fired',
        data: {
          click_id: generatedClickId,
          publisher_id: pubId,
          offer_id: offerId,
          postback: {
            url: finalUrl,
            status: status,
            response: responseText.substring(0, 500),
            error: postbackError,
            latency_ms: Date.now() - postbackStartTime
          }
        },
        execution_time_ms: Date.now() - startTime
      });

    } catch (error) {
      logger.error('AdminController.testTrackingUrlLoop error:', error);
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

  async createTestConversion(request, reply) {
    const startTime = Date.now();
    try {
      const { tracking_url } = request.body;

      if (!tracking_url) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'tracking_url is required',
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

      // Parse tracking URL to extract parameters
      let urlObj;
      try {
        urlObj = new URL(tracking_url);
      } catch (e) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Invalid tracking URL format',
        });
      }

      const offerId = urlObj.searchParams.get('offer_id') || urlObj.searchParams.get('oid');
      const pubId = urlObj.searchParams.get('pub_id') || urlObj.searchParams.get('a');
      const tid = urlObj.searchParams.get('tid') || urlObj.searchParams.get('click_id');

      if (!offerId || !pubId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tracking URL must contain offer_id and pub_id parameters',
        });
      }

      // Wait a moment for the click to be processed (if just opened)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to find the most recent click for this offer/publisher/tenant
      const pool = (await import('../db/connection.js')).default;

      let clickQuery = `
        SELECT * FROM clicks 
        WHERE offer_id = ? AND publisher_id = ? AND tenant_id = ?
      `;
      const clickParams = [offerId, pubId, tenantId];

      // If tid provided, try to find that specific click
      if (tid) {
        clickQuery += ' AND (tid = ? OR click_uuid = ?)';
        clickParams.push(tid, tid);
      }

      clickQuery += ' ORDER BY created_at DESC LIMIT 1';

      const [clickRows] = await pool.query(clickQuery, clickParams);
      const click = Array.isArray(clickRows) ? clickRows[0] : clickRows;

      if (!click) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'No click found for this tracking URL. Please ensure the tracking URL was opened and try again.',
          hint: 'Wait a few seconds after opening the tracking URL before creating the test conversion'
        });
      }

      // Get publisher for postback
      const publisher = await publisherService.findById(pubId, tenantId);
      if (!publisher) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
        });
      }

      // Generate test conversion
      const { v4: uuidv4 } = await import('uuid');
      const conversionId = uuidv4();
      const affiliateClickId = click.tid || click.click_uuid;




      // Create test conversion in database
      await pool.query(
        `INSERT INTO conversions (
          conversion_uuid, click_uuid, offer_id, publisher_id, tenant_id,
          publisher_offer_id, rcid, status, amount, payout, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [
          conversionId,
          click.click_uuid,
          offerId,
          pubId,
          tenantId,
          click.publisher_offer_id || null,
          affiliateClickId,  // rcid
          'approved',
          0,  // amount (revenue)
          0,  // payout
          1   // is_test = 1 for test conversions
        ]
      );




      logger.info('[TEST CONVERSION] Created test conversion', {
        conversion_id: conversionId,
        click_id: click.click_uuid,
        offer_id: offerId,
        publisher_id: pubId,
        tenant_id: tenantId,
        is_test: true
      });


      // Fire affiliate postback if configured
      let postbackResult = null;
      if (publisher.global_postback_url) {
        try {
          let postbackUrl = publisher.global_postback_url;

          // Replace macros
          postbackUrl = postbackUrl
            .replace(/{click_id}/gi, affiliateClickId || '')
            .replace(/{clickid}/gi, affiliateClickId || '')
            .replace(/{affiliate_click_id}/gi, affiliateClickId || '')
            .replace(/{rcid}/gi, affiliateClickId || '')
            .replace(/{status}/gi, 'approved')
            .replace(/{payout}/gi, '0')
            .replace(/{amount}/gi, '0')
            .replace(/{txid}/gi, conversionId)
            .replace(/{transaction_id}/gi, conversionId)
            .replace(/{test}/gi, '1');

          const postbackStartTime = Date.now();
          const postbackResponse = await fetch(postbackUrl);
          const responseText = await postbackResponse.text().catch(() => '');

          postbackResult = {
            url: postbackUrl,
            status: postbackResponse.status,
            response: responseText.substring(0, 500),
            latency_ms: Date.now() - postbackStartTime
          };

          // Log postback
          await pool.query(
            `INSERT INTO affiliate_postback_logs (
              conversion_id, publisher_id, tenant_id, affiliate_click_id,
              postback_url, http_status, response_body, fired_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
            [
              conversionId,
              pubId,
              tenantId,
              affiliateClickId,
              postbackUrl,
              postbackResponse.status,
              responseText.substring(0, 1000)
            ]
          );

          logger.info('[TEST POSTBACK] Fired test postback', {
            conversion_id: conversionId,
            publisher_id: pubId,
            postback_url: postbackUrl,
            status: postbackResponse.status
          });
        } catch (postbackError) {
          logger.error('[TEST POSTBACK] Failed to fire postback', {
            error: postbackError.message,
            conversion_id: conversionId
          });
          postbackResult = {
            error: postbackError.message
          };
        }
      }

      return reply.send({
        success: true,
        message: 'Test conversion created and postback fired',
        data: {
          conversion_id: conversionId,
          click_id: click.click_uuid,
          affiliate_click_id: affiliateClickId,
          offer_id: offerId,
          publisher_id: pubId,
          status: 'approved',
          payout: 0,
          revenue: 0,
          is_test: true,
          postback: postbackResult
        },
        execution_time_ms: Date.now() - startTime
      });


    } catch (error) {
      logger.error('AdminController.createTestConversion error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        execution_time_ms: Date.now() - startTime,
      });
    }
  }
}

export default new AdminController();
