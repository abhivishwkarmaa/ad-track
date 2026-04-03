import { describe, it, expect } from '@jest/globals';
import { getAffiliatePostbackDecision } from '../utils/affiliatePostbackPolicy.js';

describe('getAffiliatePostbackDecision', () => {
  it('does not fire without conversion', () => {
    const d = getAffiliatePostbackDecision({ conversion: null, callbackUrl: 'https://pub.example/hit' });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/No conversion/);
  });

  it('fires only when status is approved', () => {
    const base = { affiliate_postback_fired: 0 };
    expect(
      getAffiliatePostbackDecision({
        conversion: { ...base, status: 'approved' },
        callbackUrl: 'https://pub.example/hit' }).fire
    ).toBe(true);
    expect(
      getAffiliatePostbackDecision({
        conversion: { ...base, status: 'pending' },
        callbackUrl: 'https://pub.example/hit' }).fire
    ).toBe(false);
    expect(
      getAffiliatePostbackDecision({
        conversion: { ...base, status: 'rejected' },
        callbackUrl: 'https://pub.example/hit' }).fire
    ).toBe(false);
  });

  it('does not fire twice (idempotency)', () => {
    const d = getAffiliatePostbackDecision({
      conversion: { status: 'approved', affiliate_postback_fired: 1 },
      callbackUrl: 'https://pub.example/hit' });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/already fired/);
  });

  it('does not fire without callback URL', () => {
    const d = getAffiliatePostbackDecision({
      conversion: { status: 'approved', affiliate_postback_fired: 0 },
      callbackUrl: null });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/No callback URL/);
  });
});
