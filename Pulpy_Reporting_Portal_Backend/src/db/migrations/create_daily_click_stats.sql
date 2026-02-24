-- ============================================================
-- Migration: Create daily_click_stats pre-aggregation table
-- Date: 2026-02-24
-- Purpose: Serve getSummary() and aggregated reports from
--          pre-computed daily rows instead of scanning 4M+ clicks.
-- Granularity: tenant × IST-date × publisher × offer (one row per combo).
-- Financial rules (Revenue=ALL amount, Payout=approved payout only) are
-- baked into the aggregation job — not recomputed at query time.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_click_stats (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id            INT             NOT NULL,
  stat_date            DATE            NOT NULL COMMENT 'IST calendar date (computed in Node.js)',
  publisher_id         INT             NOT NULL,
  offer_id             INT             NOT NULL,

  -- Click metrics
  total_clicks         INT UNSIGNED    NOT NULL DEFAULT 0,
  unique_ips           INT UNSIGNED    NOT NULL DEFAULT 0,

  -- Conversion metrics
  total_conversions    INT UNSIGNED    NOT NULL DEFAULT 0,
  approved_conversions INT UNSIGNED    NOT NULL DEFAULT 0,
  pending_conversions  INT UNSIGNED    NOT NULL DEFAULT 0,
  rejected_conversions INT UNSIGNED    NOT NULL DEFAULT 0,

  -- Financial metrics (FINANCIAL SEPARATION RULES baked in)
  -- revenue = SUM(amount)  — ALL conversions regardless of status
  -- payout  = SUM(payout)  — ONLY approved conversions
  -- profit  = revenue - payout
  revenue              DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,
  payout               DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,
  pending_payout       DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,
  profit               DECIMAL(18,4)   NOT NULL DEFAULT 0.0000,

  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Unique business key — ON DUPLICATE KEY UPDATE uses this
  UNIQUE KEY uk_dcs_key (tenant_id, stat_date, publisher_id, offer_id),

  -- Query indexes
  KEY idx_dcs_tenant_date         (tenant_id, stat_date),
  KEY idx_dcs_tenant_date_offer   (tenant_id, stat_date, offer_id),
  KEY idx_dcs_tenant_date_pub     (tenant_id, stat_date, publisher_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
