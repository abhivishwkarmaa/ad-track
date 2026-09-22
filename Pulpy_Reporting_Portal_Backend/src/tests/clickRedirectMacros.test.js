import { describe, it, expect } from '@jest/globals';
import { applyRedirectMacros, buildClickRedirectMacros } from '../utils/clickRedirectMacros.js';
import { appendClickParams } from '../utils/urlGenerator.js';

const OFFER_URL =
  'https://wap.wellnesss360.com/subscription?country=India&operator=Airtel&tracking_campid=IN-AIRTEL-22&vid=MB02&click_id={click_id}&campid={aff_id}';

const CLICK_ID = 'abcXYZ_click-id';

function macrosFor(query = {}, extra = {}) {
  return buildClickRedirectMacros({
    clickUuid: CLICK_ID,
    offer: { id: 9, public_offer_id: 108 },
    publisher: { id: 4, public_publisher_id: 64 },
    query,
    request: {
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 10)',
        'x-real-ip': '1.2.3.4',
      },
    },
    country: 'IN',
    deviceInfo: { os: 'Android', osVersion: '10' },
    advertiserPublicId: '15',
    mergedOfferParams: {},
    ...extra,
  });
}

function finalUrl(template, query = {}, extra = {}) {
  const macros = macrosFor(query, extra);
  return appendClickParams(
    applyRedirectMacros(template, macros),
    {
      click_id: CLICK_ID,
      tid: query.tid || null,
      rcid: query.rcid || null,
    },
    extra.mergedOfferParams || {}
  );
}

describe('click redirect macros', () => {
  it('sends the publisher public id in campid', () => {
    const url = new URL(finalUrl(OFFER_URL));
    expect(url.searchParams.get('campid')).toBe('64');
    expect(url.searchParams.get('click_id')).toBe(CLICK_ID);
    expect(url.toString()).not.toContain('{aff_id}');
    expect(url.toString()).not.toContain('%7B');
  });

  it('fills system tokens and leaves publisher tokens empty until they are sent', () => {
    const template =
      'https://advertiser.example/go?tid={tid}&ip={ip}&offerid={offerid}&aff_id={aff_id}&adv_id={adv_id}&country={country}&os={os}&os_ver={os_ver}&ua={useragent}&raw={raw_useragent}&ts={timestamp}&rnd={random}&s1={aff_sub1}&src={source}';
    const url = new URL(finalUrl(template, { tid: 'publisher-tid' }));

    expect(url.searchParams.get('tid')).toBe(CLICK_ID);
    expect(url.searchParams.get('ip')).toBe('1.2.3.4');
    expect(url.searchParams.get('offerid')).toBe('108');
    expect(url.searchParams.get('aff_id')).toBe('64');
    expect(url.searchParams.get('adv_id')).toBe('15');
    expect(url.searchParams.get('country')).toBe('IN');
    expect(url.searchParams.get('os')).toBe('Android');
    expect(url.searchParams.get('os_ver')).toBe('10');
    expect(url.searchParams.get('ua')).toBe('Mozilla/5.0 (Linux; Android 10)');
    expect(url.searchParams.get('raw')).toBe('Mozilla/5.0 (Linux; Android 10)');
    expect(url.searchParams.get('ts')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(url.searchParams.get('rnd')).toMatch(/^[a-f0-9]{16}$/);
    expect(url.searchParams.get('s1')).toBe('');
    expect(url.searchParams.get('src')).toBe('');
    expect(url.toString()).not.toContain('{');
  });

  it('forwards publisher sub ids from the tracking link', () => {
    const template = 'https://advertiser.example/go?s1={aff_sub1}&sub={sub_aff_id}&gaid={googleaid}&src={source}';
    const url = new URL(finalUrl(template, {
      aff_sub: 'site-9',
      sub_aff_id: '77',
      google_id: 'gaid-1',
      src: 'facebook',
    }));

    expect(url.searchParams.get('s1')).toBe('site-9');
    expect(url.searchParams.get('sub')).toBe('77');
    expect(url.searchParams.get('gaid')).toBe('gaid-1');
    expect(url.searchParams.get('src')).toBe('facebook');
  });

  it('still replaces the old raw user agent token', () => {
    const template = 'https://advertiser.example/go?raw={row-useragent}';
    const url = new URL(finalUrl(template));
    expect(url.searchParams.get('raw')).toBe('Mozilla/5.0 (Linux; Android 10)');
  });
});
