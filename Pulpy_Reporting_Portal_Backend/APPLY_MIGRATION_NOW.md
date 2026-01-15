# Apply Multi-Tenant Migration - Quick Guide

## 🚨 Current Status

Your error log shows:
- ✅ Improved error handling working (503 instead of 500)
- ❌ `tenants` table doesn't exist
- ❌ `tenant_id` column missing in `admin_users`

**The schema is fixed, now you need to apply it to your database.**

---

## ✅ Quick Fix - Run Migration

### Option 1: Using npm script (Recommended)

```bash
cd Pulpy_Reporting_Portal_Backend
npm run migrate
```

This will:
1. Check if tables exist
2. Run `001_add_multi_tenant_support.sql`
3. Run `002_harden_multi_tenant_production.sql`
4. Handle errors gracefully

### Option 2: Direct SQL Execution

```bash
# Connect to your database
mysql -u your_username -p your_database_name

# Then run:
source src/db/migrations/001_add_multi_tenant_support.sql;
source src/db/migrations/002_harden_multi_tenant_production.sql;
```

### Option 3: Command Line

```bash
mysql -u your_username -p your_database_name < src/db/migrations/001_add_multi_tenant_support.sql
mysql -u your_username -p your_database_name < src/db/migrations/002_harden_multi_tenant_production.sql
```

---

## 🔍 Verify Migration Success

After running migration, check:

```sql
-- 1. Check tenants table exists
SHOW TABLES LIKE 'tenants';

-- 2. Check tenant_id in admin_users
SHOW COLUMNS FROM admin_users LIKE 'tenant_id';

-- 3. Check tenant_id in other key tables
SHOW COLUMNS FROM offers LIKE 'tenant_id';
SHOW COLUMNS FROM clicks LIKE 'tenant_id';

-- 4. Verify foreign keys
SELECT 
  TABLE_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'tenants'
LIMIT 10;
```

---

## ✅ After Migration

1. **Restart backend** (if needed):
   ```bash
   # Stop current server (Ctrl+C)
   # Start again
   npm start
   ```

2. **Refresh frontend**:
   - Go to `http://admin.localhost:5173/tenant/manage`
   - Should now load without errors

3. **Test tenant creation**:
   - Click "Create Tenant"
   - Fill in the form
   - Should work now!

---

## 🐛 If Migration Fails

### Error: "Table already exists"
- Migration was already run partially
- Check which tables/columns already exist
- Migration script handles this gracefully

### Error: "Duplicate column name"
- `tenant_id` already exists in some tables
- Migration script skips these automatically

### Error: "Foreign key constraint fails"
- Make sure `tenants` table is created first
- Run migrations in order: 001, then 002

---

## 📊 What Gets Created

### Migration 001:
- ✅ `tenants` table
- ✅ `tenant_id` in 10 tables
- ✅ Foreign key constraints
- ✅ Basic indexes

### Migration 002:
- ✅ Compound indexes for performance
- ✅ `tenant_stats` view
- ✅ Additional optimization indexes

---

## ⚡ Quick Command

If you know your database credentials:

```bash
cd Pulpy_Reporting_Portal_Backend

# Replace with your actual credentials
DB_USER=your_username
DB_PASS=your_password
DB_NAME=your_database

mysql -u $DB_USER -p$DB_PASS $DB_NAME < src/db/migrations/001_add_multi_tenant_support.sql
mysql -u $DB_USER -p$DB_PASS $DB_NAME < src/db/migrations/002_harden_multi_tenant_production.sql
```

---

## ✅ Success Indicators

After successful migration:

1. ✅ No more "Table 'tenants' doesn't exist" errors
2. ✅ No more "tenant_id column not found" warnings
3. ✅ Frontend tenant management page loads
4. ✅ Can create new tenants
5. ✅ API returns 200 instead of 503

---

**Run the migration now to fix the error!**
