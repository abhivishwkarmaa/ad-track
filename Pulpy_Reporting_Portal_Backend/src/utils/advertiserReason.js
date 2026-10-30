const ADVERTISER_REASON_MAX = 128;

/**
 * Advertiser postback reason is free text (parking, grace, or anything else).
 * Trim, drop control characters, and cap length. Empty becomes null.
 */
export function normalizeAdvertiserReason(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return null;
  const text = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.slice(0, ADVERTISER_REASON_MAX);
}
