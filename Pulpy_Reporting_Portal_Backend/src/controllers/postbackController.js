/**
 * 🔒 SECURE POSTBACK CONTROLLER
 * 
 * Postback endpoint is public-facing and must return minimal error responses
 * to prevent information leakage.
 */

import postbackService from '../services/postbackService.js';
import logger from '../utils/logger.js';

export class PostbackController {
  async handlePostback(request, reply) {
    // ✅ Set timeout to prevent gateway timeout (45 seconds max)
    // Increased from 30s to accommodate slower processing when click expired from Redis
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('POSTBACK_TIMEOUT')), 45000);
    });

    try {
      // Support both GET and POST
      const params = request.method === 'GET' ? request.query : request.body;

      // ✅ Race between postback processing and timeout
      const result = await Promise.race([
        postbackService.processPostback(params, request),
        timeoutPromise
      ]);

      // ✅ Return simple true/false response
      if (result.success) {
        // ✅ LOG SUCCESS DETAILS (Server-side only)
        // Include message in the log string for immediate visibility
        logger.info(`✅ Postback Success: ${result.message}`, {
          click_id: params.click_id,
          amount: params.amount,
          conversion_uuid: result.conversion?.conversion_uuid
        });

        // ✅ Simple response: just "true"
        return reply
          .code(200)
          .type('text/plain')
          .send('true');
      } else {
        // ✅ LOG FAILURE DETAILS (Server-side only)
        // Include reason in the log string for immediate visibility
        logger.warn(`❌ Postback Failed: ${result.message}`, {
          click_id: params.click_id,
          reason: result.message,
          error_type: result.error_type,
          params
        });

        // ✅ Simple response: just "false"
        return reply
          .code(200)
          .type('text/plain')
          .send('false');
      }
    } catch (error) {
      // ✅ Log full error details server-side
      // Include error message in the log string for immediate visibility
      logger.error(`❌ Postback Error: ${error.message}`, {
        reason: error.message,
        stack: error.stack,
        code: error.code,
        url: request.url,
        host: request.headers.host,
        ip: request.ip,
        params: request.method === 'GET' ? request.query : request.body
      });

      // ✅ All errors return "false" (postback convention)
      return reply
        .code(200)
        .type('text/plain')
        .send('false');
    }
  }
}

export default new PostbackController();

