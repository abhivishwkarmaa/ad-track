-- Repeatable events need a slot so allow_multiple can insert again,
-- while allow_multiple = 0 stays unique per click + event and per rcid + offer + event.
-- event_logs.rcid lets funnel dedup work when the advertiser sends rcid.

SET @has_rcid = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_logs' AND COLUMN_NAME = 'rcid'
);
SET @stmt = IF(@has_rcid = 0,
  'ALTER TABLE event_logs ADD COLUMN rcid varchar(255) NULL AFTER click_uuid',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_rcid_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_logs' AND INDEX_NAME = 'idx_event_logs_rcid'
);
SET @stmt = IF(@has_rcid_idx = 0,
  'ALTER TABLE event_logs ADD KEY idx_event_logs_rcid (tenant_id, offer_id, rcid, event_name)',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_slot = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND COLUMN_NAME = 'dedup_slot'
);
SET @stmt = IF(@has_slot = 0,
  "ALTER TABLE conversions ADD COLUMN dedup_slot varchar(64) NOT NULL DEFAULT 'once' AFTER event_name",
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_click_uuid'
);
SET @stmt = IF(@has_idx > 0, 'ALTER TABLE conversions DROP INDEX uniq_click_uuid', 'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_click_uuid_event'
);
SET @stmt = IF(@has_idx > 0, 'ALTER TABLE conversions DROP INDEX uniq_click_uuid_event', 'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_rcid_offer'
);
SET @stmt = IF(@has_idx > 0, 'ALTER TABLE conversions DROP INDEX uniq_rcid_offer', 'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_rcid_offer_event'
);
SET @stmt = IF(@has_idx > 0, 'ALTER TABLE conversions DROP INDEX uniq_rcid_offer_event', 'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_click_event_slot'
);
SET @stmt = IF(@has_idx = 0,
  'ALTER TABLE conversions ADD UNIQUE KEY uniq_click_event_slot (tenant_id, click_uuid, event_name, dedup_slot)',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_rcid_event_slot'
);
SET @stmt = IF(@has_idx = 0,
  'ALTER TABLE conversions ADD UNIQUE KEY uniq_rcid_event_slot (rcid, offer_id, event_name, dedup_slot)',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
