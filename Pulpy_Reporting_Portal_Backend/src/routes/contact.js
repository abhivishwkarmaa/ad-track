/**
 * Contact Routes
 * Handles contact form API endpoints
 */

import contactController from '../controllers/contactController.js';

async function contactRoutes(fastify, options) {
  // Send OTP for contact form verification
  fastify.post('/contact/send-otp', {
    schema: {
      description: 'Send OTP for contact form verification',
      tags: ['contact'],
      body: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'message'],
        properties: {
          firstName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'First name',
          },
          lastName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Last name',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address',
          },
          message: {
            type: 'string',
            minLength: 10,
            maxLength: 5000,
            description: 'Message content',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: contactController.sendOtp.bind(contactController),
  });

  // Verify OTP and submit contact form
  fastify.post('/contact/verify-otp', {
    schema: {
      description: 'Verify OTP and submit contact form',
      tags: ['contact'],
      body: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address',
          },
          otp: {
            type: 'string',
            pattern: '^\\d{6}$',
            description: '6-digit OTP code',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: contactController.verifyOtp.bind(contactController),
  });

  // Contact form submission (legacy endpoint - kept for backward compatibility)
  fastify.post('/contact', {
    schema: {
      description: 'Submit contact form',
      tags: ['contact'],
      body: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'message'],
        properties: {
          firstName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'First name',
          },
          lastName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Last name',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address',
          },
          message: {
            type: 'string',
            minLength: 10,
            maxLength: 5000,
            description: 'Message content',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: contactController.submitContact.bind(contactController),
  });
}

export default contactRoutes;
