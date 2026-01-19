-- Migration: Add UNIQUE constraint on click_uuid in clicks table
-- This prevents duplicate clicks from being inserted into the database
-- The ON DUPLICATE KEY UPDATE clause in bulkInsertClicks will now work correctly

-- First, check if there are any duplicate click_uuid values
-- If duplicates exist, we need to clean them up first

-- Check for duplicates
SELECT click_uuid, COUNT(*) as count
FROM clicks
GROUP BY click_uuid
HAVING count > 1;

-- If duplicates exist, you need to clean them up first:
-- DELETE c1 FROM clicks c1
-- INNER JOIN clicks c2 
-- WHERE c1.id > c2.id AND c1.click_uuid = c2.click_uuid;

-- Add UNIQUE constraint on click_uuid
-- Note: click_uuid is TEXT, so we need to use a prefix index for the unique constraint
-- MySQL allows UNIQUE on TEXT columns with a prefix length

ALTER TABLE clicks 
ADD UNIQUE KEY `uniq_click_uuid` (`click_uuid`(255));

-- Verify the constraint was added
SHOW INDEX FROM clicks WHERE Key_name = 'uniq_click_uuid';
