-- Idempotency: ensure affiliate postback fires only once per approved conversion.
-- Affiliate postback must fire ONLY when status = 'approved'.
-- This column prevents double-firing on retries or multiple code paths.

ALTER TABLE conversions
ADD COLUMN affiliate_postback_fired TINYINT(1) NOT NULL DEFAULT 0
COMMENT '1 = affiliate postback already sent for this conversion (only when status=approved)';

CREATE INDEX idx_conversions_affiliate_postback_fired ON conversions (status, affiliate_postback_fired);
