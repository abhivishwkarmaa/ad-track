-- =========================================================
-- Event Tracking + Reporting: All-in-one DB migration
-- Safe to run on MySQL 8+ (uses IF NOT EXISTS guards).
-- =========================================================

-- 1) Offer payout trigger event (financial trigger config)
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS payout_event VARCHAR(100) NULL DEFAULT 'purchase';

-- 2) Behavioral event log table (separate from conversions)
--    Financial correctness stays in conversions (one payout per click_uuid).
CREATE TABLE IF NOT EXISTS events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  click_uuid VARCHAR(255) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  event_id VARCHAR(255) NULL,
  event_id_norm VARCHAR(255)
    GENERATED ALWAYS AS (COALESCE(NULLIF(TRIM(LOWER(event_id)), ''), '__none__')) STORED,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  tenant_id INT NOT NULL,
  event_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  metadata JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_event (click_uuid, event_name, event_id_norm),
  KEY idx_events_tenant_created (tenant_id, created_at),
  KEY idx_events_tenant_offer_day (tenant_id, offer_id, created_at),
  KEY idx_events_tenant_pub_day (tenant_id, publisher_id, created_at),
  KEY idx_events_tenant_name_day (tenant_id, event_name, created_at),
  KEY idx_events_click (click_uuid),
  CONSTRAINT fk_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) Daily offer stats: event counters
ALTER TABLE daily_offer_stats
  ADD COLUMN  events INT NOT NULL DEFAULT 0 AFTER impressions,
  ADD COLUMN  payable_events INT NOT NULL DEFAULT 0 AFTER events,
  ADD COLUMN non_payable_events INT NOT NULL DEFAULT 0 AFTER payable_events;

-- 4) Event analytics fact table (fast event-level filtering, no raw scan)
CREATE TABLE IF NOT EXISTS event_analytics (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  event_at DATETIME NOT NULL,
  event_day DATE NOT NULL,
  event_hour TINYINT NOT NULL,
  click_uuid VARCHAR(255) NOT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  publisher_offer_id INT NULL,
  event_name VARCHAR(100) NOT NULL,
  event_id VARCHAR(255) NULL,
  event_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_known_event TINYINT NOT NULL DEFAULT 1,
  is_payable_event TINYINT NOT NULL DEFAULT 0,
  payout_event VARCHAR(100) NOT NULL,
  conversion_status VARCHAR(32) NULL,
  conversion_amount DECIMAL(12,2) NULL,
  conversion_payout DECIMAL(12,2) NULL,
  conversion_already_exists TINYINT NOT NULL DEFAULT 0,
  approval_percentage DECIMAL(5,2) NULL,
  payout_override DECIMAL(12,2) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_analytics_tenant_day (tenant_id, event_day),
  KEY idx_event_analytics_tenant_offer_day (tenant_id, offer_id, event_day),
  KEY idx_event_analytics_tenant_publisher_day (tenant_id, publisher_id, event_day),
  KEY idx_event_analytics_tenant_event_day (tenant_id, event_name, event_day),
  KEY idx_event_analytics_tenant_click (tenant_id, click_uuid),
  KEY idx_event_analytics_tenant_payable_day (tenant_id, is_payable_event, event_day),
  KEY idx_event_analytics_tenant_conversion_day (tenant_id, conversion_status, event_day),
  CONSTRAINT fk_event_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5) Daily aggregated stats table (offer + publisher + event)
--    Primary reporting table to avoid querying raw tables.
CREATE TABLE IF NOT EXISTS daily_offer_publisher_stats (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  day DATE NOT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  event_name VARCHAR(100) NOT NULL DEFAULT '__all__',
  clicks BIGINT NOT NULL DEFAULT 0,
  unique_clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  approved_conversions BIGINT NOT NULL DEFAULT 0,
  pending_conversions BIGINT NOT NULL DEFAULT 0,
  rejected_conversions BIGINT NOT NULL DEFAULT 0,
  revenue DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payout DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  profit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  events BIGINT NOT NULL DEFAULT 0,
  payable_events BIGINT NOT NULL DEFAULT 0,
  non_payable_events BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_daily_offer_publisher_event (tenant_id, day, offer_id, publisher_id, event_name),
  KEY idx_dops_tenant_day (tenant_id, day),
  KEY idx_dops_tenant_offer_day (tenant_id, offer_id, day),
  KEY idx_dops_tenant_publisher_day (tenant_id, publisher_id, day),
  KEY idx_dops_tenant_event_day (tenant_id, event_name, day),
  CONSTRAINT fk_dops_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

