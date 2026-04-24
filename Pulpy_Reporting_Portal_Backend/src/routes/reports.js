import reportController from '../controllers/reportController.js';
import dashboardController from '../controllers/dashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import dashboardService from '../services/dashboardService.js';

async function reportRoutes(fastify, options) {
  // Apply auth middleware to all report routes
  fastify.addHook('onRequest', authenticateAdmin);

  // Dashboard endpoints
  fastify.get('/dashboard', dashboardController.getDashboard);
  fastify.get('/dashboard/cards', dashboardController.getDashboardCards);
  fastify.get('/dashboard/live-offers', dashboardController.getLiveOffers);
  fastify.get('/dashboard/recent-activity', dashboardController.getRecentActivity);
  fastify.get('/dashboard/top-offers', dashboardController.getTopOffers);
  fastify.get('/dashboard/performance', dashboardController.getPerformanceChart);
  fastify.get('/dashboard/top-affiliates', dashboardController.getTopAffiliates);
  fastify.get('/dashboard/info-cards', dashboardController.getInfoCards);
  fastify.get('/dashboard/top-countries', dashboardController.getTopCountries);
  fastify.get('/dashboard/offer-statistics', dashboardController.getOfferStatistics);
  fastify.get('/dashboard/publisher-statistics', dashboardController.getPublisherStatistics);
  fastify.get('/dashboard/performance-comparison', dashboardController.getPerformanceComparison);
  fastify.get('/dashboard/performance-summary', dashboardController.getPerformanceSummary);
  fastify.get('/dashboard/top-events', dashboardController.getTopEvents);

  // Reports
  fastify.get('/summary', reportController.getSummary);

  fastify.get('/detailed', reportController.getDetailed);

  // Publisher conversion statistics
  fastify.get('/publisher-conversions', reportController.getPublisherConversionStats);

  // Conversion Logs
  fastify.get('/conversions', reportController.getConversions);

  // Event summary for event-based tracking visibility
  fastify.get('/events', reportController.getEventSummary);
  // Event analytics fact table endpoint (no clicks/conversions/events main-table scan)
  fastify.get('/events/analytics', reportController.getEventAnalytics);
  // Daily pre-aggregated table endpoint (offer + publisher + event)
  fastify.get('/daily-offer-publisher', reportController.getDailyOfferPublisherStats);

  // Manual Click Approval
  fastify.post('/approve-click', reportController.manualApproveClick)
}

export default reportRoutes;

