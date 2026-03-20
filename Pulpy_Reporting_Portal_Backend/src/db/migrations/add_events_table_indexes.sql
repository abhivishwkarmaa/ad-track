-- Add/repair indexes for existing events table (safe for already-running systems).
-- This migration is idempotent using INFORMATION_SCHEMA checks.

SET @db_name := DATABASE();

-- Ensure event_id_norm exists (needed for robust idempotency key).
SET @has_event_id_norm := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND COLUMN_NAME = 'event_id_norm'
);
SET @sql := IF(
  @has_event_id_norm = 0,
  "ALTER TABLE events ADD COLUMN event_id_norm VARCHAR(255) GENERATED ALWAYS AS (COALESCE(NULLIF(TRIM(LOWER(event_id)), ''), '__none__')) STORED",
  "SELECT 'event_id_norm already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure uniq_event exists for (click_uuid, event_name, event_id_norm)
SET @has_uniq_event := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'uniq_event'
);
SET @sql := IF(
  @has_uniq_event = 0,
  "ALTER TABLE events ADD UNIQUE KEY uniq_event (click_uuid, event_name, event_id_norm)",
  "SELECT 'uniq_event already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Fast filters by tenant/date range.
SET @has_idx_tenant_created := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'idx_events_tenant_created'
);
SET @sql := IF(
  @has_idx_tenant_created = 0,
  "CREATE INDEX idx_events_tenant_created ON events (tenant_id, created_at)",
  "SELECT 'idx_events_tenant_created already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_tenant_offer_day := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'idx_events_tenant_offer_day'
);
SET @sql := IF(
  @has_idx_tenant_offer_day = 0,
  "CREATE INDEX idx_events_tenant_offer_day ON events (tenant_id, offer_id, created_at)",
  "SELECT 'idx_events_tenant_offer_day already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_tenant_pub_day := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'idx_events_tenant_pub_day'
);
SET @sql := IF(
  @has_idx_tenant_pub_day = 0,
  "CREATE INDEX idx_events_tenant_pub_day ON events (tenant_id, publisher_id, created_at)",
  "SELECT 'idx_events_tenant_pub_day already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_tenant_name_day := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'idx_events_tenant_name_day'
);
SET @sql := IF(
  @has_idx_tenant_name_day = 0,
  "CREATE INDEX idx_events_tenant_name_day ON events (tenant_id, event_name, created_at)",
  "SELECT 'idx_events_tenant_name_day already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_events_click := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'idx_events_click'
);
SET @sql := IF(
  @has_idx_events_click = 0,
  "CREATE INDEX idx_events_click ON events (click_uuid)",
  "SELECT 'idx_events_click already exists' AS info"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

