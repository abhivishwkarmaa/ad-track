# 🚀 Final Implementation Guide - Test Conversions

## ✅ What's Been Done

All code changes are **complete and ready**. You just need to run the database migration!

---

## 📋 Step-by-Step Instructions

### Step 1: Run Database Migration

**Option A: Using MySQL Workbench / phpMyAdmin**

1. Open your MySQL client
2. Connect to database: `track_myads`
3. Copy and paste this SQL:

```sql
USE track_myads;

ALTER TABLE conversions 
ADD COLUMN is_test TINYINT(1) DEFAULT 0 
COMMENT 'Flag to identify test conversions (1=test, 0=real)';

CREATE INDEX idx_conversions_is_test ON conversions(is_test);
CREATE INDEX idx_conversions_tenant_is_test ON conversions(tenant_id, is_test);
```

4. Click "Execute" or "Run"

**Option B: Using Command Line**

```bash
mysql -h 192.142.3.54 -u your_username -p track_myads < QUICK_MIGRATION.sql
```

---

### Step 2: Restart Backend

```bash
cd Pulpy_Reporting_Portal_Backend
npx pm2 restart ecosystem.config.cjs
```

---

### Step 3: Test the Feature

1. **Open Live Logs**: `http://localhost:3000/live-logs`
2. **Click "🔥 Test"** on any click row
3. **Verify**:
   - Toast notification appears
   - Conversion shows with **TEST** badge
   - Payout = $0.00
   - Status = approved

---

## 🔧 Code Changes Summary

### Backend (`adminController.js`)

**Fixed INSERT query to match your schema:**

```javascript
await pool.query(
  `INSERT INTO conversions (
    conversion_uuid, click_uuid, offer_id, publisher_id, tenant_id,
    publisher_offer_id, rcid, status, amount, payout, is_test, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
  [
    conversionId,           // UUID
    click.click_uuid,       // From clicks table
    offerId,
    pubId,
    tenantId,
    click.publisher_offer_id || null,
    affiliateClickId,       // rcid (affiliate's click ID)
    'approved',
    0,                      // amount (revenue)
    0,                      // payout
    1                       // is_test = 1
  ]
);
```

**Key Fixes:**
- ✅ `conversion_id` → `conversion_uuid`
- ✅ `click_id` → `click_uuid`
- ✅ Added `publisher_offer_id`
- ✅ `affiliate_click_id` → `rcid`
- ✅ `revenue` → `amount`
- ✅ Added `is_test = 1`

### Frontend (`LiveLogs.jsx`)

**TEST Badge Display:**

```jsx
<td>
    <span className={`badge ${row.status}`}>{row.status}</span>
    {row.is_test === 1 && (
        <span className="badge test" 
              style={{ 
                  marginLeft: '4px', 
                  background: '#fef3c7', 
                  color: '#92400e', 
                  fontSize: '10px', 
                  fontWeight: '700' 
              }}>
            TEST
        </span>
    )}
</td>
```

---

## 📊 Database Schema Changes

### Before:
```sql
CREATE TABLE conversions (
  id bigint NOT NULL AUTO_INCREMENT,
  conversion_uuid char(36),
  click_uuid char(36),
  offer_id int,
  publisher_id int,
  tenant_id int,
  publisher_offer_id int,
  rcid varchar(255),
  status enum('pending','approved','rejected','rejected_cap'),
  amount decimal(10,2),
  payout decimal(10,2),
  -- ... other columns
);
```

### After:
```sql
CREATE TABLE conversions (
  id bigint NOT NULL AUTO_INCREMENT,
  conversion_uuid char(36),
  click_uuid char(36),
  offer_id int,
  publisher_id int,
  tenant_id int,
  publisher_offer_id int,
  rcid varchar(255),
  status enum('pending','approved','rejected','rejected_cap'),
  amount decimal(10,2),
  payout decimal(10,2),
  is_test TINYINT(1) DEFAULT 0,  -- ✅ NEW COLUMN
  -- ... other columns
  
  INDEX idx_conversions_is_test (is_test),  -- ✅ NEW INDEX
  INDEX idx_conversions_tenant_is_test (tenant_id, is_test)  -- ✅ NEW INDEX
);
```

---

## 🎯 Features

### 1. Test Postback Page
- Enter tracking URL
- Click "Fire Test"
- Auto-creates test conversion with `is_test = 1`
- Fires postback to affiliate
- Shows conversion details

### 2. Live Logs Page
- **"🔥 Test" button** in Actions column
- One-click test conversion
- Automatic postback firing
- TEST badge on conversions where `is_test = 1`

---

## 🔍 Filtering Test Conversions

### In SQL Queries:

**Exclude test conversions:**
```sql
SELECT * FROM conversions 
WHERE is_test = 0;
```

**Only test conversions:**
```sql
SELECT * FROM conversions 
WHERE is_test = 1;
```

**Financial reports (exclude tests):**
```sql
SELECT 
    SUM(payout) as total_payout,
    SUM(amount) as total_revenue,
    COUNT(*) as total_conversions
FROM conversions 
WHERE is_test = 0 
  AND status = 'approved'
  AND tenant_id = ?;
```

---

## ✅ Verification Checklist

After running the migration and restarting:

- [ ] Column `is_test` exists in `conversions` table
- [ ] Indexes created successfully
- [ ] Backend restarts without errors
- [ ] Can create test conversion from Test Postback page
- [ ] Can create test conversion from Live Logs "🔥 Test" button
- [ ] TEST badge appears on test conversions
- [ ] Real conversions don't show TEST badge
- [ ] Postback fires successfully

---

## 🐛 Troubleshooting

### Error: "Unknown column 'is_test'"
**Solution**: Run the migration SQL first

### Error: "Duplicate column name 'is_test'"
**Solution**: Column already exists, skip migration

### TEST badge not showing
**Solution**: 
1. Check browser console for errors
2. Verify `is_test` column has value `1` in database
3. Hard refresh browser (Cmd+Shift+R)

### Postback not firing
**Solution**:
1. Check publisher has `global_postback_url` configured
2. Check backend logs: `npx pm2 logs`
3. Verify network connectivity to postback URL

---

## 📁 Files Modified

### Backend:
- ✅ `src/controllers/adminController.js` - Fixed column names, added is_test
- ✅ `src/routes/admin.js` - Added /create-test-conversion route

### Frontend:
- ✅ `src/pages/LiveLogs/LiveLogs.jsx` - Added TEST badge, Fire Test button
- ✅ `src/pages/Affiliate/PostbackTest.jsx` - Auto-create conversion
- ✅ `src/services/api.js` - Added createTestConversion method

### Database:
- ⏳ `migrations/add_is_test_column.sql` - **YOU NEED TO RUN THIS**

---

## 🎉 You're Almost Done!

**Just 2 steps left:**

1. **Run the SQL migration** (copy from `QUICK_MIGRATION.sql`)
2. **Restart backend**: `npx pm2 restart ecosystem.config.cjs`

Then you're ready to test! 🚀

---

## 📞 Need Help?

If you encounter any issues:
1. Check PM2 logs: `npx pm2 logs`
2. Check browser console for frontend errors
3. Verify database connection
4. Ensure migration ran successfully

**All code is ready - just run the migration!** ✨
