-- ============================================
-- QUICK MIGRATION: Add is_test Column
-- ============================================
-- Copy and paste this entire block into your MySQL client
-- (MySQL Workbench, phpMyAdmin, or command line)

USE track_myads;

-- Add the is_test column
ALTER TABLE conversions 
ADD COLUMN is_test TINYINT(1) DEFAULT 0 
COMMENT 'Flag to identify test conversions (1=test, 0=real)';

-- Add indexes for performance
CREATE INDEX idx_conversions_is_test ON conversions(is_test);
CREATE INDEX idx_conversions_tenant_is_test ON conversions(tenant_id, is_test);

-- Done! Now restart your backend with: npx pm2 restart ecosystem.config.cjs
