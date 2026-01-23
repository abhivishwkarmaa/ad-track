# 🔴 Why `affiliate_postback.success` is `false`

## Problem

When hitting postback endpoints, you're getting:
```json
{
  "success": false,
  "fired_url": "https://ravi.track-myads.com/click?offer_id=2&pub_id=3&click_id=efvwegfvw",
  "http_status": 500,
  "execution_time_ms": 3202
}
```

## Root Cause

The `fired_url` is a **click tracking URL** (`/click?...`) instead of a **postback URL** (`/postback`, `/conversion`, `/pixel`, etc.).

### Why This Happens

1. **Database Configuration Issue**: The `callback_url` in your `assignments` table or `global_postback_url` in your `publishers` table contains click URLs instead of postback URLs.

2. **HTTP 500 Error**: The click endpoint is returning a 500 error because:
   - Click endpoints don't expect conversion/postback parameters
   - The endpoint might be failing due to invalid request format
   - The server might be rejecting the request

3. **Success = False**: The code marks it as `success: false` because:
   ```javascript
   success: res.statusCode >= 200 && res.statusCode < 300
   ```
   Since `http_status: 500`, it's not in the success range (200-299).

## Solution

### Step 1: Check Your Database

Run these queries to find incorrect URLs:

```sql
-- Check assignments table
SELECT id, callback_url, tenant_id 
FROM assignments 
WHERE callback_url LIKE '%/click%' 
   OR callback_url LIKE '%/click?%';

-- Check publishers table  
SELECT id, global_postback_url, tenant_id 
FROM publishers 
WHERE global_postback_url LIKE '%/click%' 
   OR global_postback_url LIKE '%/click?%';
```

### Step 2: Update URLs to Correct Postback URLs

**Wrong (Click URL):**
```
https://ravi.track-myads.com/click?offer_id=2&pub_id=3&click_id={affiliate_click_id}
```

**Correct (Postback URL):**
```
https://ravi.track-myads.com/postback?click_id={affiliate_click_id}&amount={amount}&status={status}
```

Or:
```
https://ravi.track-myads.com/conversion?affiliate_click_id={affiliate_click_id}&payout={payout}
```

### Step 3: Update Database

```sql
-- Update assignment callback URL
UPDATE assignments 
SET callback_url = 'https://ravi.track-myads.com/postback?click_id={affiliate_click_id}&amount={amount}&status={status}'
WHERE id = <assignment_id> AND tenant_id = <tenant_id>;

-- Update publisher global postback URL
UPDATE publishers 
SET global_postback_url = 'https://ravi.track-myads.com/postback?click_id={affiliate_click_id}&amount={amount}&status={status}'
WHERE id = <publisher_id> AND tenant_id = <tenant_id>;
```

## Available Macros

Your postback URLs can use these macros:

- `{click_id}` - Internal click UUID
- `{affiliate_click_id}` - Publisher's click ID (tid)
- `{conversion_id}` - Conversion UUID
- `{rcid}` - Revenue Center ID
- `{amount}` - Conversion amount
- `{payout}` - Publisher payout
- `{status}` - Conversion status (approved/pending/rejected)

## Enhanced Error Logging

The code now includes:

1. **URL Validation**: Warns if URL looks like a click URL
2. **Response Body Capture**: Captures server error messages
3. **Better Error Messages**: More detailed error information

### Example Logs

```
⚠️ WARNING: URL appears to be a click tracking URL, not a postback URL!
⚠️ URL: https://ravi.track-myads.com/click?offer_id=2&pub_id=3&click_id=efvwegfvw
⚠️ Postback URLs should typically contain: /postback, /conversion, /pixel, /track, /notify
❌ HTTP 500 response from postback URL
❌ Response body: <server error message>
```

## Testing

After updating URLs:

1. **Restart PM2**:
   ```bash
   pm2 restart Pulpy postback-worker
   ```

2. **Test Postback**:
   ```bash
   curl "http://abhi.localhost:5001/postback?click_id=WotKR6u7sSKUtuFhKqSqZuQdk-E_OSM6pZmb&amount=100" \
     -H "Host: abhi.localhost:5001"
   ```

3. **Expected Result**:
   ```json
   {
     "success": true,
     "fired_url": "https://ravi.track-myads.com/postback?click_id=...&amount=100&status=approved",
     "http_status": 200,
     "execution_time_ms": 150
   }
   ```

## Common Postback URL Patterns

Different publishers use different endpoints:

- `/postback` - Most common
- `/conversion` - Alternative
- `/pixel` - Pixel-based tracking
- `/track` - Generic tracking
- `/notify` - Notification endpoint
- `/callback` - Callback endpoint

**Important**: The URL should NOT contain `/click` - that's for click tracking, not conversions!

## Summary

**Why `success: false`?**
- Database has click URLs instead of postback URLs
- Server returns HTTP 500 because click endpoint doesn't handle conversion data
- Code correctly marks it as failed (500 is not 200-299)

**How to Fix?**
- Update `callback_url` in `assignments` table
- Update `global_postback_url` in `publishers` table
- Use postback URLs (e.g., `/postback`) instead of click URLs (e.g., `/click`)

---

**After fixing URLs, restart PM2 and test again!** 🚀