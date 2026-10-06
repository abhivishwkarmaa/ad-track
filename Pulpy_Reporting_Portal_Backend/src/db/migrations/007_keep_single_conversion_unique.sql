-- Single-conversion offers, and any non-repeating goal, use dedup_slot = 'once'.
-- This keeps one conversions row per click (and per rcid + offer) after uniq_click_uuid was replaced.
-- allow_multiple events use a fresh dedup_slot, so they are not blocked.

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_click_slot'
);
SET @stmt = IF(@has_idx = 0,
  'ALTER TABLE conversions ADD UNIQUE KEY uniq_click_slot (tenant_id, click_uuid, dedup_slot)',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_rcid_slot'
);
SET @stmt = IF(@has_idx = 0,
  'ALTER TABLE conversions ADD UNIQUE KEY uniq_rcid_slot (rcid, offer_id, dedup_slot)',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
