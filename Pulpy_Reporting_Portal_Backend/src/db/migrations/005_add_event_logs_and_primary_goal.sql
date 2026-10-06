-- Migration: 005_add_event_logs_and_primary_goal.sql
-- Description: Creates event_logs table for all funnel events/signals, and adds is_primary flag to offer_events

-- 1. Create event_logs table
CREATE TABLE IF NOT EXISTS event_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    offer_id INT NOT NULL,
    publisher_id INT NOT NULL DEFAULT 0,
    click_uuid VARCHAR(128) NOT NULL,
    event_name VARCHAR(64) NOT NULL,
    amount DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    payout DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    is_conversion TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'approved',
    ip VARCHAR(64) NULL,
    postback_payload JSON NULL,
    affiliate_postback_fired TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_event_logs_click (click_uuid),
    INDEX idx_event_logs_lookup (tenant_id, click_uuid, event_name),
    INDEX idx_event_logs_tenant_offer (tenant_id, offer_id),
    INDEX idx_event_logs_created (created_at),
    INDEX idx_event_logs_event_name (event_name),
    INDEX idx_event_logs_tenant_event (tenant_id, event_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add is_primary to offer_events (1 = Main Conversion Goal, 0 = Event Signal)
SET @col_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'offer_events' 
      AND COLUMN_NAME = 'is_primary'
);

SET @stmt = IF(@col_exists = 0, 
    'ALTER TABLE offer_events ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0 AFTER affiliate_amount;', 
    'SELECT "Column is_primary already exists in offer_events";'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
