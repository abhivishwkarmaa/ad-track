-- Migration: Widen imp_uuid to support 96-char long UUIDs (same as click/conversion IDs)
-- Database: track_myads
-- Purpose: impressions.imp_uuid was CHAR(36); allow LONG_UUID_LENGTH (96) for consistency

USE track_myads;

ALTER TABLE impressions
  MODIFY COLUMN imp_uuid VARCHAR(128) NOT NULL;
