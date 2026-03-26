-- Add event counters to daily_offer_stats for event pipeline aggregation.
-- Safe to run on MySQL 8+.

ALTER TABLE daily_offer_stats
  ADD COLUMN events INT NOT NULL DEFAULT 0 AFTER impressions,
  ADD COLUMN payable_events INT NOT NULL DEFAULT 0 AFTER events,
  ADD COLUMN non_payable_events INT NOT NULL DEFAULT 0 AFTER payable_events;
