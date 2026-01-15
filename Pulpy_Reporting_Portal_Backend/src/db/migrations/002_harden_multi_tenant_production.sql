-- ============================================
-- Multi-Tenant Production Hardening Migration
-- Run this AFTER 001_add_multi_tenant_support.sql
-- ============================================

-- Step 1: Add compound indexes for performance
-- These indexes ensure fast tenant-scoped queries

-- Offers indexes
CREATE INDEX IF NOT EXISTS idx_offers_tenant_created ON offers(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_offers_tenant_status ON offers(tenant_id, status);

-- Publishers indexes
CREATE INDEX IF NOT EXISTS idx_publishers_tenant_status ON publishers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_publishers_tenant_created ON publishers(tenant_id, created_at);

-- Clicks indexes
CREATE INDEX IF NOT EXISTS idx_clicks_tenant_offer ON clicks(tenant_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_clicks_tenant_publisher ON clicks(tenant_id, publisher_id);
CREATE INDEX IF NOT EXISTS idx_clicks_tenant_created ON clicks(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clicks_tenant_timestamp ON clicks(tenant_id, timestamp);

-- Conversions indexes
CREATE INDEX IF NOT EXISTS idx_conversions_tenant_offer ON conversions(tenant_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_conversions_tenant_publisher ON conversions(tenant_id, publisher_id);
CREATE INDEX IF NOT EXISTS idx_conversions_tenant_created ON conversions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversions_tenant_status ON conversions(tenant_id, status);

-- Impressions indexes
CREATE INDEX IF NOT EXISTS idx_impressions_tenant_offer ON impressions(tenant_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_impressions_tenant_created ON impressions(tenant_id, created_at);

-- Publisher offers (assignments) indexes
CREATE INDEX IF NOT EXISTS idx_publisher_offers_tenant_offer ON publisher_offers(tenant_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_publisher_offers_tenant_publisher ON publisher_offers(tenant_id, publisher_id);
CREATE INDEX IF NOT EXISTS idx_publisher_offers_tenant_status ON publisher_offers(tenant_id, status);

-- Daily stats indexes
CREATE INDEX IF NOT EXISTS idx_daily_offer_stats_tenant_offer ON daily_offer_stats(tenant_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_daily_offer_stats_tenant_day ON daily_offer_stats(tenant_id, day);

-- Postback logs indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_postback_logs_tenant_publisher ON affiliate_postback_logs(tenant_id, publisher_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_postback_logs_tenant_created ON affiliate_postback_logs(tenant_id, created_at);

-- Step 2: Update foreign key constraints to RESTRICT deletion
-- This prevents accidental tenant deletion if data exists

-- Note: MySQL doesn't support ALTER CONSTRAINT, so we need to drop and recreate
-- For production, you may want to do this more carefully with data migration

-- Step 3: Add check constraints for tenant_id (where applicable)
-- Note: MySQL/MariaDB may not support CHECK constraints in older versions
-- This is a best practice but may need to be enforced at application level

-- Step 4: Create view for tenant statistics (optional, for monitoring)
CREATE OR REPLACE VIEW tenant_stats AS
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug,
  t.status as tenant_status,
  COUNT(DISTINCT o.id) as total_offers,
  COUNT(DISTINCT p.id) as total_publishers,
  COUNT(DISTINCT c.id) as total_clicks,
  COUNT(DISTINCT conv.id) as total_conversions,
  COALESCE(SUM(conv.amount), 0) as total_revenue,
  COALESCE(SUM(conv.payout), 0) as total_payout
FROM tenants t
LEFT JOIN offers o ON o.tenant_id = t.id
LEFT JOIN publishers p ON p.tenant_id = t.id
LEFT JOIN clicks c ON c.tenant_id = t.id
LEFT JOIN conversions conv ON conv.tenant_id = t.id
GROUP BY t.id, t.name, t.slug, t.status;

-- Step 5: Add indexes on admin_users for tenant lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_tenant_status ON admin_users(tenant_id, role);

-- Step 6: Add unique constraint on admin_users email per tenant (optional)
-- This allows same email across tenants but unique within tenant
-- Note: Current schema has global unique email, may need to change if multi-tenant users needed

-- ============================================
-- IMPORTANT: Before making tenant_id NOT NULL
-- ============================================
-- 1. Ensure all existing data has tenant_id assigned
-- 2. Create a default tenant if needed:
--    INSERT INTO tenants (name, slug, status) VALUES ('Default Tenant', 'default', 'active');
--    UPDATE [table] SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default') WHERE tenant_id IS NULL;
-- 3. Then run:
--    ALTER TABLE [table] MODIFY tenant_id INT(11) NOT NULL;

-- ============================================
-- Migration to NOT NULL (Run after data migration)
-- ============================================
-- Uncomment these after ensuring all rows have tenant_id:

-- ALTER TABLE offers MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE publishers MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE clicks MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE conversions MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE impressions MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE publisher_offers MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE daily_offer_stats MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE affiliate_postback_logs MODIFY tenant_id INT(11) NOT NULL;
-- ALTER TABLE advertisers MODIFY tenant_id INT(11) NOT NULL;

-- Note: admin_users.tenant_id should remain NULL for super admins
