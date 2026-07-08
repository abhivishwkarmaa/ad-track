/**
 * Helpers for ISP / carrier / city list targeting fields on offer forms.
 * Backend expects { mode: 'allow'|'block', items: string[] } (or legacy array).
 */

export function parseListTargetingField(jsonValue, legacyItemKey) {
  if (!jsonValue) return { action: 'ALLOW', list: '' };

  let o = jsonValue;
  if (typeof jsonValue === 'string') {
    try {
      o = JSON.parse(jsonValue);
    } catch {
      return { action: 'ALLOW', list: '' };
    }
  }

  if (Array.isArray(o)) {
    return { action: 'ALLOW', list: o.filter(Boolean).join(', ') };
  }

  if (typeof o === 'object' && o !== null) {
    const mode = String(o.mode || o.action || 'allow').toUpperCase();
    const action = mode === 'BLOCK' ? 'BLOCK' : 'ALLOW';
    const raw = o.items || o[legacyItemKey] || o.isps || o.cities || o.carriers || o.values || o.list || [];
    const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    return { action, list: arr.filter(Boolean).join(', ') };
  }

  return { action: 'ALLOW', list: '' };
}

export function buildListTargetingPayload(action, commaList) {
  const items = String(commaList || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  const mode = String(action || 'ALLOW').toLowerCase() === 'block' ? 'block' : 'allow';
  return { mode, items };
}
