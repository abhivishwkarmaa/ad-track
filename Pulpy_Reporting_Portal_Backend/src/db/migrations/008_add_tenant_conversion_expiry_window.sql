-- Migration 008: Add conversion_expiry_minutes to tenants table
-- Default is 60 minutes (1 hour)

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'conversion_expiry_minutes'
);
SET @stmt = IF(@has_col = 0,
  'ALTER TABLE tenants ADD COLUMN conversion_expiry_minutes INT NOT NULL DEFAULT 60 COMMENT \'Attribution / conversion expiry window in minutes\'',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
