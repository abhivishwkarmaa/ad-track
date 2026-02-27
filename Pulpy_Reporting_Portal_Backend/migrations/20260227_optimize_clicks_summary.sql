-- Migration: Optimize clicks summary queries
-- Root Cause: click_uuid is TEXT, causing slow DISTINCT and prefix indexing issues.
-- Solution: Convert to VARCHAR(128) and add a covering index.

-- 1. Modify click_uuid to VARCHAR(128)
-- For 5.5M rows, this might take some time, but it's necessary for performance.
ALTER TABLE clicks MODIFY click_uuid VARCHAR(128) NOT NULL;

-- 2. Add optimized covering index for dashboard summary cards
-- This allows MySQL to answer summary queries entirely from the index (covered).
CREATE INDEX idx_clicks_dashboard_summary 
ON clicks(tenant_id, created_at, click_uuid);

-- 3. Add covering index for affiliate/offer grouping
-- This helps queries that group by publisher/offer in a date range.
CREATE INDEX idx_clicks_reporting_covering
ON clicks(tenant_id, created_at, publisher_id, offer_id);
