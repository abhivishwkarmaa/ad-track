import dashboardController from '../controllers/dashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function dashboardRoutes(fastify) {
  fastify.addHook('onRequest', authenticateAdmin);

  // Consolidated Unified Dashboard
  fastify.get('/', dashboardController.getUnifiedDashboard);
  
  // Legacy/Specific Analytics Endpoints (Moved from reports.js)
  fastify.get('/stats', dashboardController.getDashboard);
  fastify.get('/cards', dashboardController.getDashboardCards);
  fastify.get('/live-offers', dashboardController.getLiveOffers);
  fastify.get('/recent-activity', dashboardController.getRecentActivity);
  fastify.get('/top-offers', dashboardController.getTopOffers);
  fastify.get('/performance', dashboardController.getPerformanceChart);
  fastify.get('/top-affiliates', dashboardController.getTopAffiliates);
  fastify.get('/info-cards', dashboardController.getInfoCards);
  fastify.get('/top-countries', dashboardController.getTopCountries);
  fastify.get('/offer-statistics', dashboardController.getOfferStatistics);
  fastify.get('/publisher-statistics', dashboardController.getPublisherStatistics);
  fastify.get('/performance-comparison', dashboardController.getPerformanceComparison);
  fastify.get('/performance-summary', dashboardController.getPerformanceSummary);
}

export default dashboardRoutes;
