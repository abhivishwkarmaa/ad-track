-- Migration: Add UNIQUE constraint on (tenant_id, offer_id, publisher_id, click_id) in clicks table
-- This prevents duplicate clicks from being inserted for the same tenant/offer/publisher combination
-- The constraint ensures click_id is unique per tenant/offer/publisher context
-- This is CRITICAL for the new click identity system

-- First, check if there are any duplicate combinations
-- If duplicates exist, we need to clean them up first

-- Check for duplicates
SELECT tenant_id, offer_id, publisher_id, click_uuid, COUNT(*) as count
FROM clicks
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id, offer_id, publisher_id, click_uuid
HAVING count > 1;

-- If duplicates exist, you need to clean them up first:
-- Keep the first record (lowest id) and delete duplicates
-- DELETE c1 FROM clicks c1
-- INNER JOIN clicks c2 
-- WHERE c1.id > c2.id 
--   AND c1.tenant_id = c2.tenant_id
--   AND c1.offer_id = c2.offer_id
--   AND c1.publisher_id = c2.publisher_id
--   AND c1.click_uuid = c2.click_uuid;

-- Note: We cannot create a UNIQUE constraint on TEXT columns (click_uuid is TEXT)
-- However, we can create a UNIQUE index using a prefix length
-- But MySQL's unique constraint on composite keys with TEXT requires special handling

-- Option 1: Create a UNIQUE index on the composite key with click_uuid prefix
-- This works because MySQL allows unique indexes on TEXT columns with a prefix
ALTER TABLE clicks 
ADD UNIQUE KEY `uniq_click_tenant_offer_pub_uuid` (
    `tenant_id`, 
    `offer_id`, 
    `publisher_id`, 
    `click_uuid`(255)
);

-- Verify the constraint was added
SHOW INDEX FROM clicks WHERE Key_name = 'uniq_click_tenant_offer_pub_uuid';

-- Note: If tenant_id can be NULL, MySQL treats NULL values specially in UNIQUE constraints
-- Multiple NULL values are allowed in a UNIQUE constraint
-- If you need to ensure uniqueness even with NULL tenant_id, consider:
-- 1. Making tenant_id NOT NULL (recommended for strict multi-tenant)
-- 2. Or using a generated column that replaces NULL with 0
