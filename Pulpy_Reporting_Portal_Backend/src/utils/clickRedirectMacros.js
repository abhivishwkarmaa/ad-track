/**
 * Macros substituted on the advertiser redirect.
 * System tokens are filled from the click. Publisher tokens are filled only
 * when the tracking link carries them; otherwise the placeholder is cleared.
 */
import crypto from 'crypto';
import { replaceMacros } from './urlGenerator.js';
import { extractIP } from './ipExtractor.js';
import { parseDevice } from './deviceParser.js';
import { getLocationFromIP, getCountryFromHeaders } from './countryLookup.js';

/** Query keys the publisher may send, mapped onto the token name shown in the offer form. */
const PUBLISHER_MACRO_QUERY_KEYS = {
  aff_sub1: ['aff_sub1', 'aff_sub', 'sub1', 's1'],
  aff_sub2: ['aff_sub2', 'sub2', 's2'],
  aff_sub3: ['aff_sub3', 'sub3', 's3'],
  aff_sub4: ['aff_sub4', 'sub4', 's4'],
  aff_sub5: ['aff_sub5', 'sub5', 's5'],
  sub_aff_id: ['sub_aff_id', 'subaff_id', 'sub_publisher_id'],
  source: ['source', 'src', 'utm_source'],
  deviceid: ['deviceid', 'device_id'],
  googleaid: ['googleaid', 'google_aid', 'google_id', 'gaid'],
  androidid: ['androidid', 'android_id'],
  iosidfa: ['iosidfa', 'ios_ifa', 'idfa', 'ios_idfa'],
};

export const PUBLISHER_CLICK_MACRO_NAMES = Object.keys(PUBLISHER_MACRO_QUERY_KEYS);

function queryLookup(query) {
  const map = {};
  if (!query || typeof query !== 'object') return map;
  for (const [key, value] of Object.entries(query)) {
    const lk = String(key).toLowerCase();
    if (map[lk] === undefined) map[lk] = value;
  }
  return map;
}

function firstQueryValue(query, keys) {
  const map = queryLookup(query);
  for (const key of keys) {
    const value = map[key];
    if (value == null) continue;
    const raw = Array.isArray(value) ? value[0] : value;
    const text = String(raw).trim();
    if (text !== '') return text;
  }
  return '';
}

function collectPublisherMacros(query) {
  const out = {};
  for (const [macro, keys] of Object.entries(PUBLISHER_MACRO_QUERY_KEYS)) {
    const value = firstQueryValue(query, keys);
    if (value !== '') out[macro] = encodeURIComponent(value);
  }
  return out;
}

/** Keep a raw user agent from splitting the query string. */
function rawUserAgent(ua) {
  if (!ua) return '';
  if (/[&?#]/.test(ua)) return encodeURIComponent(ua);
  return ua;
}

function utcTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * @param {object} input
 * @param {string} input.clickUuid
 * @param {object} [input.offer]
 * @param {object} [input.publisher]
 * @param {object} [input.query]
 * @param {object} [input.request]
 * @param {string} [input.country]
 * @param {object} [input.deviceInfo]
 * @param {string} [input.advertiserPublicId]
 * @param {object} [input.mergedOfferParams]
 */
export function buildClickRedirectMacros({
  clickUuid,
  offer,
  publisher,
  query,
  request,
  country,
  deviceInfo,
  advertiserPublicId,
  mergedOfferParams,
} = {}) {
  const ua = request?.headers?.['user-agent'] || '';
  const ip = request ? extractIP(request) : '';
  const device = deviceInfo || parseDevice(ua);
  const countryValue =
    country != null && String(country).trim() !== ''
      ? String(country)
      : request
        ? getLocationFromIP(ip).country || getCountryFromHeaders(request) || ''
        : '';

  const system = {
    tid: clickUuid || '',
    ip: ip && ip !== 'unknown' ? ip : '',
    offerid: String(offer?.public_offer_id || offer?.id || ''),
    useragent: ua ? encodeURIComponent(ua) : '',
    raw_useragent: rawUserAgent(ua),
    aff_id: String(publisher?.public_publisher_id || publisher?.id || ''),
    adv_id: advertiserPublicId != null ? String(advertiserPublicId) : '',
    country: countryValue,
    timestamp: utcTimestamp(),
    random: crypto.randomBytes(8).toString('hex'),
    os: device?.os || '',
    os_ver: device?.osVersion || '',
  };

  return {
    click_id: clickUuid || '',
    rcid: firstQueryValue(query, ['rcid']),
    ...collectPublisherMacros(query),
    ...(mergedOfferParams || {}),
    ...system,
    click_id: clickUuid || '',
    tid: clickUuid || '',
  };
}

/**
 * Replace click-redirect macros, including empty system values, and drop
 * publisher placeholders the tracking link did not supply.
 */
export function applyRedirectMacros(url, macroValues = {}) {
  if (!url) return url;

  let result = replaceMacros(url, {
    click_id: macroValues.click_id,
    rcid: macroValues.rcid,
    tid: macroValues.tid,
  });

  for (const [key, val] of Object.entries(macroValues)) {
    if (val == null) continue;
    if (!/^[a-zA-Z0-9_]+$/.test(key)) continue;
    const text = String(val);
    result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), () => text);
  }

  if (macroValues.raw_useragent != null) {
    const text = String(macroValues.raw_useragent);
    result = result.replace(/\{row-useragent\}/gi, () => text);
  }

  for (const name of PUBLISHER_CLICK_MACRO_NAMES) {
    result = result.replace(new RegExp(`\\{${name}\\}`, 'gi'), '');
  }

  return result;
}
