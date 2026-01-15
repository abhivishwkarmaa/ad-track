# Duplicate Clicks Fix

## 🔍 Issues Identified

### 1. **Deduplication Fingerprint Missing Tenant ID** ❌
- **Problem**: The deduplication fingerprint was `${ip}:${offerId}:${userAgent}`
- **Impact**: Different tenants with the same IP/offer/user-agent would share the same dedupe key
- **Result**: One tenant's click could be suppressed by another tenant's click

### 2. **No UNIQUE Constraint on click_uuid** ❌
- **Problem**: The `clicks` table only had an INDEX on `click_uuid`, not a UNIQUE constraint
- **Impact**: `ON DUPLICATE KEY UPDATE` in `bulkInsertClicks` didn't prevent duplicates
- **Result**: Same click could be inserted multiple times into the database

### 3. **Short Deduplication Window** ⚠️
- **Problem**: Redis dedupe key expired after only 3 seconds
- **Impact**: Rapid clicks from the same user could bypass deduplication
- **Result**: Duplicate clicks could be recorded if user clicked again after 3 seconds

---

## ✅ Fixes Applied

### 1. **Added Tenant ID to Deduplication Fingerprint**
**File**: `src/services/trackingService.js`

**Before:**
```javascript
const dedupeFingerprint = `${ip}:${offerId}:${userAgent.substring(0, 50)}`;
```

**After:**
```javascript
// ✅ CRITICAL: Include tenant_id in fingerprint to prevent cross-tenant collisions
const dedupeFingerprint = `${tenantId}:${ip}:${offerId}:${userAgent.substring(0, 50)}`;
```

**Impact**: Each tenant now has isolated deduplication keys, preventing cross-tenant collisions.

---

### 2. **Increased Deduplication Window**
**Files**: 
- `src/services/cacheService.js`
- `src/services/trackingService.js`

**Before:**
```javascript
const result = await redis.set(key, '1', 'NX', 'EX', 3); // 3 seconds
pipeline.setex(`dedupe:redirect:${dedupeFingerprint}`, 3, redirectUrl);
```

**After:**
```javascript
const result = await redis.set(key, '1', 'NX', 'EX', 5); // 5 seconds
pipeline.setex(`dedupe:redirect:${dedupeFingerprint}`, 5, redirectUrl);
```

**Impact**: Better protection against rapid duplicate clicks.

---

### 3. **Moved Tenant Resolution Before Deduplication**
**File**: `src/services/trackingService.js`

**Change**: Tenant ID is now resolved **before** deduplication check, ensuring tenant_id is always available for the fingerprint.

**Impact**: Ensures tenant_id is always included in deduplication logic.

---

### 4. **Database Migration for UNIQUE Constraint**
**File**: `src/db/migrations/003_add_unique_click_uuid.sql`

**Added**: UNIQUE constraint on `click_uuid` column to prevent database-level duplicates.

**Note**: You must clean up existing duplicates before applying this migration.

---

## 🚀 Steps to Apply Fixes

### Step 1: Check for Existing Duplicates
```bash
cd Pulpy_Reporting_Portal_Backend
node check_duplicate_clicks.js
```

This will show you if there are any duplicate clicks in your database.

### Step 2: Clean Up Existing Duplicates (if any)
```bash
node src/db/cleanup-duplicate-clicks.js
```

This will keep the first record (lowest ID) and delete duplicates.

### Step 3: Apply Database Migration
```bash
# Run the migration to add UNIQUE constraint
mysql -u your_user -p your_database < src/db/migrations/003_add_unique_click_uuid.sql
```

Or manually run:
```sql
ALTER TABLE clicks 
ADD UNIQUE KEY `uniq_click_uuid` (`click_uuid`(255));
```

### Step 4: Restart Backend Services
```bash
# Restart your backend to apply code changes
pm2 restart all
# or
npm start
```

---

## 🔒 How It Works Now

### Click Deduplication Flow:
1. **Request arrives** → Extract tenant from subdomain (Host header)
2. **Create fingerprint**: `${tenantId}:${ip}:${offerId}:${userAgent}`
3. **Check Redis**: `SET dedupe:click:{fingerprint} NX EX 5`
   - If key exists → **Duplicate detected** → Return cached redirect
   - If key doesn't exist → **New click** → Continue processing
4. **Add to Redis stream** → Worker processes asynchronously
5. **Database insert**: `INSERT ... ON DUPLICATE KEY UPDATE id = id`
   - If `click_uuid` already exists → **No insert** (idempotent)
   - If `click_uuid` is new → **Insert succeeds**

### Multi-Layer Protection:
1. **Layer 1**: Redis deduplication (5-second window) - Prevents rapid duplicates
2. **Layer 2**: Database UNIQUE constraint - Prevents long-term duplicates
3. **Layer 3**: Tenant isolation - Prevents cross-tenant collisions

---

## 📊 Testing

After applying fixes, test:

1. **Single Click Test**:
   - Click a tracking URL once
   - Verify only 1 click is recorded in database

2. **Rapid Click Test**:
   - Click the same tracking URL multiple times within 5 seconds
   - Verify only 1 click is recorded (deduplication working)

3. **Cross-Tenant Test**:
   - Same IP/offer/user-agent from different tenant subdomains
   - Verify both clicks are recorded (tenant isolation working)

4. **Database Constraint Test**:
   - Try to manually insert duplicate `click_uuid`
   - Verify it fails with duplicate key error

---

## ⚠️ Important Notes

1. **Existing Duplicates**: If you have existing duplicate clicks, clean them up before applying the UNIQUE constraint
2. **Migration Order**: Run cleanup script → Apply migration → Restart services
3. **Monitoring**: Watch logs for any duplicate key errors after applying the constraint
4. **Rollback**: If needed, you can remove the UNIQUE constraint:
   ```sql
   ALTER TABLE clicks DROP INDEX uniq_click_uuid;
   ```

---

## 📝 Files Modified

- ✅ `src/services/trackingService.js` - Added tenant_id to fingerprint, moved tenant resolution earlier
- ✅ `src/services/cacheService.js` - Increased dedupe TTL from 3s to 5s
- ✅ `src/workers/redisWorker.js` - Added logging for duplicate prevention
- ✅ `src/db/migrations/003_add_unique_click_uuid.sql` - Added UNIQUE constraint migration
- ✅ `check_duplicate_clicks.js` - Script to check for existing duplicates
- ✅ `src/db/cleanup-duplicate-clicks.js` - Script to clean up duplicates

---

**Status**: ✅ Fixes Applied - Ready for Testing
