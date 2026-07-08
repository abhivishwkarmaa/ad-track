/**
 * ISP / city / carrier-style list targeting from *_targeting_json (no separate *_action DB columns).
 * Supports: string[] or { mode: 'allow'|'block', items: [...] } (aliases: action, isps, cities, carriers, values, list).
 */

function parseListTargeting(jsonField) {
  if (jsonField == null || jsonField === '') return null;
  let o = jsonField;
  if (typeof jsonField === 'string') {
    try {
      o = JSON.parse(jsonField);
    } catch {
      return null;
    }
  }
  if (Array.isArray(o)) {
    const items = o.map(String).filter(Boolean).filter((x) => x !== 'All');
    return items.length ? { mode: 'allow', items } : null;
  }
  if (typeof o === 'object' && o !== null) {
    const mode = String(o.mode || o.action || 'allow').toLowerCase() === 'block' ? 'block' : 'allow';
    const raw = o.items || o.isps || o.cities || o.carriers || o.values || o.list || o.targets || [];
    const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    const items = arr.map(String).filter(Boolean).filter((x) => x !== 'All');
    return items.length ? { mode, items } : null;
  }
  return null;
}

function matchesItem(observed, item) {
  const o = String(observed).toLowerCase();
  const i = String(item).toLowerCase();
  if (!o || !i) return false;
  return o.includes(i) || i.includes(o);
}

/**
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function evaluateListTargetingRule(jsonField, observedValue) {
  const def = parseListTargeting(jsonField);
  if (!def) return { allowed: true };
  const obs = String(observedValue ?? '').trim();
  if (!obs) {
    return { allowed: def.mode !== 'allow', reason: 'empty_value' };
  }
  const hit = def.items.some((it) => matchesItem(obs, it));
  if (def.mode === 'allow') {
    return hit ? { allowed: true } : { allowed: false, reason: 'not_in_allowlist' };
  }
  return hit ? { allowed: false, reason: 'blocked' } : { allowed: true };
}

/**
 * Resolves ISP for IP, then evaluates isp / city / carrier JSON rules.
 * @param {object} offer — row from DB/cache
 * @param {{ ip: string, getISP: (ip: string) => Promise<string|null> }} ctx
 * @returns {Promise<{ ok: boolean, error_type?: string, message?: string }>}
 */
export async function evaluateOfferIspCityCarrierTargeting(offer, ctx) {
  const { ip, getISP } = ctx;
  const { getLocationFromIP } = await import('../utils/countryLookup.js');
  const location = getLocationFromIP(ip);
  const city = location.city || '';
  let isp = '';
  try {
    isp = (await getISP(ip)) || '';
  } catch {
    isp = '';
  }

  const rIsp = evaluateListTargetingRule(offer.isp_targeting_json, isp);
  if (!rIsp.allowed) {
    return { ok: false, error_type: 'isp_blocked', message: 'ISP not allowed for this offer' };
  }

  const rCity = evaluateListTargetingRule(offer.city_targeting_json, city);
  if (!rCity.allowed) {
    return { ok: false, error_type: 'city_blocked', message: 'City not allowed for this offer' };
  }

  const carrierHaystack = [isp, offer.carrier_name || ''].filter(Boolean).join(' ');
  const rCarrier = evaluateListTargetingRule(offer.carrier_targeting_json, carrierHaystack);
  if (!rCarrier.allowed) {
    return { ok: false, error_type: 'carrier_blocked', message: 'Carrier / network not allowed for this offer' };
  }

  return { ok: true };
}
