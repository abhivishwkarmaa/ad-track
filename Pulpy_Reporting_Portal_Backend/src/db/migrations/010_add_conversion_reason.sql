-- Migration 010: free-text reason sent by the advertiser on a conversion postback.
-- Not an enum. Missing reason stays NULL. Existing rows stay NULL.

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND COLUMN_NAME = 'reason'
);
SET @stmt = IF(@has_col = 0,
  'ALTER TABLE conversions ADD COLUMN reason VARCHAR(128) NULL COMMENT \'Advertiser-supplied conversion reason\' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'idx_conversions_tenant_reason'
);
SET @stmt = IF(@has_idx = 0,
  'ALTER TABLE conversions ADD INDEX idx_conversions_tenant_reason (tenant_id, reason)',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
