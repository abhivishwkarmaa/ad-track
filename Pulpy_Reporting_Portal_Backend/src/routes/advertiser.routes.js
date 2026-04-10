import advertiserController from '../controllers/advertiser.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function advertiserRoutes(fastify) {
  // Protect all advertiser routes with JWT
  fastify.addHook('onRequest', authenticateAdmin);

  fastify.post('/', advertiserController.createAdvertiser);
  fastify.patch('/:id', advertiserController.updateAdvertiser);
  fastify.get('/', advertiserController.listAdvertisers);
  fastify.get('/:id', advertiserController.getAdvertiser);
  fastify.delete('/:id', advertiserController.deleteAdvertiser);
}

export default advertiserRoutes;
