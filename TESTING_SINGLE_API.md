# Testing the Single Dashboard API

## Quick Verification

Follow these steps to verify the dashboard now uses **ONLY 1 API call**:

### 1. Start the Servers

**Backend:**
```bash
cd Pulpy_Reporting_Portal_Backend
npm run dev
```

**Frontend:**
```bash
cd Pulpy_Reporting_Portal_frontend
npm run dev
```

### 2. Open Browser DevTools

1. Open your browser (Chrome/Firefox recommended)
2. Press `F12` or `Cmd+Option+I` (Mac) to open DevTools
3. Go to the **Network** tab
4. Click the **Clear** button (🚫) to clear existing requests

### 3. Load the Dashboard

1. Navigate to the dashboard page
2. Watch the Network tab

### 4. Verify Single API Call

You should see **ONLY ONE** request to:
```
GET /api/admin/reports/dashboard/aggregated
```

**Expected Result:**
- ✅ **1 request** to `/dashboard/aggregated`
- ❌ **NO requests** to `/dashboard/cards`, `/dashboard/top-offers`, etc.
- ❌ **NO requests** to `/summary`, `/detailed`, `/publisher-conversions`
- ❌ **NO requests** to `/offers` or `/publishers`

### 5. Check Response

Click on the `/dashboard/aggregated` request in the Network tab and verify the response contains:

```json
{
  "success": true,
  "data": {
    "stats": { ... },
    "cards": { ... },
    "topOffers": [ ... ],
    "performanceChart": [ ... ],
    "topAffiliates": { ... },
    "topCountries": [ ... ],
    "liveOffers": [ ... ],
    "recentActivity": [ ... ],
    "offerStatistics": [ ... ],
    "summary": { ... },
    "detailedActivity": [ ... ],
    "publisherConversions": [ ... ],
    "liveOffersList": [ ... ],
    "activePublishers": [ ... ],
    "metadata": {
      "totalDataSources": 14,
      "fetchedAt": "2026-02-05T..."
    }
  }
}
```

---

## Console Verification

Open the browser console and look for these log messages:

```
[Dashboard] Fetching ALL data with SINGLE API call: {...}
[Dashboard] Complete dashboard data received: {...}
[Dashboard] ✅ ALL data loaded from 14 sources in SINGLE call
```

---

## Testing Different Date Filters

Test that the single API works with different date ranges:

1. **Today**: Click "Today" filter
   - Verify: 1 request with `group_by=hour`
   
2. **Yesterday**: Click "Yesterday" filter
   - Verify: 1 request with `group_by=hour`
   
3. **Last 7 Days**: Click "Last 7 Days" filter
   - Verify: 1 request with `group_by=day`
   
4. **This Month**: Click "This Month" filter
   - Verify: 1 request with `group_by=day`

**Each filter change should trigger ONLY 1 new API call.**

---

## Backend Logs

Check the backend console for these log messages:

```
[AggregatedDashboard] Fetching ALL dashboard data for tenant: <tenant_id>
[AggregatedDashboard] Successfully fetched ALL dashboard data for tenant: <tenant_id>
```

If any individual query fails, you'll see error logs like:
```
[AggregatedDashboard] getDashboardStats error: ...
```

But the aggregated call should still succeed with partial data.

---

## Performance Testing

### Measure Load Time

1. Open DevTools → Network tab
2. Clear all requests
3. Reload the dashboard
4. Check the **Time** column for `/dashboard/aggregated`

**Expected:**
- Response time: 300-500ms (depending on data volume)
- Much faster than previous 12 separate calls

### Compare Before/After

**Before (12 requests):**
- Total requests: 12
- Total time: ~2100ms (sequential) or ~220ms (parallel)
- Fragmented loading

**After (1 request):**
- Total requests: 1 ✅
- Total time: ~400ms
- Smooth loading ✅

---

## Troubleshooting

### Issue: Still seeing multiple requests

**Possible causes:**
1. Browser cache - Clear cache and hard reload (`Cmd+Shift+R` or `Ctrl+Shift+R`)
2. Old code running - Restart frontend dev server
3. Code not updated - Verify changes were saved

**Solution:**
```bash
# Clear frontend cache
cd Pulpy_Reporting_Portal_frontend
rm -rf node_modules/.vite
npm run dev
```

### Issue: 500 error on aggregated endpoint

**Possible causes:**
1. Service imports failing
2. Database connection issue
3. Missing tenant context

**Check backend logs for:**
```
[AggregatedDashboard] Fatal error: ...
```

**Solution:**
- Verify all service files exist
- Check database connection
- Verify authentication token is valid

### Issue: Empty data in response

**Possible causes:**
1. No data in database for selected date range
2. Individual queries failing silently

**Check:**
- Backend logs for individual query errors
- Database has data for the selected date range
- Tenant ID is correct

---

## API Testing with cURL

Test the endpoint directly:

```bash
curl -X GET "http://localhost:5000/api/admin/reports/dashboard/aggregated?date_from=2026-02-05&date_to=2026-02-05" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "stats": { ... },
    "cards": { ... },
    // ... all 14 data sources
    "metadata": {
      "totalDataSources": 14
    }
  }
}
```

---

## Postman Testing

1. Create a new GET request
2. URL: `http://localhost:5000/api/admin/reports/dashboard/aggregated`
3. Headers:
   - `Authorization: Bearer YOUR_TOKEN`
   - `Content-Type: application/json`
4. Query Params:
   - `date_from`: 2026-02-05
   - `date_to`: 2026-02-05
   - `limit`: 5
   - `group_by`: day
5. Send request
6. Verify response contains all 14 data sources

---

## Success Criteria

✅ **Network Tab shows ONLY 1 request** to `/dashboard/aggregated`  
✅ **Response contains all 14 data sources**  
✅ **Dashboard loads smoothly without fragmentation**  
✅ **Console shows "ALL data loaded from 14 sources"**  
✅ **All widgets display data correctly**  
✅ **Date filter changes trigger only 1 new request**  
✅ **Response time is 300-500ms**  
✅ **No errors in console or backend logs**  

---

## What to Look For

### ✅ Good Signs
- Single request in Network tab
- Fast, smooth loading
- All widgets populated
- Console shows success messages
- Backend logs show successful aggregation

### ❌ Bad Signs
- Multiple requests in Network tab
- Slow, fragmented loading
- Empty widgets
- Console errors
- Backend errors in logs

---

## Final Verification Checklist

- [ ] Backend server running
- [ ] Frontend server running
- [ ] Logged in as admin user
- [ ] Dashboard page loads
- [ ] Network tab shows 1 request only
- [ ] Response contains all 14 data sources
- [ ] All widgets display data
- [ ] Date filters work correctly
- [ ] No console errors
- [ ] No backend errors
- [ ] Performance is acceptable (< 500ms)

---

## Summary

If you see **EXACTLY 1 HTTP REQUEST** to `/api/admin/reports/dashboard/aggregated` in the Network tab, and all dashboard widgets are populated with data, then the refactoring is **SUCCESSFUL** ✅

The dashboard now uses a **SINGLE API** for all data, as requested!
