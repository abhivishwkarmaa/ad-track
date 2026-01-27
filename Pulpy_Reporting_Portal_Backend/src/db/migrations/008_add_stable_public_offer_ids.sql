-- =====================================================
-- Migration: Add Stable Public Offer IDs
-- Purpose: Implement stable, per-tenant public_offer_id
--          for tracking URLs that never break
-- =====================================================

-- Step 1: Add public_offer_id column to offers table
ALTER TABLE offers 
ADD COLUMN public_offer_id INT NULL COMMENT 'Stable public ID used in tracking URLs, unique per tenant';

-- Step 2: Create unique constraint for tenant + public_offer_id
ALTER TABLE offers
ADD UNIQUE KEY uniq_tenant_public_offer_id (tenant_id, public_offer_id);

-- Step 3: Add index for fast lookups
ALTER TABLE offers
ADD INDEX idx_offer_lookup (tenant_id, public_offer_id, status);

-- Step 4: Update status enum to include 'archived'
ALTER TABLE offers 
MODIFY COLUMN status ENUM('draft', 'live', 'paused', 'archived') DEFAULT 'draft' 
COMMENT 'Offer status: draft, live, paused, or archived (never deleted)';

-- Step 5: Populate public_offer_id for existing offers (per tenant)
-- This ensures existing offers get stable IDs
SET @row_num = 0;
SET @current_tenant = NULL;

UPDATE offers o
JOIN (
  SELECT 
    id,
    tenant_id,
    @row_num := IF(@current_tenant = tenant_id, @row_num + 1, 1) AS new_public_id,
    @current_tenant := tenant_id
  FROM offers
  ORDER BY tenant_id, id
) AS numbered ON o.id = numbered.id
SET o.public_offer_id = numbered.new_public_id;

-- Step 6: Make public_offer_id NOT NULL after population
ALTER TABLE offers
MODIFY COLUMN public_offer_id INT NOT NULL COMMENT 'Stable public ID used in tracking URLs, unique per tenant';

-- =====================================================
-- Verification Queries
-- =====================================================
-- SELECT tenant_id, COUNT(*) as offer_count, MAX(public_offer_id) as max_public_id 
-- FROM offers GROUP BY tenant_id;
-- 
-- SELECT * FROM offers WHERE tenant_id = 1 ORDER BY public_offer_id;
