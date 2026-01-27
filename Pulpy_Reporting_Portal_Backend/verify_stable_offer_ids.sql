-- Verification script for stable public offer IDs implementation
-- Run this to check if migrations were successful

-- 1. Check if public_offer_id column exists
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE, 
  COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'tvfvdjub_Pulpy_Reporting_Portal' 
  AND TABLE_NAME = 'offers' 
  AND COLUMN_NAME = 'public_offer_id';

-- 2. Check if status enum includes 'archived'
SELECT COLUMN_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'tvfvdjub_Pulpy_Reporting_Portal' 
  AND TABLE_NAME = 'offers' 
  AND COLUMN_NAME = 'status';

-- 3. Check if unique constraint exists
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE 
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
WHERE TABLE_SCHEMA = 'tvfvdjub_Pulpy_Reporting_Portal' 
  AND TABLE_NAME = 'offers' 
  AND CONSTRAINT_NAME = 'uniq_tenant_public_offer_id';

-- 4. Check if offer_params table exists
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'tvfvdjub_Pulpy_Reporting_Portal' 
  AND TABLE_NAME = 'offer_params';

-- 5. Check if extra_params column exists in clicks
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'tvfvdjub_Pulpy_Reporting_Portal' 
  AND TABLE_NAME = 'clicks' 
  AND COLUMN_NAME = 'extra_params';

-- 6. Check if extra_params column exists in conversions
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'tvfvdjub_Pulpy_Reporting_Portal' 
  AND TABLE_NAME = 'conversions' 
  AND COLUMN_NAME = 'extra_params';

-- 7. Sample data: Check existing offers have public_offer_id
SELECT 
  id, 
  public_offer_id, 
  name, 
  status, 
  tenant_id 
FROM offers 
ORDER BY tenant_id, public_offer_id 
LIMIT 20;

-- 8. Count offers per tenant with max public_offer_id
SELECT 
  tenant_id, 
  COUNT(*) as total_offers, 
  MAX(public_offer_id) as max_public_id,
  MIN(public_offer_id) as min_public_id
FROM offers 
GROUP BY tenant_id;
