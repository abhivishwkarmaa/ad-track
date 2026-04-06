-- Publisher-level cap: allow fallback to custom URL or another offer (same as offer-level behaviour).
-- Run after existing capping columns exist on publisher_offers.

ALTER TABLE publisher_offers
  MODIFY COLUMN capping_action ENUM('stop', 'reject', 'fallback') DEFAULT 'stop';

ALTER TABLE publisher_offers
  ADD COLUMN fallback_type ENUM('offer', 'custom') NULL DEFAULT NULL AFTER capping_action,
  ADD COLUMN fallback_url VARCHAR(500) NULL DEFAULT NULL AFTER fallback_type,
  ADD COLUMN fallback_offer_id INT NULL DEFAULT NULL AFTER fallback_url;
