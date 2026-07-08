/**
 * Shared offer gates for click + impression: schedule (IST time window) + geo/device targeting.
 */
import { parseDevice } from '../utils/deviceParser.js';
import { getLocationFromIP, getCountryFromHeaders } from '../utils/countryLookup.js';
import { getISP } from '../utils/ispLookup.js';
import { checkOfferValidity, validateConversionSchedule } from './offer.validation.js';
import { evaluateOfferIspCityCarrierTargeting } from './offerTargetingEvaluation.js';
import logger from '../utils/logger.js';

/**
 * @returns {Promise<
 *   | { ok: true; deviceInfo: object; location: { country?: string; region?: string; city?: string }; country_final: string }
 *   | { ok: false; message: string; error_type: string }
 * >}
 */
export async function enforceOfferTrafficRules(offer, { ip, userAgent, request }) {
  const live = checkOfferValidity(offer);
  if (!live.valid) {
    return { ok: false, message: live.message, error_type: live.error_type };
  }

  const sched = validateConversionSchedule(offer);
  if (!sched.valid) {
    return { ok: false, message: sched.message, error_type: sched.error_type };
  }

  const deviceInfo = parseDevice(userAgent);

  const offerIpAction = offer.ip_action ? String(offer.ip_action).toLowerCase() : null;
  if (offerIpAction && offer.ip_list) {
    const ipList = String(offer.ip_list)
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);
    const isIpMatch = ipList.includes(ip);
    if (offerIpAction === 'allow' && !isIpMatch) {
      return { ok: false, message: 'IP not allowed', error_type: 'ip_blocked' };
    }
    if (offerIpAction === 'block' && isIpMatch) {
      return { ok: false, message: 'IP blocked', error_type: 'ip_blocked' };
    }
  }

  const location = getLocationFromIP(ip);
  const country_final = location.country || getCountryFromHeaders(request) || '';

  const offerCountryAction = offer.country_action ? String(offer.country_action).toLowerCase() : null;
  if (offerCountryAction && offer.country_list) {
    const countryList = String(offer.country_list)
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const isCountryMatch = countryList.includes(country_final.toLowerCase());
    if (offerCountryAction === 'allow' && !isCountryMatch) {
      return { ok: false, message: 'Country not allowed', error_type: 'country_blocked' };
    }
    if (offerCountryAction === 'block' && isCountryMatch) {
      return { ok: false, message: 'Country blocked', error_type: 'country_blocked' };
    }
  }

  const offerDeviceAction = offer.device_action ? String(offer.device_action).toLowerCase() : null;
  if (offerDeviceAction && offer.device_targeting_json) {
    try {
      const dt =
        typeof offer.device_targeting_json === 'string'
          ? JSON.parse(offer.device_targeting_json)
          : offer.device_targeting_json;
      const allowedDevices = Array.isArray(dt) ? dt : dt?.device || dt?.devices || [];
      if (allowedDevices.length > 0 && !allowedDevices.includes('All')) {
        const isMatch =
          allowedDevices.includes(deviceInfo.deviceType) ||
          allowedDevices.map((d) => d.toLowerCase()).includes(deviceInfo.deviceType.toLowerCase());
        if (offerDeviceAction === 'allow' && !isMatch) {
          return { ok: false, message: 'Device not allowed', error_type: 'device_blocked' };
        }
        if (offerDeviceAction === 'block' && isMatch) {
          return { ok: false, message: 'Device blocked', error_type: 'device_blocked' };
        }
      }
    } catch (e) {
      logger.warn('Parsing device_targeting_json failed', e);
    }
  }

  const offerBrowserAction = offer.browser_action ? String(offer.browser_action).toLowerCase() : null;
  if (offerBrowserAction && offer.browser_targeting_json) {
    try {
      const bt =
        typeof offer.browser_targeting_json === 'string'
          ? JSON.parse(offer.browser_targeting_json)
          : offer.browser_targeting_json;
      const allowedBrowsers = Array.isArray(bt) ? bt : bt?.browser || bt?.browsers || [];
      if (allowedBrowsers.length > 0 && !allowedBrowsers.includes('All')) {
        const isMatch =
          allowedBrowsers.includes(deviceInfo.browser) ||
          allowedBrowsers.map((b) => b.toLowerCase()).includes(deviceInfo.browser.toLowerCase());
        if (offerBrowserAction === 'allow' && !isMatch) {
          return { ok: false, message: 'Browser not allowed', error_type: 'browser_blocked' };
        }
        if (offerBrowserAction === 'block' && isMatch) {
          return { ok: false, message: 'Browser blocked', error_type: 'browser_blocked' };
        }
      }
    } catch (e) {
      logger.warn('Parsing browser_targeting_json failed', e);
    }
  }

  const offerOsAction = offer.os_action ? String(offer.os_action).toLowerCase() : null;
  if (offerOsAction && offer.os_targeting_json) {
    try {
      const ot =
        typeof offer.os_targeting_json === 'string' ? JSON.parse(offer.os_targeting_json) : offer.os_targeting_json;
      const allowedOs = Array.isArray(ot) ? ot : ot?.os || [];
      if (allowedOs.length > 0 && !allowedOs.includes('All')) {
        const isMatch =
          allowedOs.includes(deviceInfo.os) ||
          allowedOs.map((o) => o.toLowerCase()).includes(deviceInfo.os.toLowerCase());
        if (offerOsAction === 'allow' && !isMatch) {
          return { ok: false, message: 'OS not allowed', error_type: 'os_blocked' };
        }
        if (offerOsAction === 'block' && isMatch) {
          return { ok: false, message: 'OS blocked', error_type: 'os_blocked' };
        }
      }
    } catch (e) {
      logger.warn('Parsing os_targeting_json failed', e);
    }
  }

  const geo = await evaluateOfferIspCityCarrierTargeting(offer, { ip, getISP });
  if (!geo.ok) {
    return { ok: false, message: geo.message, error_type: geo.error_type };
  }

  return { ok: true, deviceInfo, location, country_final };
}
