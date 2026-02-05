import dashboardController from '../controllers/dashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function dashboardRoutes(fastify) {
  fastify.addHook('onRequest', authenticateAdmin);
  fastify.get('/dashboard', dashboardController.getUnifiedDashboard);
}

export default dashboardRoutes;
