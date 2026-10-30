-- Migration 009: Super admin can allow or block publisher login per tenant.
-- Existing tenants stay enabled so current publisher portals keep working.

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'publisher_login_enabled'
);
SET @stmt = IF(@has_col = 0,
  'ALTER TABLE tenants ADD COLUMN publisher_login_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'1 = publisher login allowed on this tenant subdomain\'',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
