/**
 * Central JWT secret resolution and production startup validation.
 * Placeholder literals must only appear in this module.
 */

export const JWT_PLACEHOLDER_VALUES = new Set([
  'admin-secret-key-change-in-production',
  'tenant-secret-key-change-in-production',
  'your-secret-key-change-in-production',
]);

const DEV_ADMIN_FALLBACK = 'admin-secret-key-change-in-production';
const DEV_TENANT_FALLBACK = 'tenant-secret-key-change-in-production';
const DEV_LEGACY_FALLBACK = 'your-secret-key-change-in-production';

export function getAdminJwtSecret() {
  return process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || DEV_ADMIN_FALLBACK;
}

export function getTenantJwtSecret() {
  return process.env.TENANT_JWT_SECRET || process.env.JWT_SECRET || DEV_TENANT_FALLBACK;
}

/** Legacy verify path when admin + tenant secrets both fail */
export function getLegacyJwtSecret() {
  return process.env.JWT_SECRET || DEV_LEGACY_FALLBACK;
}

/**
 * In production, refuse to start if effective secrets are missing or still use dev placeholders.
 */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;

  const failures = [];
  const check = (label, value) => {
    const v = value != null ? String(value).trim() : '';
    if (!v) failures.push(`${label} is unset or empty`);
    else if (JWT_PLACEHOLDER_VALUES.has(v)) failures.push(`${label} uses a placeholder/default value`);
  };

  check('Effective admin signing secret (ADMIN_JWT_SECRET || JWT_SECRET)', getAdminJwtSecret());
  check('Effective tenant signing secret (TENANT_JWT_SECRET || JWT_SECRET)', getTenantJwtSecret());
  check('Legacy JWT path (JWT_SECRET)', getLegacyJwtSecret());

  if (failures.length) {
    console.error('[FATAL] Production JWT configuration invalid:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}
