# Debug Guide: Clicks Not Being Inserted

## 🔍 Diagnostic Steps

### Step 1: Check if Worker is Running

**Check server logs when starting:**
```bash
npm start
```

**Expected output:**
```
✅ Redis click worker started
👷 Redis Stream Worker Started: worker_local_12345
   Stream: stream:clicks
   Group: workers_group
   Consumer: worker_local_12345
```

**If you DON'T see this**, the worker is not starting. Check:
- Server startup errors
- Redis connection issues
- Import errors

---

### Step 2: Check if Clicks are in Redis Stream

**Connect to Redis:**
```bash
redis-cli
```

**Check stream length:**
```redis
XLEN stream:clicks
```

**Expected:** Should show number of clicks waiting to be processed

**If 0**, clicks are not being added to stream. Check:
- `trackClick()` is being called
- Redis connection in trackingService
- No errors in trackingService

**If > 0**, clicks are in stream but not being processed. Check:
- Worker is reading from stream
- Worker logs for errors

---

### Step 3: Check if Clicks are in Redis Hash

**Check a specific click:**
```redis
HGETALL click:YOUR_CLICK_UUID
```

**Expected:** Should show all click data including `tenant_id`

**Check tenant_id:**
```redis
HGET click:YOUR_CLICK_UUID tenant_id
```

**Expected:** Should show tenant_id as string (e.g., "1") or empty string

---

### Step 4: Check Worker Logs

**Look for these log messages:**

1. **Worker reading from stream:**
   ```
   📥 Received X messages from stream
   ```

2. **Validation:**
   ```
   ✅ Validated X clicks, Y invalid
   📊 Processing X clicks with tenant_ids: [...]
   ```

3. **Insert success:**
   ```
   ✅ Successfully inserted X clicks
   ```

4. **Insert failure:**
   ```
   ❌ BULK INSERT FAILED - DETAILED ERROR INFO:
   ```

**If you see insert failures**, check:
- Foreign key constraint errors (tenant_id doesn't exist)
- SQL syntax errors
- Database connection issues

---

### Step 5: Check Database

**Check if clicks table exists:**
```sql
SHOW TABLES LIKE 'clicks';
```

**Check clicks table structure:**
```sql
DESCRIBE clicks;
```

**Check if tenant_id column exists:**
```sql
SHOW COLUMNS FROM clicks LIKE 'tenant_id';
```

**Expected:** Should show:
```
Field: tenant_id
Type: int(11)
Null: YES
Key: MUL
Default: NULL
```

**Check recent clicks:**
```sql
SELECT 
  id, 
  click_uuid, 
  offer_id, 
  publisher_id, 
  tenant_id,
  created_at 
FROM clicks 
ORDER BY created_at DESC 
LIMIT 10;
```

**If no rows**, clicks are not being inserted. Check worker logs.

---

### Step 6: Check Foreign Key Constraint

**The clicks table has a foreign key:**
```sql
CONSTRAINT `fk_clicks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
```

**This means:**
- ✅ `tenant_id` can be NULL (no constraint violation)
- ❌ `tenant_id` must exist in `tenants` table if not NULL

**Check if tenant exists:**
```sql
SELECT * FROM tenants WHERE id = YOUR_TENANT_ID;
```

**If tenant doesn't exist**, the insert will fail with:
```
ER_NO_REFERENCED_ROW_2: Cannot add or update a child row: a foreign key constraint fails
```

**Fix:** Ensure tenant exists or set tenant_id to NULL

---

### Step 7: Test Click Tracking Manually

**1. Track a click:**
```bash
curl "http://localhost:5001/click?offer_id=22&pub_id=3"
```

**2. Check Redis immediately:**
```redis
XLEN stream:clicks
HGETALL click:CLICK_UUID_FROM_RESPONSE
```

**3. Wait 1-2 seconds, check database:**
```sql
SELECT * FROM clicks WHERE click_uuid = 'CLICK_UUID_FROM_RESPONSE';
```

**4. Check worker logs for processing**

---

## 🐛 Common Issues

### Issue 1: Worker Not Starting

**Symptoms:**
- No "Redis click worker started" in logs
- No "👷 Redis Stream Worker Started" in logs

**Fix:**
- Check server.js imports
- Check Redis connection
- Check for startup errors

---

### Issue 2: Clicks in Stream but Not Processing

**Symptoms:**
- `XLEN stream:clicks` > 0
- No worker logs
- No database inserts

**Fix:**
- Check worker is actually running
- Check worker logs for errors
- Check Redis connection in worker

---

### Issue 3: Foreign Key Constraint Error

**Symptoms:**
- Worker logs show: `ER_NO_REFERENCED_ROW_2`
- Clicks in stream but not in DB

**Fix:**
- Ensure tenant exists: `SELECT * FROM tenants WHERE id = X;`
- Or set tenant_id to NULL if tenant doesn't exist

---

### Issue 4: tenant_id is NULL

**Symptoms:**
- Clicks inserted but tenant_id is NULL
- Worker logs show tenant_id as 'NULL'

**Fix:**
- Check tenant resolution in trackClick()
- Check offer.tenant_id exists
- Check publisher.tenant_id exists

---

## 🔧 Quick Fixes

### Fix 1: Restart Worker

If worker is not processing, restart server:
```bash
# Stop server (Ctrl+C)
npm start
```

### Fix 2: Check Redis Connection

```bash
redis-cli PING
```

**Expected:** `PONG`

### Fix 3: Clear Stream (if stuck)

```redis
DEL stream:clicks
```

**Warning:** This deletes all pending clicks!

### Fix 4: Check Database Connection

```sql
SELECT 1;
```

**Expected:** Should return `1`

---

## 📊 Expected Flow

```
1. Click Request → trackClick()
   ↓
2. Store in Redis Hash: click:${uuid}
   ↓
3. Add to Stream: stream:clicks
   ↓
4. Worker reads from stream
   ↓
5. Worker fetches from hash
   ↓
6. Worker validates data
   ↓
7. Worker inserts into DB
   ↓
8. Worker ACKs stream message
   ↓
9. Click appears in database ✅
```

---

## 🎯 Next Steps

1. **Check server logs** for worker startup
2. **Check Redis** for clicks in stream
3. **Check worker logs** for processing/errors
4. **Check database** for inserted clicks
5. **Check foreign key constraints** if inserts fail

---

**Use this guide to systematically debug why clicks aren't being inserted!**
