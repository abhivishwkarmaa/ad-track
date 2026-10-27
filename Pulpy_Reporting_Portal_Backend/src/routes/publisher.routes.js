import publisherPortalController from '../controllers/publisherPortalController.js';
import { authenticatePublisher } from '../middleware/auth.js';

async function publisherRoutes(fastify, options) {
  // All routes inside require publisher authentication and strict tenant matching
  fastify.addHook('preHandler', authenticatePublisher);

  // Publisher Dashboard Overview
  fastify.get('/dashboard', publisherPortalController.getDashboard.bind(publisherPortalController));

  // Assigned Offers & Tracking Links
  fastify.get('/offers', publisherPortalController.getOffers.bind(publisherPortalController));

  // Scoped Performance Reports
  fastify.get('/reports', publisherPortalController.getReports.bind(publisherPortalController));

  // Profile & Postback Settings
  fastify.get('/profile', publisherPortalController.getProfile.bind(publisherPortalController));
  fastify.put('/profile', publisherPortalController.updateProfile.bind(publisherPortalController));

  // Change Password via email OTP (logged-in publisher only)
  fastify.post('/change-password/request-otp', publisherPortalController.requestPasswordOtp.bind(publisherPortalController));
  fastify.post('/change-password/verify-otp', publisherPortalController.verifyPasswordOtp.bind(publisherPortalController));
  fastify.post('/change-password/reset', publisherPortalController.resetPasswordWithOtp.bind(publisherPortalController));
  fastify.post('/change-password', publisherPortalController.changePassword.bind(publisherPortalController));
}

export default publisherRoutes;
