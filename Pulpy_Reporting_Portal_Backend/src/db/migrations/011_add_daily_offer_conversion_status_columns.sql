-- Ensure daily_offer_stats has per-status conversion counters (older deployments may lack these).
-- migrate.js skips ER_DUP_FIELDNAME if a column already exists.

ALTER TABLE daily_offer_stats ADD COLUMN pending_conversions INT NOT NULL DEFAULT 0;
ALTER TABLE daily_offer_stats ADD COLUMN rejected_conversions INT NOT NULL DEFAULT 0;
