/**
 * 🔒 SECURE TRACKING CONTROLLER
 * 
 * Tracking endpoints are public-facing and must return minimal error responses
 * to prevent information leakage.
 */

import trackingService from '../services/trackingService.js';
import logger from '../utils/logger.js';

export class TrackingController {
  async handleClick(request, reply) {
    try {
      const result = await trackingService.trackClick(request.query, request);

      // If HTML error page is returned (offer invalid), return HTML instead of redirecting
      if (result.html) {
        return reply.type('text/html').code(200).send(result.html);
      }

      // Layer 3: When fire-and-forget mode is enabled, trackClick returns a `persistAsync`
      // thunk. We dispatch the redirect first, then schedule the Redis pipeline writes
      // on the next tick via setImmediate so they never sit on the request critical path.
      // Default mode (`persistAsync` undefined) is byte-identical to pre-Layer-3 behavior.
      if (result.persistAsync) {
        reply.redirect(result.redirect, 302);
        setImmediate(() => {
          result.persistAsync().catch((err) => {
            logger.error({
              error: err.message,
              stack: err.stack,
              click_id: result.clickId,
              url: request.url
            }, '[CLICK] Async persist failed (fire-and-forget)');
          });
        });
        return reply;
      }

      // Default: redirect after persistence already completed inline
      return reply.redirect(result.redirect, 302);
    } catch (error) {
      // ✅ Log full error details server-side
      logger.error({
        error: error.message,
        stack: error.stack,
        url: request.url,
        host: request.headers.host,
        ip: request.ip
      }, 'TrackingController.handleClick error:');

      // ✅ Return minimal response for tracking endpoints
      // Let error handler decide the response format
      throw error;
    }
  }

  async handleImpression(request, reply) {
    try {
      const result = await trackingService.trackImpression(request.query, request);

      if (!result.success) {
        // ✅ Log full error details server-side
        logger.warn('TrackingController.handleImpression failed:', {
          error: result.error,
          url: request.url,
          host: request.headers.host,
          ip: request.ip
        });

        // ✅ Return minimal response - just 1x1 pixel (silent failure)
        // For tracking pixels, it's better to return pixel than error JSON
        return reply.code(200).type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
      }

      // Return 1x1 pixel or success response
      return reply.code(200).type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    } catch (error) {
      // ✅ Log full error details server-side
      logger.error('TrackingController.handleImpression error:', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        host: request.headers.host,
        ip: request.ip
      });

      // ✅ For impression tracking, return pixel even on error (silent failure)
      // This prevents breaking tracking pixels with error responses
      return reply.code(200).type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
  }
}

export default new TrackingController();

