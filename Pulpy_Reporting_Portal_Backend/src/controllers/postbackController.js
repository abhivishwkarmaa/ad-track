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
    // ✅ Set timeout to prevent gateway timeout (30 seconds max)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('POSTBACK_TIMEOUT')), 30000);
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
          success: true,
          message: result.message,
          duplicate: result.duplicate || false,
          affiliate_postback: result.affiliate_postback || null,
          data: conversionData,
          timestamp: new Date().toISOString(),
        });
      } else {
        // ✅ Return false for failed conversions (caps, rejections, etc.)
        return reply.send({
          success: false,
          message: result.message || 'Conversion failed',
          error_type: result.error_type || 'unknown',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      // ✅ Log full error details server-side
      logger.error('PostbackController.handlePostback error:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        url: request.url,
        host: request.headers.host,
        ip: request.ip,
        params: request.method === 'GET' ? request.query : request.body
      });

      // Handle timeout
      if (error.message === 'POSTBACK_TIMEOUT') {
        return reply
          .code(408)
          .send({
            success: false,
            message: 'Postback processing timeout',
            error_type: 'timeout',
            timestamp: new Date().toISOString()
          });
      }

      // Handle rate limiting
      if (error.code === 'RETRY_LATER') {
        const retrySeconds = 60;
        return reply
          .code(429)
          .header('Retry-After', retrySeconds)
          .send({
            success: false,
            message: 'Rate limit exceeded',
            error_type: 'rate_limit',
            timestamp: new Date().toISOString()
          });
      }

      // ✅ Return false for all other errors (click not found, invalid data, etc.)
      return reply
        .code(200) // Return 200 even for errors (postback convention)
        .send({
          success: false,
          message: error.message || 'Postback processing failed',
          error_type: error.code || 'processing_error',
          timestamp: new Date().toISOString()
        });
    }
  }
}

export default new PostbackController();

