# Run Database Migration - Quick Guide

## 🚨 Current Issue

The tenant management features require database migrations to be run. The error you're seeing:

```
Table 'tenants' doesn't exist
tenant_id column not found in admin_users table
```

This means the multi-tenant database schema hasn't been created yet.

---

## ✅ Solution: Run Migration

### Option 1: Using Migration Script (Recommended)

```bash
cd Pulpy_Reporting_Portal_Backend
npm run migrate
```

### Option 2: Manual SQL Execution

```bash
# Connect to your database
mysql -u your_username -p your_database_name

# Then run the migration SQL
source src/db/migrations/001_add_multi_tenant_support.sql;
source src/db/migrations/002_harden_multi_tenant_production.sql;
```

### Option 3: Direct SQL File Execution

```bash
mysql -u your_username -p your_database_name < src/db/migrations/001_add_multi_tenant_support.sql
mysql -u your_username -p your_database_name < src/db/migrations/002_harden_multi_tenant_production.sql
```

---

## 📋 What the Migration Does

### Migration 001: `001_add_multi_tenant_support.sql`

1. **Creates `tenants` table**:
   - `id`, `name`, `slug`, `status`, `created_at`, `updated_at`

2. **Adds `tenant_id` column to**:
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

3. **Creates foreign key constraints**

### Migration 002: `002_harden_multi_tenant_production.sql`

1. **Creates compound indexes** for performance
2. **Creates `tenant_stats` view**
3. **Adds production hardening** (commented out NOT NULL constraints)

---

## 🔍 Verify Migration Success

After running the migration, verify it worked:

```sql
-- Check tenants table exists
SHOW TABLES LIKE 'tenants';

-- Check tenant_id column in admin_users
SHOW COLUMNS FROM admin_users LIKE 'tenant_id';

-- Check a few key tables
SHOW COLUMNS FROM offers LIKE 'tenant_id';
SHOW COLUMNS FROM clicks LIKE 'tenant_id';
```

Or use the validation script:

```bash
npm run validate
```

---

## 🧪 After Migration: Test Again

Once migration is complete, test the tenant routes:

```bash
# Set test admin credentials
export ADMIN_EMAIL=test-admin@example.com
export ADMIN_PASSWORD=testpass123

# Run tests
node src/tests/tenant-routes.test.js
```

---

## ⚠️ Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Test migrations on a development database first
3. **Downtime**: Migrations may cause brief downtime (usually < 1 second)
4. **Data Safety**: Existing data will be preserved, `tenant_id` will be `NULL` initially

---

## 🐛 Troubleshooting

### Issue: "Table already exists"

**Solution**: Migration was already run. You can skip this migration or drop and recreate.

### Issue: "Foreign key constraint fails"

**Solution**: Make sure all referenced tables exist first.

### Issue: "Access denied"

**Solution**: Check database user has CREATE, ALTER, and INDEX permissions.

---

## ✅ Success Indicators

After successful migration:

1. ✅ `tenants` table exists
2. ✅ `tenant_id` column exists in all required tables
3. ✅ Frontend tenant management page loads without errors
4. ✅ Can create new tenants via API/frontend
5. ✅ Test script passes all tests

---

**Run the migration now to enable tenant management features!**
