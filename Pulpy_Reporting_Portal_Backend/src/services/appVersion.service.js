const DEFAULT_LATEST_VERSION = '1.0.0';
const DEFAULT_MIN_REQUIRED_VERSION = '1.0.0';
const DEFAULT_RELEASE_NOTES = 'General improvements';

const normalizeVersion = (version) => String(version || '').trim();

const parseSemver = (version) => {
  const normalized = normalizeVersion(version).replace(/^v/i, '');
  const core = normalized.split('-')[0];
  const parts = core.split('.');

  if (!parts.length || parts.length > 3) {
    return null;
  }

  const parsed = parts.map((part) => Number.parseInt(part, 10));
  if (parsed.some((value) => Number.isNaN(value) || value < 0)) {
    return null;
  }

  while (parsed.length < 3) {
    parsed.push(0);
  }

  return parsed;
};

const compareSemver = (a, b) => {
  const aParts = parseSemver(a);
  const bParts = parseSemver(b);

  if (!aParts || !bParts) {
    return null;
  }

  for (let i = 0; i < 3; i += 1) {
    if (aParts[i] > bParts[i]) return 1;
    if (aParts[i] < bParts[i]) return -1;
  }

  return 0;
};

const getAppVersionContract = () => {
  const latestVersion = normalizeVersion(process.env.APP_LATEST_VERSION) || DEFAULT_LATEST_VERSION;
  const minRequiredVersion = normalizeVersion(process.env.APP_MIN_REQUIRED_VERSION) || DEFAULT_MIN_REQUIRED_VERSION;
  const releaseNotes = normalizeVersion(process.env.APP_RELEASE_NOTES) || DEFAULT_RELEASE_NOTES;

  return {
    latest_version: latestVersion,
    min_required_version: minRequiredVersion,
    release_notes: releaseNotes,
  };
};

const isClientVersionAllowed = (clientVersion) => {
  const { min_required_version: minRequiredVersion } = getAppVersionContract();
  const comparison = compareSemver(clientVersion, minRequiredVersion);

  // Fail closed for malformed versions in production safety checks.
  return comparison !== null && comparison >= 0;
};

export default {
  compareSemver,
  getAppVersionContract,
  isClientVersionAllowed,
};
