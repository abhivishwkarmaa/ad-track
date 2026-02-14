-- Rebuild daily_offer_stats (works on MySQL <8 using TEMPORARY tables)
-- WARNING: Run during maintenance window. This will TRUNCATE daily_offer_stats and repopulate it.
-- 1) Make sure you have a DB backup or use the included backup step below.
-- 2) Run with: mysql -u DB_USER -p'DB_PASS' -h DB_HOST DB_NAME < rebuild_daily_offer_stats_nocte.sql

-- Backup existing table (structure + data)
CREATE TABLE IF NOT EXISTS daily_offer_stats_backup LIKE daily_offer_stats;
INSERT INTO daily_offer_stats_backup SELECT * FROM daily_offer_stats;

-- Fast clear target table
TRUNCATE TABLE daily_offer_stats;

-- Create temporary aggregated tables
CREATE TEMPORARY TABLE tmp_imps AS
SELECT
  offer_id,
  tenant_id,
  DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS day,
  COUNT(*) AS impressions
FROM impressions
GROUP BY offer_id, tenant_id, day;

CREATE TEMPORARY TABLE tmp_clicks AS
SELECT
  offer_id,
  tenant_id,
  DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS day,
  COUNT(*) AS clicks,
  COUNT(DISTINCT ip) AS unique_clicks
FROM clicks
GROUP BY offer_id, tenant_id, day;

CREATE TEMPORARY TABLE tmp_convs AS
SELECT
  offer_id,
  tenant_id,
  DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS day,
  COALESCE(SUM(IFNULL(amount,0)),0) AS revenue,
  COALESCE(SUM(CASE WHEN status = 'approved' THEN IFNULL(payout,0) ELSE 0 END),0) AS payout,
  COALESCE(SUM(CASE WHEN status NOT IN ('rejected','rejected_cap') THEN 1 ELSE 0 END),0) AS conversions
FROM conversions
GROUP BY offer_id, tenant_id, day;

-- Union keys
CREATE TEMPORARY TABLE tmp_keys AS
SELECT offer_id, tenant_id, day FROM tmp_imps
UNION
SELECT offer_id, tenant_id, day FROM tmp_clicks
UNION
SELECT offer_id, tenant_id, day FROM tmp_convs;

-- Insert aggregated results into daily_offer_stats
INSERT INTO daily_offer_stats
  (offer_id, tenant_id, day, impressions, clicks, unique_clicks, conversions, revenue, payout, profit, created_at, updated_at)
SELECT
  k.offer_id,
  k.tenant_id,
  k.day,
  COALESCE(i.impressions, 0) AS impressions,
  COALESCE(c.clicks, 0) AS clicks,
  COALESCE(c.unique_clicks, 0) AS unique_clicks,
  COALESCE(cv.conversions, 0) AS conversions,
  COALESCE(cv.revenue, 0) AS revenue,
  COALESCE(cv.payout, 0) AS payout,
  COALESCE(cv.revenue, 0) - COALESCE(cv.payout, 0) AS profit,
  UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM tmp_keys k
LEFT JOIN tmp_imps i  ON i.offer_id = k.offer_id AND IFNULL(i.tenant_id,0) = IFNULL(k.tenant_id,0) AND i.day = k.day
LEFT JOIN tmp_clicks c ON c.offer_id = k.offer_id AND IFNULL(c.tenant_id,0) = IFNULL(k.tenant_id,0) AND c.day = k.day
LEFT JOIN tmp_convs cv ON cv.offer_id = k.offer_id AND IFNULL(cv.tenant_id,0) = IFNULL(k.tenant_id,0) AND cv.day = k.day;

-- Done.

