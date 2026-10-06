-- Migration: 004_add_daily_offer_event_stats.sql
-- Description: Creates daily_offer_event_stats table for fast pre-aggregated event-wise reporting

CREATE TABLE IF NOT EXISTS daily_offer_event_stats (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    offer_id INT NOT NULL,
    event_name VARCHAR(64) NOT NULL DEFAULT 'default',
    day DATE NOT NULL,
    conversions INT UNSIGNED NOT NULL DEFAULT 0,
    approved_conversions INT UNSIGNED NOT NULL DEFAULT 0,
    pending_conversions INT UNSIGNED NOT NULL DEFAULT 0,
    rejected_conversions INT UNSIGNED NOT NULL DEFAULT 0,
    revenue DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    payout DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    profit DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_tenant_offer_event_day (tenant_id, offer_id, event_name, day),
    INDEX idx_event_stats_day (day),
    INDEX idx_event_stats_offer (offer_id),
    INDEX idx_event_stats_event (event_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
