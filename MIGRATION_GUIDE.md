# Add is_test Column Migration Guide

## ⚠️ IMPORTANT: Run This SQL Migration First!

Before the updated code will work, you **MUST** run the following SQL commands on your database.

---

## Option 1: Run via MySQL Workbench / phpMyAdmin

Copy and paste this SQL into your MySQL client:

```sql
-- Step 1: Add is_test column to conversions table
ALTER TABLE conversions 
ADD COLUMN is_test TINYINT(1) DEFAULT 0 AFTER revenue;

-- Step 2: Add index for better performance
CREATE INDEX idx_conversions_is_test ON conversions(is_test);

-- Step 3 (Optional): Mark existing test conversions
-- This updates conversions where payout=0 and revenue=0 to be marked as test
UPDATE conversions 
SET is_test = 1 
WHERE payout = 0 AND revenue = 0 AND status = 'approved';

-- Step 4: Verify the migration
SELECT 
    COUNT(*) as total_conversions,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_conversions,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as real_conversions
FROM conversions;
```

---

## Option 2: Run via Command Line

If you have MySQL command-line access:

```bash
cd /Users/abhinavvishwakarma/work/JPL/Multi-Pulpy\ Final/Pulpy_Reporting_Portal_Backend

# Run the migration
mysql -u your_username -p your_database_name < migrations/add_is_test_column.sql
```

---

## Option 3: Run via Node.js Script

Create and run this script:

```javascript
// run-migration.js
import pool from './src/db/connection.js';

async function runMigration() {
  try {
    console.log('Adding is_test column...');
    
    await pool.query(`
      ALTER TABLE conversions 
      ADD COLUMN is_test TINYINT(1) DEFAULT 0 AFTER revenue
    `);
    
    console.log('✅ Column added successfully');
    
    console.log('Creating index...');
    await pool.query(`
      CREATE INDEX idx_conversions_is_test ON conversions(is_test)
    `);
    
    console.log('✅ Index created successfully');
    
    console.log('Updating existing test conversions...');
    const [result] = await pool.query(`
      UPDATE conversions 
      SET is_test = 1 
      WHERE payout = 0 AND revenue = 0 AND status = 'approved'
    `);
    
    console.log(`✅ Updated ${result.affectedRows} existing test conversions`);
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_conversions,
        SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_conversions,
        SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as real_conversions
      FROM conversions
    `);
    
    console.log('\n📊 Migration Summary:');
    console.log(`Total Conversions: ${stats[0].total_conversions}`);
    console.log(`Test Conversions: ${stats[0].test_conversions}`);
    console.log(`Real Conversions: ${stats[0].real_conversions}`);
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
```

Run it:
```bash
node run-migration.js
```

---

## What This Migration Does

### 1. Adds `is_test` Column
- **Type**: `TINYINT(1)` (0 or 1, like a boolean)
- **Default**: `0` (false - not a test conversion)
- **Position**: After the `revenue` column
- **Purpose**: Explicitly mark test conversions

### 2. Creates Index
- **Index Name**: `idx_conversions_is_test`
- **Purpose**: Faster filtering when querying test vs real conversions
- **Benefit**: Improves performance of reports that exclude test data

### 3. Updates Existing Data (Optional)
- Marks existing conversions with `payout=0` and `revenue=0` as test conversions
- Sets `is_test = 1` for these records
- Only affects conversions with `status = 'approved'`

---

## After Running Migration

### 1. Restart Backend
```bash
cd Pulpy_Reporting_Portal_Backend
npx pm2 restart ecosystem.config.cjs
```

### 2. Test the Feature
1. Navigate to Live Logs
2. Click "🔥 Test" on any click
3. Verify conversion appears with **TEST** badge
4. Check that `is_test = 1` in database

---

## Database Schema (After Migration)

```sql
CREATE TABLE conversions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversion_id VARCHAR(36) NOT NULL,
  conversion_uuid VARCHAR(36),
  click_id VARCHAR(36),
  click_uuid VARCHAR(36),
  offer_id INT,
  publisher_id INT,
  publisher_offer_id INT,
  tenant_id INT,
  affiliate_click_id VARCHAR(255),
  rcid VARCHAR(255),
  status ENUM('approved', 'pending', 'rejected', 'rejected_cap'),
  amount DECIMAL(10,2),
  payout DECIMAL(10,2),
  revenue DECIMAL(10,2),
  is_test TINYINT(1) DEFAULT 0,  -- ✅ NEW COLUMN
  ip VARCHAR(45),
  postback_payload TEXT,
  timestamp DATETIME,
  created_at DATETIME,
  updated_at DATETIME,
  
  INDEX idx_conversions_is_test (is_test),  -- ✅ NEW INDEX
  INDEX idx_offer_id (offer_id),
  INDEX idx_publisher_id (publisher_id),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

---

## Code Changes Made

### Backend (`adminController.js`)
```javascript
// Now includes is_test column
await pool.query(
  `INSERT INTO conversions (
    conversion_id, click_id, offer_id, publisher_id, tenant_id,
    affiliate_click_id, status, payout, revenue, is_test, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
  [
    conversionId,
    click.click_uuid,
    offerId,
    pubId,
    tenantId,
    affiliateClickId,
    'approved',
    0,
    0,
    1  // ✅ is_test = 1 for test conversions
  ]
);
```

### Frontend (`LiveLogs.jsx`)
```jsx
// Now checks is_test column
{row.is_test === 1 && (
    <span className="badge test">TEST</span>
)}
```

---

## Filtering Test Conversions in Reports

### Exclude Test Conversions
```sql
SELECT * FROM conversions 
WHERE is_test = 0;
```

### Include Only Test Conversions
```sql
SELECT * FROM conversions 
WHERE is_test = 1;
```

### Financial Reports (Exclude Tests)
```sql
SELECT 
    SUM(payout) as total_payout,
    SUM(revenue) as total_revenue,
    COUNT(*) as total_conversions
FROM conversions 
WHERE is_test = 0 
AND status = 'approved';
```

---

## Rollback (If Needed)

If you need to remove the column:

```sql
-- Remove index
DROP INDEX idx_conversions_is_test ON conversions;

-- Remove column
ALTER TABLE conversions DROP COLUMN is_test;
```

---

## ✅ Verification Checklist

After running the migration:

- [ ] Column `is_test` exists in `conversions` table
- [ ] Index `idx_conversions_is_test` exists
- [ ] Backend restarts without errors
- [ ] Test conversion creates with `is_test = 1`
- [ ] TEST badge appears in Live Logs UI
- [ ] Real conversions have `is_test = 0`

---

## Need Help?

If you encounter any errors:

1. Check MySQL error logs
2. Verify you have ALTER TABLE permissions
3. Ensure no other migrations are running
4. Check that the column doesn't already exist

Common error:
```
ERROR 1060 (42S21): Duplicate column name 'is_test'
```
Solution: Column already exists, skip Step 1

---

**Ready to proceed? Run the SQL migration above, then restart your backend!** 🚀
