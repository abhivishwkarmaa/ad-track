# Dashboard "Today" Logic – Why DB Count Differs

## How dashboard "today" is calculated

**"Today" = from 12:00 AM (midnight) to end of day** in the dashboard timezone (IST).

1. **Timezone**  
   Dashboard uses **IST (Indian Standard Time)**:
   - **Today** = the calendar day in IST: **00:00:00 IST to 23:59:59 IST**.
   - Backend uses:  
     `DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) >= ? AND <= ?`  
   So only rows whose **date in IST** is that day are included (midnight to midnight IST).

2. **Scope**  
   **Dashboard cards (Total Clicks)** are **per tenant**:
   - **Always filtered by `tenant_id`** (from your login/subdomain).
   - No `offer_id` filter → **all offers** for that tenant.
   - **Total Clicks** = `COUNT(*)` (all rows for that day + tenant).

3. **If DB shows much more than dashboard (e.g. 28,000 vs 2,600)**  
   Your DB query is likely missing **one or both** of:
   - **Date filter** → without it you count all time (e.g. 28,000).
   - **tenant_id** → without it you count all tenants.  
   Use the exact query below (date + tenant_id) to match the dashboard (~2,600).

## Exact query: only today's data from 12:00 AM (match dashboard)

This returns **only today from midnight IST**, for **one tenant**, so the count matches the dashboard:

```sql
-- Replace 1 with your tenant_id. Today = 12:00 AM to end of day in IST.
SELECT COUNT(*) AS total_clicks
FROM track_myads.clicks
WHERE tenant_id = 1
  AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE));
```

- **28,000** in DB usually means: no date filter (all time) and/or no `tenant_id` (all tenants).
- **~2,600** on dashboard = today from 12:00 AM IST, one tenant.  
Use the query above with your real `tenant_id`; you should get ~2,600.

## Optional: today from 12:00 AM IST as explicit time range

If you prefer an explicit "midnight to end of day IST" range in UTC:

```sql
-- Today in IST: 00:00 IST to 23:59 IST (converted to UTC for comparison).
SET @today_ist = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE));
SET @start_utc = CONVERT_TZ(CONCAT(@today_ist, ' 00:00:00'), '+05:30', '+00:00');
SET @end_utc   = CONVERT_TZ(CONCAT(@today_ist, ' 23:59:59'), '+05:30', '+00:00');

SELECT COUNT(*) AS total_clicks
FROM track_myads.clicks
WHERE tenant_id = 1
  AND created_at >= @start_utc
  AND created_at <= @end_utc;
```
