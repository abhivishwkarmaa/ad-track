-- ============================================
-- Multi-Tenant Migration
-- Adds tenant support to existing platform
-- ============================================

-- Step 1: Create tenants table
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(50) NOT NULL,
  `status` enum('active','suspended') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_tenants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Step 2: Add tenant_id to admin_users
ALTER TABLE `admin_users` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `role`,
ADD KEY `idx_admin_users_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_admin_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL;

-- Step 3: Add tenant_id to advertisers
ALTER TABLE `advertisers` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `status`,
ADD KEY `idx_advertisers_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_advertisers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 4: Add tenant_id to offers
ALTER TABLE `offers` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `advertiser_id`,
ADD KEY `idx_offers_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 5: Add tenant_id to publishers
ALTER TABLE `publishers` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `status`,
ADD KEY `idx_publishers_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_publishers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 6: Add tenant_id to clicks
ALTER TABLE `clicks` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`,
ADD KEY `idx_clicks_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_clicks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 7: Add tenant_id to conversions
ALTER TABLE `conversions` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`,
ADD KEY `idx_conversions_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_conversions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 8: Add tenant_id to impressions
ALTER TABLE `impressions` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`,
ADD KEY `idx_impressions_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_impressions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 9: Add tenant_id to publisher_offers (assignments)
ALTER TABLE `publisher_offers` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `offer_id`,
ADD KEY `idx_publisher_offers_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_publisher_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 10: Add tenant_id to daily_offer_stats
ALTER TABLE `daily_offer_stats` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `offer_id`,
ADD KEY `idx_daily_offer_stats_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_daily_offer_stats_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 11: Add tenant_id to affiliate_postback_logs
ALTER TABLE `affiliate_postback_logs` 
ADD COLUMN `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`,
ADD KEY `idx_affiliate_postback_logs_tenant` (`tenant_id`),
ADD CONSTRAINT `fk_affiliate_postback_logs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

-- Step 12: Create default tenant for existing data (optional - for migration)
-- This allows existing data to be associated with a default tenant
-- You can run this manually if needed:
-- INSERT INTO tenants (name, slug, status) VALUES ('Default Tenant', 'default', 'active');
-- UPDATE admin_users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default') WHERE tenant_id IS NULL;
