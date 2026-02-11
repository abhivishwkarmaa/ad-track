-- Migration: Widen conversion_uuid and click_uuid to support 64-char random IDs
-- Database: track_myads
-- Purpose: Allow high-entropy click_id and conversion_id (e.g. 64 chars base64url)

USE track_myads;

-- conversions.conversion_uuid: CHAR(36) -> VARCHAR(128) (no default; app generates ID)
ALTER TABLE conversions
  MODIFY COLUMN conversion_uuid VARCHAR(128) NOT NULL;

-- conversions.click_uuid: CHAR(36) -> VARCHAR(128) (stores same click_id as clicks table)
ALTER TABLE conversions
  MODIFY COLUMN click_uuid VARCHAR(128) DEFAULT NULL;
