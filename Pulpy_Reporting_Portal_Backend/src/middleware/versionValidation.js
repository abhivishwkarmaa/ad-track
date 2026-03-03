import appVersionService from '../services/appVersion.service.js';
import logger from '../utils/logger.js';

const VERSION_HEADER = 'x-app-version';
const INTERNAL_CALL_HEADER = 'x-internal-call';

export async function enforceClientVersion(request, reply) {
  if (request.headers[INTERNAL_CALL_HEADER] === 'true') {
    logger.warn('Skipping client version validation for internal call', {
      url: request.url,
      method: request.method,
      ip: request.ip,
    });
    return;
  }

  const clientVersion = request.headers[VERSION_HEADER];
  if (!clientVersion) {
    return reply.code(400).send({
      error: 'VERSION_HEADER_REQUIRED',
    });
  }

  const isAllowed = appVersionService.isClientVersionAllowed(clientVersion);

  if (!isAllowed) {
    return reply.code(426).send({
      error: 'CLIENT_VERSION_OUTDATED',
    });
  }
}

