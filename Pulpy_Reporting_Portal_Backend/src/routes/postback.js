import postbackController from '../controllers/postbackController.js';
import { RATE_LIMITS } from '../config/rateLimits.js';

async function postbackRoutes(fastify, options) {
  const rl = { config: { rateLimit: RATE_LIMITS.postback } };
  fastify.get('/postback', rl, postbackController.handlePostback);
  fastify.post('/postback', rl, postbackController.handlePostback);
}

export default postbackRoutes;

