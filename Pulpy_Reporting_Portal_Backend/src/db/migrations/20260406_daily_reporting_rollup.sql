-- ============================================================
-- Reporting rollup table (separate from legacy daily_click_stats)
-- Run once on production when ready: mysql ... < 20260406_daily_reporting_rollup.sql
-- Same column layout as daily_click_stats; populated only by reportingStatsAggregationWorker.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_reporting_rollup (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id            INT             NOT NULL,
  stat_date            DATE            NOT NULL COMMENT 'IST calendar date (computed in Node.js)',
  publisher_id         INT             NOT NULL,
  offer_id             INT             NOT NULL,

  total_clicks         INT UNSIGNED    NOT NULL DEFAULT 0,
  unique_ips           INT UNSIGNED    NOT NULL DEFAULT 0,

  total_conversions    INT UNSIGNED    NOT NULL DEFAULT 0,
  approved_conversions INT UNSIGNED    NOT NULL DEFAULT 0,
  pending_conversions  INT UNSIGNED    NOT NULL DEFAULT 0,
  rejected_conversions INT UNSIGNED    NOT NULL DEFAULT 0,

  revenue              DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,
  payout               DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,
  pending_payout       DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,
  profit               DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,

  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_drr_key (tenant_id, stat_date, publisher_id, offer_id),
  KEY idx_drr_tenant_date       (tenant_id, stat_date),
  KEY idx_drr_tenant_date_offer (tenant_id, stat_date, offer_id),
  KEY idx_drr_tenant_date_pub   (tenant_id, stat_date, publisher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
