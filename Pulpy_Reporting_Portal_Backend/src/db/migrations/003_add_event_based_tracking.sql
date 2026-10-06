-- Migration 003: Add Event-based (Multi-Goal) Tracking Support
-- Enables tracking multiple events (e.g. install, registration, deposit) per click and offer.

CREATE TABLE IF NOT EXISTS `offer_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `offer_id` int NOT NULL,
  `event_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Identifier sent in callback, e.g. install, registration, deposit',
  `title` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Display label in UI',
  `advertiser_amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Revenue received from advertiser for this event',
  `affiliate_amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Payout given to affiliate for this event',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = Main Conversion Goal, 0 = Funnel Signal',
  `allow_multiple` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = unique per click (deduped), 1 = allow multiple conversions per click',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_event` (`offer_id`, `event_name`),
  KEY `idx_tenant_offer_events` (`tenant_id`, `offer_id`),
  CONSTRAINT `fk_oe_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oe_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Modify conversions table to support event_name (safe check)
SET @has_event_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND COLUMN_NAME = 'event_name'
);
SET @stmt = IF(@has_event_col = 0, 
  "ALTER TABLE conversions ADD COLUMN event_name varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'default' AFTER rcid;", 
  "SELECT 'event_name column already exists in conversions';"
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Safe drop of uniq_click_uuid if it exists, and add uniq_click_uuid_event
SET @has_old_click_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_click_uuid');
SET @stmt = IF(@has_old_click_idx > 0, 'ALTER TABLE conversions DROP INDEX uniq_click_uuid;', 'SELECT 1;');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_new_click_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_click_uuid_event');
SET @stmt = IF(@has_new_click_idx = 0, 'ALTER TABLE conversions ADD UNIQUE KEY uniq_click_uuid_event (click_uuid, event_name);', 'SELECT 1;');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Safe drop of uniq_rcid_offer if it exists, and add uniq_rcid_offer_event
SET @has_old_rcid_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_rcid_offer');
SET @stmt = IF(@has_old_rcid_idx > 0, 'ALTER TABLE conversions DROP INDEX uniq_rcid_offer;', 'SELECT 1;');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_new_rcid_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'uniq_rcid_offer_event');
SET @stmt = IF(@has_new_rcid_idx = 0, 'ALTER TABLE conversions ADD UNIQUE KEY uniq_rcid_offer_event (rcid, offer_id, event_name);', 'SELECT 1;');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Safe add for idx_conversions_event_name
SET @has_ev_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversions' AND INDEX_NAME = 'idx_conversions_event_name');
SET @stmt = IF(@has_ev_idx = 0, 'ALTER TABLE conversions ADD KEY idx_conversions_event_name (event_name);', 'SELECT 1;');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
