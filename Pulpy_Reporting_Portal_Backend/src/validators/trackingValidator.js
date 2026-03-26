import Joi from 'joi';

export const clickQuerySchema = Joi.object({
  offer_id: Joi.string().required(),
  pub_id: Joi.string().required(),
  tid: Joi.string().allow('', null).optional(),
  rcid: Joi.string().allow('', null).optional(),
  source_id: Joi.string().allow('', null).optional(),
  device_id: Joi.string().allow('', null).optional(),
  google_id: Joi.string().allow('', null).optional(),
  android_id: Joi.string().allow('', null).optional(),
});

export const impressionQuerySchema = Joi.object({
  offer_id: Joi.string().required(),
  pub_id: Joi.string().required(),
});

export const postbackQuerySchema = Joi.object({
  click_id: Joi.string().allow('', null).optional(),
  rcid: Joi.string().allow('', null).optional(),
  amount: Joi.number().positive().optional(),
  status: Joi.string().valid('approved', 'rejected', 'pending', 'click_expired', 'expired').default('approved'),
});

export const eventTrackingSchema = Joi.object({
  click_id: Joi.string().trim().required(),
  event: Joi.string().trim().min(1).max(100).default('purchase'),
  event_id: Joi.string().trim().max(255).allow('', null).optional(),
  amount: Joi.number().min(0).optional(),
  metadata: Joi.alternatives().try(
    Joi.object().unknown(true),
    Joi.string().allow('', null)
  ).optional()
});

export const testConversionSchema = Joi.object({
  affiliate_url: Joi.string().required(),
  click_id: Joi.string().allow('', null).optional(),
});

export const testAffiliatePostbackSchema = Joi.object({
  publisher_id: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
  affiliate_click_id: Joi.string().optional(),
  rcid: Joi.string().optional(), // Alias for affiliate_click_id
  status: Joi.string().valid('approved', 'rejected', 'pending', 'click_expired', 'expired').default('approved'),
  payout: Joi.number().optional(),
  amount: Joi.number().optional(),
  txid: Joi.string().optional(),
  method: Joi.string().valid('GET', 'POST').default('GET'),
  dry_run: Joi.boolean().default(false),
});

export const testTrackingUrlLoopSchema = Joi.object({
  tracking_url: Joi.string().required(),
});

