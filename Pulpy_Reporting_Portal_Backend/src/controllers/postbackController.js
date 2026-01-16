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
    try {
      // Support both GET and POST
      const params = request.method === 'GET' ? request.query : request.body;

      const result = await postbackService.processPostback(params, request);

      // Transform conversion data: rename click_uuid to click_id for API response
      let conversionData = result.conversion || null;
      if (conversionData && conversionData.click_uuid) {
        conversionData = {
          ...conversionData,
          click_id: conversionData.click_uuid,
        };
        // Remove click_uuid from response (keep only click_id)
        delete conversionData.click_uuid;
      }

      return reply.send({
        success: result.success,
        message: result.message,
        duplicate: result.duplicate || false,
        affiliate_postback: result.affiliate_postback || null,
        data: conversionData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // ✅ Log full error details server-side
      logger.error('PostbackController.handlePostback error:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        url: request.url,
        host: request.headers.host,
        ip: request.ip
      });
      
      // Handle rate limiting
      if (error.code === 'RETRY_LATER') {
        const retrySeconds = 60;
        return reply
          .code(429)
          .header('Retry-After', retrySeconds)
          .send({
            success: false
            // ✅ Minimal response - no error details
          });
      }

      // ✅ Let error handler create appropriate response
      throw error;
    }
  }
}

export default new PostbackController();

