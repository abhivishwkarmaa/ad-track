/**
 * Contact Routes
 * Handles contact form API endpoints
 */

import contactController from '../controllers/contactController.js';

async function contactRoutes(fastify, options) {
  // Contact form submission
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
