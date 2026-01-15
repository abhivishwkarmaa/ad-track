# How to Test Click Tracking with Strict Multi-Tenant Architecture

## ✅ Proper Testing Method

The system now requires **tenant subdomain** for all tracking endpoints. Here's how to test:

### Option 1: Use Tenant Subdomain (Recommended)

```bash
# Test with tenant1 subdomain
curl -H "Host: tenant1.localhost:5001" \
  "http://localhost:5001/click?offer_id=1&pub_id=1"

# Or use the test script
./test-click-tracking.sh tenant1 1 1
```

### Option 2: Add to /etc/hosts (For Better Testing)

Add to `/etc/hosts`:
```
127.0.0.1 tenant1.localhost
127.0.0.1 tenant2.localhost
```

Then test:
```bash
curl "http://tenant1.localhost:5001/click?offer_id=1&pub_id=1"
```

## 🔍 Verification Steps

1. **Check if click was stored in Redis:**
   ```bash
   curl http://localhost:5001/debug/clicks
   ```
   - Check `stream_length` - should increase after click
   - Check `latest_click_hash_exists` - should be `true`

2. **Check server logs for:**
   - `✅ Verified click hash exists` - confirms hash was written
   - `✅ Successfully inserted X clicks` - confirms DB insert
   - Any `❌` errors

3. **Check database:**
   ```sql
   SELECT * FROM clicks ORDER BY created_at DESC LIMIT 5;
   ```

4. **Check worker is running:**
   - Look for: `👷 Redis Stream Worker Started`
   - Look for: `📥 Received X messages from stream`

## ❌ Common Issues

1. **"Tenant Required" error:**
   - ✅ Solution: Use tenant subdomain (e.g., `tenant1.localhost:5001`)

2. **"Offer not found" error:**
   - ✅ Check: Offer exists and has correct `tenant_id`
   - ✅ Check: Offer `tenant_id` matches subdomain tenant

3. **Click in Redis but not in DB:**
   - ✅ Check: Worker is running
   - ✅ Check: Worker logs for errors
   - ✅ Check: Foreign key constraints (tenant_id exists in tenants table)

## 🧪 Quick Test

```bash
# 1. Test with tenant subdomain
curl -H "Host: tenant1.localhost:5001" \
  "http://localhost:5001/click?offer_id=1&pub_id=1"

# 2. Check Redis
curl http://localhost:5001/debug/clicks

# 3. Wait 2-3 seconds, then check database
# (Worker processes in batches, may take a moment)
```
