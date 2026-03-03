import dashboardController from '../controllers/dashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { enforceClientVersion } from '../middleware/versionValidation.js';

async function dashboardRoutes(fastify) {
  fastify.addHook('onRequest', authenticateAdmin);
  fastify.addHook('preHandler', enforceClientVersion);
  fastify.get('/dashboard', dashboardController.getUnifiedDashboard);
}

export default dashboardRoutes;
