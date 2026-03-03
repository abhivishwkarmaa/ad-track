import appVersionService from '../services/appVersion.service.js';

const VERSION_HEADER = 'x-app-version';
const EXCLUDED_PATHS = new Set(['/api/app/version', '/health']);

const getRequestPath = (request) => (request.url || '').split('?')[0];

const shouldValidateVersion = (request) => {
  const path = getRequestPath(request);

  if (EXCLUDED_PATHS.has(path)) {
    return false;
  }

  return path.startsWith('/api/');
};

export async function enforceClientVersion(request, reply) {
  if (!shouldValidateVersion(request)) {
    return;
  }

  const clientVersion = request.headers[VERSION_HEADER];
  const isAllowed = appVersionService.isClientVersionAllowed(clientVersion);

  if (!isAllowed) {
    return reply.code(426).send({
      error: 'CLIENT_VERSION_OUTDATED',
    });
  }
}

