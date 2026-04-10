/**
 * Contact Routes
 * Handles contact form API endpoints
 */

import contactController from '../controllers/contactController.js';

async function contactRoutes(fastify, options) {
  // Send OTP for contact form verification
  fastify.post('/contact/send-otp', {
    handler: contactController.sendOtp.bind(contactController),
  });

  // Verify OTP and submit contact form
  fastify.post('/contact/verify-otp', {
    handler: contactController.verifyOtp.bind(contactController),
  });

  // Contact form submission (legacy endpoint - kept for backward compatibility)
  fastify.post('/contact', {
    handler: contactController.submitContact.bind(contactController),
  });
}

export default contactRoutes;
