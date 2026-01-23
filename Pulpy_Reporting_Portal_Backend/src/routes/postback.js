import postbackController from '../controllers/postbackController.js';

async function postbackRoutes(fastify, options) {
  // Postback endpoint - supports both GET and POST
  fastify.get('/postback',{config:{rateLimit:false}}, async (request, reply) => {
    console.log('🎯 POSTBACK ROUTE HIT (GET):', request.url);
    return postbackController.handlePostback(request, reply);
  });

  fastify.post('/postback', {config:{rateLimit:false}}, async (request, reply) => {
    console.log('🎯 POSTBACK ROUTE HIT (POST):', request.url);
    return postbackController.handlePostback(request, reply);
  });
}

export default postbackRoutes;

