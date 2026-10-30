/**
 * Super-admin flag: whether publishers may log in on a tenant subdomain.
 * Missing values stay enabled so older cached tenant rows do not lock anyone out.
 */
export function isPublisherLoginEnabled(tenant) {
  if (!tenant || tenant.publisher_login_enabled === undefined || tenant.publisher_login_enabled === null) {
    return true;
  }
  const value = tenant.publisher_login_enabled;
  return value === true || value === 1 || value === '1';
}

/**
 * @returns {0|1|undefined|null} undefined when omitted, null when invalid
 */
export function parsePublisherLoginEnabled(value) {
  if (value === undefined) return undefined;
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  return null;
}
