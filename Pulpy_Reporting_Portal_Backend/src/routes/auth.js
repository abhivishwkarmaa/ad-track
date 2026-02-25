import authController from '../controllers/authController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function authRoutes(fastify, options) {
  // Public routes (no auth required)
  // fastify.post('/register', authController.register);
  fastify.post('/login', authController.login);
  fastify.post('/refresh', authController.refresh.bind(authController));
  fastify.post('/logout', authController.logout.bind(authController));
  fastify.post('/register', authController.register);
  // Protected route (requires auth)
  fastify.get('/profile', {
    preHandler: authenticateAdmin,
  }, authController.getProfile);
  fastify.patch('/profile', {
    preHandler: authenticateAdmin,
  }, authController.updateProfile.bind(authController));

  // Password Reset (Public)
  fastify.post('/forgot-password/request-otp', authController.requestOtp.bind(authController));
  fastify.post('/forgot-password/verify-otp', authController.verifyResetOtp.bind(authController));
  fastify.post('/forgot-password/reset', authController.resetPassword.bind(authController));

  // Change Password (Authenticated)
  fastify.post('/change-password/request-otp', {
    preHandler: authenticateAdmin
  }, authController.requestOtp.bind(authController));

  fastify.post('/change-password/verify-otp', {
    preHandler: authenticateAdmin
  }, authController.verifyResetOtp.bind(authController));

  fastify.post('/change-password/reset', {
    preHandler: authenticateAdmin
  }, authController.resetPassword.bind(authController));
}

export default authRoutes;

