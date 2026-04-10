import adminController from '../controllers/adminController.js';
import contactController from '../controllers/contactController.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { requireAdminSubdomain } from '../middleware/tenant.js';

async function adminRoutes(fastify) {
  // Apply auth middleware to all admin routes
  fastify.addHook('onRequest', authenticateAdmin);

  // Test conversion
  fastify.post('/test-conversion', adminController.testConversion);

  // Test Affiliate Postback (Debug Tool)
  fastify.post('/test-affiliate-postback', adminController.testAffiliatePostback);
  fastify.post('/test-tracking-loop', adminController.testTrackingUrlLoop);
  fastify.post('/create-test-conversion', adminController.createTestConversion);
  fastify.get('/affiliate-postback-logs', adminController.getAffiliatePostbackLogs);


  // Contact Submissions (Super Admin Only - Admin Subdomain Only)
  // These routes require both admin authentication AND admin subdomain access
  fastify.get('/contact-submissions/stats', {
    preHandler: [requireAdminSubdomain, requireSuperAdmin],
    handler: contactController.getContactStats.bind(contactController),
  });

  fastify.get('/contact-submissions', {
    preHandler: [requireAdminSubdomain, requireSuperAdmin],
    handler: contactController.getAllContactSubmissions.bind(contactController),
  });

  fastify.get('/contact-submissions/:id', {
    preHandler: [requireAdminSubdomain, requireSuperAdmin],
    handler: contactController.getContactSubmission.bind(contactController),
  });

  fastify.patch('/contact-submissions/:id/status', {
    preHandler: [requireAdminSubdomain, requireSuperAdmin],
    handler: contactController.updateContactStatus.bind(contactController),
  });

  fastify.delete('/contact-submissions/:id', {
    preHandler: [requireAdminSubdomain, requireSuperAdmin],
    handler: contactController.deleteContactSubmission.bind(contactController),
  });
}

export default adminRoutes;

