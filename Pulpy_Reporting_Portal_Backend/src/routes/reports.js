import reportController from '../controllers/reportController.js';
import dashboardController from '../controllers/dashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import dashboardService from '../services/dashboardService.js';

async function reportRoutes(fastify, options) {
  // Apply auth middleware to all report routes
  fastify.addHook('onRequest', authenticateAdmin);

  // Reports
  fastify.get('/summary', reportController.getSummary);

  fastify.get('/detailed', reportController.getDetailed);

  // Publisher conversion statistics
  fastify.get('/publisher-conversions', reportController.getPublisherConversionStats);

  // Conversion Logs
  fastify.get('/conversions', reportController.getConversions);

  // Manual Click Approval
  fastify.post('/approve-click', reportController.manualApproveClick)
}

export default reportRoutes;

