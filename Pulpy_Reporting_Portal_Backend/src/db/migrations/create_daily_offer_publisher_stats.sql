-- Pre-aggregated daily stats for reporting (offer + publisher + event dimension).
-- Use this table for reports to avoid scanning raw clicks/conversions/events tables.

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
