import offerController from '../controllers/offer.controller.js';
import adminController from '../controllers/adminController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function offerRoutes(fastify) {
  // Protected routes (create/update/delete/status)
  fastify.post(
    '/',
    {
      preHandler: authenticateAdmin,
    },
    offerController.createOffer
  );

  fastify.get(
    '/:id/edit',
    {
      preHandler: authenticateAdmin,
    },
    offerController.getofferDetail
  );

  fastify.patch(
    '/:id',
    {
      preHandler: authenticateAdmin,
    },
    offerController.updateOffer
  );

  fastify.patch(
    '/:id/status',
    {
      preHandler: authenticateAdmin,
    },
    offerController.changeStatus
  );

  fastify.delete(
    '/:id',
    {
      preHandler: authenticateAdmin,
    },
    offerController.deleteOffer
  );

  // --- Assignment Management (Moved from admin.js) ---
  fastify.post(
    '/assignments',
    {
      preHandler: authenticateAdmin,
    },
    adminController.createAssignment
  );

  fastify.patch(
    '/assignments/:id',
    {
      preHandler: authenticateAdmin,
    },
    offerController.updateAssignment
  );

  fastify.get(
    '/assignments',
    {
      preHandler: authenticateAdmin,
    },
    adminController.listAssignments
  );

  fastify.get(
    '/assignments/:id/tracking-url',
    {
      preHandler: authenticateAdmin,
    },
    adminController.getTrackingURL
  );

  fastify.get(
    '/assignments/:id',
    {
      preHandler: authenticateAdmin,
    },
    adminController.getAssignment
  );

  fastify.delete(
    '/assignments/:id',
    {
      preHandler: authenticateAdmin,
    },
    adminController.deleteAssignment
  );

  // --- Public GETs ---
  fastify.get(
    '/',
    offerController.listOffers
  );

  fastify.get(
    '/search',
    offerController.searchOffers
  );

  fastify.get(
    '/:id',
    offerController.getOffer
  );

  fastify.get(
    '/:id/stats',
    offerController.getStats
  );

  fastify.get(
    '/:id/daily-stats',
    offerController.getDailyStats
  );

  fastify.get(
    '/:id/assignments',
    offerController.getAssignments
  );

  fastify.get(
    '/:id/recent-clicks',
    offerController.getRecentClicks
  );

  fastify.get(
    '/:id/recent-conversions',
    offerController.getRecentConversions
  );

  fastify.get(
    '/:id/publisher-stats',
    offerController.getPublisherStats
  );
}

export default offerRoutes;