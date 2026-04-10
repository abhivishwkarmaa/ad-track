import adminController from '../controllers/adminController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function publisherRoutes(fastify) {
  // Apply auth middleware to all publisher routes
  fastify.addHook('onRequest', authenticateAdmin);

  // Publisher CRUD routes (Moved from admin.js)
  fastify.post('/', adminController.createPublisher);
  fastify.get('/', adminController.listPublishers);
  fastify.get('/:id', adminController.getPublisher);
  fastify.patch('/:id', adminController.updatePublisher);
  fastify.delete('/:id', adminController.deletePublisher);
}

export default publisherRoutes;
