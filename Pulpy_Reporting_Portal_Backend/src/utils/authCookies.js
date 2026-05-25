export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Cookie options for refresh_token behind NGINX (X-Forwarded-Proto).
 * Browsers on HTTPS reject or drop cookies without Secure when NODE_ENV is not production.
 */
export function getRefreshCookieOptions(request = null) {
  const forwardedProto = String(request?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  // Secure by default (required on https://*.track-myads.com). Local http://localhost dev only: COOKIE_SECURE=false
  const secure = process.env.COOKIE_SECURE !== 'false';

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };
}

/** Match set-cookie attributes when clearing (required by some browsers). */
export function getClearRefreshCookieOptions(request = null) {
  const { secure, sameSite, path, httpOnly } = getRefreshCookieOptions(request);
  return { path, secure, sameSite, httpOnly };
}
