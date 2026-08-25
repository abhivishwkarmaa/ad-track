/**
 * 🔒 SECURE POSTBACK CONTROLLER
 *
 * Postback endpoint is public-facing and must return minimal error responses
 * to prevent information leakage.
 *
 * Advertiser clients often time out at ~6s. If processing is still running at 4s,
 * ACK with "true" and let conversion processing continue in the background.
 */

import postbackService from '../services/postbackService.js';
import logger from '../utils/logger.js';

const ADVERTISER_SOFT_TIMEOUT_MS = 4000;

function snapshotPostbackRequest(request) {
  return {
    tenantId: request.tenantId,
    headers: { ...request.headers },
    ip: request.ip,
    url: request.url,
    method: request.method,
    socket: { remoteAddress: request.socket?.remoteAddress },
  };
}

export class PostbackController {
  async handlePostback(request, reply) {
    const params = request.method === 'GET' ? { ...request.query } : { ...(request.body || {}) };
    const requestSnapshot = snapshotPostbackRequest(request);

    const processingPromise = postbackService.processPostback(params, requestSnapshot)
      .then((result) => {
        if (result.success) {
          logger.info(`✅ Postback Success: ${result.message}`, {
            click_id: params.click_id,
            amount: params.amount,
            conversion_uuid: result.conversion?.conversion_uuid
          });
        } else {
          logger.warn(`❌ Postback Failed: ${result.message}`, {
            click_id: params.click_id,
            reason: result.message,
            error_type: result.error_type,
            params
          });
        }
        return result;
      })
      .catch((error) => {
        logger.error(`❌ Postback Error: ${error.message}`, {
          reason: error.message,
          stack: error.stack,
          code: error.code,
          url: requestSnapshot.url,
          host: requestSnapshot.headers.host,
          ip: requestSnapshot.ip,
          params
        });
        return { success: false, message: error.message };
      });

    const softTimeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ deferred: true }), ADVERTISER_SOFT_TIMEOUT_MS);
    });

    const raced = await Promise.race([processingPromise, softTimeoutPromise]);

    if (raced?.deferred) {
      logger.info('Postback ACK deferred — processing continues in background', {
        click_id: params.click_id,
        soft_timeout_ms: ADVERTISER_SOFT_TIMEOUT_MS
      });
      processingPromise.catch(() => {});
      return reply
        .code(200)
        .type('text/plain')
        .send('true');
    }

    return reply
      .code(200)
      .type('text/plain')
      .send(raced.success ? 'true' : 'false');
  }
}

export default new PostbackController();
