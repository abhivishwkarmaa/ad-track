# Fix 503 Error - Run Migration

## 🚨 Current Error

You're seeing this error:
```
503 Service Unavailable
Database migration required. Please run migration 001_add_multi_tenant_support.sql
```

**This is expected!** The error handling is working correctly - it's telling you exactly what to do.

---

## ✅ Quick Fix (Choose One)

### Option 1: Run Tenant Migration Script (Easiest)

```bash
cd Pulpy_Reporting_Portal_Backend
npm run migrate:tenant
```

This script:
- ✅ Runs only the tenant migrations
- ✅ Handles errors gracefully (skips already-applied changes)
- ✅ Verifies migration success
- ✅ Shows clear progress

### Option 2: Run Full Migration

```bash
cd Pulpy_Reporting_Portal_Backend
npm run migrate
```

This runs all migrations (including tenant migrations).

### Option 3: Manual SQL

```bash
# Connect to MySQL
mysql -u your_username -p your_database_name

# Run migrations
source src/db/migrations/001_add_multi_tenant_support.sql;
source src/db/migrations/002_harden_multi_tenant_production.sql;
```

---

## 📋 What Gets Created

The migration will create:

1. **`tenants` table** - Main tenant table
2. **`tenant_id` columns** in:
   - `admin_users`
   - `advertisers`
   - `offers`
   - `publishers`
   - `clicks`
   - `conversions`
   - `impressions`
   - `publisher_offers`
   - `daily_offer_stats`
   - `affiliate_postback_logs`

3. **Foreign keys** - Linking all tables to tenants
4. **Indexes** - For performance optimization

---

## ✅ After Migration

1. **Refresh your browser** - The 503 error should be gone
2. **Tenant management page** should load
3. **You can create tenants** via the UI

---

## 🔍 Verify Migration Worked

After running migration, check:

```sql
-- Check tenants table
SHOW TABLES LIKE 'tenants';

-- Check tenant_id column
SHOW COLUMNS FROM admin_users LIKE 'tenant_id';
SHOW COLUMNS FROM offers LIKE 'tenant_id';
```

Or the migration script will verify automatically.

---

## 🐛 If Migration Fails

### "Table already exists"
- ✅ This is OK - migration handles it gracefully
- Some parts may already be applied

### "Column already exists"
- ✅ This is OK - migration skips it
- Means that column was already added

### "Access denied"
- Check database user permissions
- User needs CREATE, ALTER, INDEX permissions

---

## ⚡ One Command Solution

```bash
cd Pulpy_Reporting_Portal_Backend && npm run migrate:tenant
```

That's it! After this runs successfully, refresh your browser and the error will be gone.

---

**Run the migration now to fix the 503 error!**
