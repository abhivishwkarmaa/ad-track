/**
 * Publisher (affiliate) postback URL must fire only for approved conversions (workspace regression guardrail).
 * Pure logic — easy to unit test without DB/HTTP.
 */

export function getAffiliatePostbackDecision({ conversion, callbackUrl }) {
  if (!conversion) {
    return { fire: false, reason: 'No conversion created' };
  }
  if (conversion.status !== 'approved') {
    return { fire: false, reason: 'Affiliate postback only fires for approved conversions' };
  }
  if (conversion.affiliate_postback_fired) {
    return { fire: false, reason: 'Postback already fired (idempotency)' };
  }
  if (!callbackUrl) {
    return { fire: false, reason: 'No callback URL configured' };
  }
  return { fire: true, reason: null };
}
