-- ============================================================
-- Migration: Add x_forwarded_for and authorization_token to clicks
-- Date: 2026-02-24
-- Compatible: MySQL 8.0+
-- ============================================================
-- SAFETY: Both columns are NULL by default — no existing rows are affected.
-- PERFORMANCE: Three composite indexes added (tenant_id, created_at, field)
--              to ensure no full-table scans on filtered reports at 4M+ rows.
-- DO NOT: Drop or modify any existing column or index.
-- ============================================================

-- Idempotent column additions via procedure (avoids IF NOT EXISTS on column in older MySQL)
DROP PROCEDURE IF EXISTS _add_click_header_fields;

DELIMITER $$

CREATE PROCEDURE _add_click_header_fields()
BEGIN
    -- Add x_forwarded_for if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'clicks'
          AND COLUMN_NAME  = 'x_forwarded_for'
    ) THEN
        ALTER TABLE clicks
          ADD COLUMN x_forwarded_for VARCHAR(512) NULL AFTER ip;
    END IF;

    -- Add authorization_token if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'clicks'
          AND COLUMN_NAME  = 'authorization_token'
    ) THEN
        ALTER TABLE clicks
          ADD COLUMN authorization_token VARCHAR(512) NULL AFTER referrer;
    END IF;

    -- Index: (tenant_id, created_at, ip)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'clicks'
          AND INDEX_NAME   = 'idx_clicks_tenant_created_ip'
    ) THEN
        ALTER TABLE clicks
          ADD INDEX idx_clicks_tenant_created_ip (tenant_id, created_at, ip);
    END IF;

    -- Index: (tenant_id, created_at, x_forwarded_for(255)) — prefix for LIKE
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'clicks'
          AND INDEX_NAME   = 'idx_clicks_tenant_created_xff'
    ) THEN
        ALTER TABLE clicks
          ADD INDEX idx_clicks_tenant_created_xff (tenant_id, created_at, x_forwarded_for(255));
    END IF;

    -- Index: (tenant_id, created_at, authorization_token)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'clicks'
          AND INDEX_NAME   = 'idx_clicks_tenant_created_auth_token'
    ) THEN
        ALTER TABLE clicks
          ADD INDEX idx_clicks_tenant_created_auth_token (tenant_id, created_at, authorization_token);
    END IF;
END$$

DELIMITER ;

CALL _add_click_header_fields();
DROP PROCEDURE IF EXISTS _add_click_header_fields;
