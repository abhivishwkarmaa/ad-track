/**
 * Tiered rate limits (env-tunable). Hot paths (click/imp/event/postback) get higher ceilings than global API default.
 */

function n(envKey, fallback) {
  const v = parseInt(process.env[envKey] || String(fallback), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function tw(envKey, fallback = '1 minute') {
  return process.env[envKey] || fallback;
}

export const RATE_LIMITS = {
  global: {
    max: n('RATE_LIMIT_GLOBAL_MAX', 2000),
    timeWindow: tw('RATE_LIMIT_GLOBAL_WINDOW', '1 minute'),
  },
  click: {
    max: n('RATE_LIMIT_CLICK_MAX', 12000),
    timeWindow: tw('RATE_LIMIT_CLICK_WINDOW', '1 minute'),
  },
  imp: {
    max: n('RATE_LIMIT_IMP_MAX', 12000),
    timeWindow: tw('RATE_LIMIT_IMP_WINDOW', '1 minute'),
  },
  event: {
    max: n('RATE_LIMIT_EVENT_MAX', 8000),
    timeWindow: tw('RATE_LIMIT_EVENT_WINDOW', '1 minute'),
  },
  postback: {
    max: n('RATE_LIMIT_POSTBACK_MAX', 5000),
    timeWindow: tw('RATE_LIMIT_POSTBACK_WINDOW', '1 minute'),
  },
};
