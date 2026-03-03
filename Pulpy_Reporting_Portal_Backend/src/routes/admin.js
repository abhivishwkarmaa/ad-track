import adminController from '../controllers/adminController.js';
import contactController from '../controllers/contactController.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { requireAdminSubdomain } from '../middleware/tenant.js';
import { enforceClientVersion } from '../middleware/versionValidation.js';

async function adminRoutes(fastify) {
  // Apply auth middleware to all admin routes
  fastify.addHook('onRequest', authenticateAdmin);
  fastify.addHook('preHandler', enforceClientVersion);

  // Publisher routes
  fastify.post('/publishers', adminController.createPublisher);
  fastify.patch('/publishers/:id', adminController.updatePublisher);
  fastify.delete('/publishers/:id', adminController.deletePublisher);

  fastify.get('/publishers', adminController.listPublishers);
  fastify.get('/publishers/:id', adminController.getPublisher);

  // Assignment routes (more specific paths MUST come before /assignments/:id so :id doesn't capture "2/tracking-url")
  fastify.post('/assignments', adminController.createAssignment);
  fastify.patch('/assignments/:id', adminController.updateAssignment);
  fastify.get('/assignments', adminController.listAssignments);
  fastify.get('/assignments/:id/tracking-url', adminController.getTrackingURL);
  fastify.get('/assignments/:id', adminController.getAssignment);
  fastify.delete('/assignments/:id', adminController.deleteAssignment);

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

