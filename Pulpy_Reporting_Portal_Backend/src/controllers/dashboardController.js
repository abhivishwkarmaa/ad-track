import dashboardService from '../services/dashboardService.js';
import dashboardUnifiedService from '../services/dashboardUnifiedService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

export class DashboardController {
  async getUnifiedDashboard(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const data = await dashboardUnifiedService.getDashboard({
        tenantId,
        dateFrom: request.query.date_from,
        dateTo: request.query.date_to,
        dateTimeFrom: request.query.datetime_from,
        dateTimeTo: request.query.datetime_to,
      });

      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getUnifiedDashboard error:', error);
      if (error?.message?.includes('Invalid date format')) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: error.message,
        });
      }
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  async getDashboard(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
        previous_from: request.query.previous_from,
        previous_to: request.query.previous_to,
        previous_datetime_from: request.query.previous_datetime_from,
        previous_datetime_to: request.query.previous_datetime_to,
        limit: request.query.limit,
        group_by: request.query.group_by,
        metric: request.query.metric,
      };

      // ✅ Use Aggregated Service for single-roundtrip performance
      const data = await dashboardService.getAggregatedDashboard(filters, tenantId);

      return reply.send({
        success: true,
        data: data,
      });
    } catch (error) {
      logger.error('DashboardController.getDashboard error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopOffers(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        limit: request.query.limit,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
      };

      const data = await dashboardService.getTopOffers(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getTopOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPerformanceChart(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
        group_by: request.query.group_by,
      };

      const data = await dashboardService.getPerformanceChart(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getPerformanceChart error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopAffiliates(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        limit: request.query.limit,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
      };

      const result = await dashboardService.getTopAffiliates(filters, tenantId);
      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error('DashboardController.getTopAffiliates error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getInfoCards(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const data = await dashboardService.getInfoCards(tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getInfoCards error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopCountries(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        limit: request.query.limit,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
        metric: request.query.metric,
      };

      const data = await dashboardService.getTopCountries(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getTopCountries error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getDashboardCards(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
      };

      const data = await dashboardService.getDashboardCards(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getDashboardCards error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopEvents(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        limit: request.query.limit,
      };

      const data = await dashboardService.getTopEvents(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getTopEvents error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPerformanceSummary(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
      };

      const data = await dashboardService.getPerformanceSummary(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getPerformanceSummary error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getLiveOffers(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const limit = request.query.limit || 5;
      const data = await dashboardService.getLiveOffers(limit, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getLiveOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getRecentActivity(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const limit = request.query.limit || 10;
      const data = await dashboardService.getRecentActivity(limit, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getRecentActivity error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getOfferStatistics(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        limit: request.query.limit,
        page: request.query.page,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
        sort_by: request.query.sort_by,
        order_by: request.query.order_by,
      };

      const data = await dashboardService.getOfferStatistics(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getOfferStatistics error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPublisherStatistics(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const filters = {
        limit: request.query.limit,
        page: request.query.page,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        datetime_from: request.query.datetime_from,
        datetime_to: request.query.datetime_to,
        sort_by: request.query.sort_by,
        order_by: request.query.order_by,
      };

      const data = await dashboardService.getPublisherStatistics(filters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getPublisherStatistics error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPerformanceComparison(request, reply) {
    try {
      const tenantId = getTenantIdFromRequest(request);
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      const {
        date_from,
        date_to,
        datetime_from,
        datetime_to,
        previous_from,
        previous_to,
        previous_datetime_from,
        previous_datetime_to,
        group_by = 'day',
      } = request.query;

      if (!previous_from || !previous_to) {
        return reply.send({
          success: true,
          data: [],
        });
      }

      const currentFilters = { date_from, date_to, datetime_from, datetime_to, group_by };
      const previousFilters = {
        date_from: previous_from,
        date_to: previous_to,
        datetime_from: previous_datetime_from,
        datetime_to: previous_datetime_to,
        group_by
      };

      const data = await dashboardService.getPerformanceComparison(currentFilters, previousFilters, tenantId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getPerformanceComparison error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new DashboardController();

