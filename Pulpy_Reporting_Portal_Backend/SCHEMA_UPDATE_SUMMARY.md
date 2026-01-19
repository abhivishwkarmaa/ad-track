# Schema Update Summary - Multi-Tenant Support

## ✅ Schema Updated Successfully

The `schema.sql` file has been updated to include complete multi-tenant support.

---

## 📋 Changes Made

### 1. New Table: `tenants`

```sql
CREATE TABLE `tenants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(50) NOT NULL,
  `status` enum('active','suspended') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_tenants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

**Location**: Added at the beginning of schema (before admin_users)

---

### 2. Updated Tables with `tenant_id` Column

#### `admin_users`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `role`
- Foreign Key: `fk_admin_users_tenant` → `tenants(id)` ON DELETE SET NULL
- Indexes: `idx_admin_users_tenant`, `idx_admin_users_tenant_status`
- **Note**: `tenant_id = NULL` for super admins

#### `advertisers`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `status`
- Foreign Key: `fk_advertisers_tenant` → `tenants(id)` ON DELETE CASCADE
- Index: `idx_advertisers_tenant`

#### `offers`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `advertiser_id`
- Foreign Key: `fk_offers_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes: `idx_offers_tenant`, `idx_offers_tenant_created`, `idx_offers_tenant_status`

#### `publishers`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `status`
- Foreign Key: `fk_publishers_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes: `idx_publishers_tenant`, `idx_publishers_tenant_status`, `idx_publishers_tenant_created`

#### `clicks`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`
- Foreign Key: `fk_clicks_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes: 
  - `idx_clicks_tenant`
  - `idx_clicks_tenant_offer`
  - `idx_clicks_tenant_publisher`
  - `idx_clicks_tenant_created`
  - `idx_clicks_tenant_timestamp`

#### `conversions`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`
- Foreign Key: `fk_conversions_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes:
  - `idx_conversions_tenant`
  - `idx_conversions_tenant_offer`
  - `idx_conversions_tenant_publisher`
  - `idx_conversions_tenant_created`
  - `idx_conversions_tenant_status`

#### `impressions`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`
- Foreign Key: `fk_impressions_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes:
  - `idx_impressions_tenant`
  - `idx_impressions_tenant_offer`
  - `idx_impressions_tenant_created`

#### `publisher_offers` (assignments)
- Added `tenant_id` int(11) DEFAULT NULL AFTER `offer_id`
- Foreign Key: `fk_publisher_offers_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes:
  - `idx_publisher_offers_tenant`
  - `idx_publisher_offers_tenant_offer`
  - `idx_publisher_offers_tenant_publisher`
  - `idx_publisher_offers_tenant_status`

#### `daily_offer_stats`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `offer_id`
- Foreign Key: `fk_daily_offer_stats_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes:
  - `idx_daily_offer_stats_tenant`
  - `idx_daily_offer_stats_tenant_offer`
  - `idx_daily_offer_stats_tenant_day`

#### `affiliate_postback_logs`
- Added `tenant_id` int(11) DEFAULT NULL AFTER `publisher_id`
- Foreign Key: `fk_affiliate_postback_logs_tenant` → `tenants(id)` ON DELETE CASCADE
- Indexes:
  - `idx_affiliate_postback_logs_tenant`
  - `idx_affiliate_postback_logs_tenant_publisher`
  - `idx_affiliate_postback_logs_tenant_created`

---

## 🔑 Key Features

### Foreign Key Constraints

- **ON DELETE CASCADE**: For data tables (offers, publishers, clicks, etc.)
  - When tenant is deleted, all related data is deleted
- **ON DELETE SET NULL**: For admin_users
  - When tenant is deleted, admin users become super admins (tenant_id = NULL)

### Indexes

- **Single column indexes**: `idx_*_tenant` for basic tenant filtering
- **Compound indexes**: `idx_*_tenant_*` for optimized tenant-scoped queries
- **Performance indexes**: Include `created_at`, `status`, etc. for common query patterns

### Data Type

- All `tenant_id` columns: `int(11) DEFAULT NULL`
- Allows NULL for backward compatibility
- Can be made NOT NULL after data migration

---

## 📊 Summary

| Table | tenant_id Added | Foreign Key | Indexes |
|-------|----------------|-------------|---------|
| tenants | ✅ (new table) | - | 2 |
| admin_users | ✅ | ✅ | 2 |
| advertisers | ✅ | ✅ | 1 |
| offers | ✅ | ✅ | 3 |
| publishers | ✅ | ✅ | 3 |
| clicks | ✅ | ✅ | 5 |
| conversions | ✅ | ✅ | 5 |
| impressions | ✅ | ✅ | 3 |
| publisher_offers | ✅ | ✅ | 4 |
| daily_offer_stats | ✅ | ✅ | 3 |
| affiliate_postback_logs | ✅ | ✅ | 3 |

**Total**: 11 tables updated, 11 foreign keys, 34 indexes

---

## 🚀 Usage

### For Fresh Database

Simply run the updated `schema.sql`:

```bash
mysql -u your_username -p your_database < src/db/migrations/schema.sql
```

### For Existing Database

Use the migration files instead:

```bash
# Run migrations
mysql -u your_username -p your_database < src/db/migrations/001_add_multi_tenant_support.sql
mysql -u your_username -p your_database < src/db/migrations/002_harden_multi_tenant_production.sql
```

---

## ✅ Verification

After applying the schema, verify:

```sql
-- Check tenants table exists
SHOW TABLES LIKE 'tenants';

-- Check tenant_id columns
SHOW COLUMNS FROM admin_users LIKE 'tenant_id';
SHOW COLUMNS FROM offers LIKE 'tenant_id';
SHOW COLUMNS FROM clicks LIKE 'tenant_id';

-- Check foreign keys
SELECT 
  TABLE_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'tenants';

-- Check indexes
SHOW INDEXES FROM clicks WHERE Key_name LIKE '%tenant%';
```

---

## 📝 Notes

1. **NULL Values**: All `tenant_id` columns allow NULL for backward compatibility
2. **Data Migration**: Existing data will have `tenant_id = NULL` initially
3. **Super Admins**: `admin_users.tenant_id = NULL` indicates super admin
4. **Performance**: Compound indexes ensure fast tenant-scoped queries
5. **Data Integrity**: Foreign keys ensure referential integrity

---

## 🎯 Next Steps

1. ✅ Schema updated
2. ⏭️ Run migration on database
3. ⏭️ Test tenant creation
4. ⏭️ Verify data isolation
5. ⏭️ Test all tenant routes

---

**Schema is now ready for multi-tenant platform! 🎉**
