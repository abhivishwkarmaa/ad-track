-- Migration: Add is_test column to conversions table
-- Database: track_myads
-- Date: 2026-01-30
-- Purpose: Mark test conversions to distinguish them from real conversions

USE track_myads;

-- Step 1: Add is_test column to conversions table
ALTER TABLE conversions 
ADD COLUMN is_test TINYINT(1) DEFAULT 0 
COMMENT 'Flag to identify test conversions (1=test, 0=real)';

-- Step 2: Add index for faster filtering of test conversions
CREATE INDEX idx_conversions_is_test ON conversions(is_test);

-- Step 3: Add composite index for tenant + is_test filtering
CREATE INDEX idx_conversions_tenant_is_test ON conversions(tenant_id, is_test);

-- Step 4 (Optional): Mark existing test conversions
-- This identifies conversions where both payout=0 and amount=0 as test conversions
UPDATE conversions 
SET is_test = 1 
WHERE payout = 0 
  AND amount = 0 
  AND status = 'approved';

-- Step 5: Verify the migration
SELECT 
    COUNT(*) as total_conversions,
    SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_conversions,
    SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) as real_conversions,
    SUM(CASE WHEN is_test = 1 THEN payout ELSE 0 END) as test_payout_total,
    SUM(CASE WHEN is_test = 0 THEN payout ELSE 0 END) as real_payout_total
FROM conversions;

-- Show sample test conversions
SELECT 
    id,
    conversion_uuid,
    offer_id,
    publisher_id,
    status,
    amount,
    payout,
    is_test,
    created_at
FROM conversions
WHERE is_test = 1
LIMIT 10;
