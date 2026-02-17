-- Rename conflicting column in offers to preserve data
ALTER TABLE offers CHANGE COLUMN capping_type legacy_capping_mix VARCHAR(50) DEFAULT 'none';

-- Add Offer Level Capping Fields
ALTER TABLE offers ADD COLUMN capping_type ENUM('budget', 'conversion') NULL;
ALTER TABLE offers ADD COLUMN capping_duration ENUM('daily', 'weekly', 'monthly') NULL;
ALTER TABLE offers ADD COLUMN capping_action ENUM('stop', 'reject', 'fallback') DEFAULT 'stop';
ALTER TABLE offers ADD COLUMN fallback_type ENUM('offer', 'custom') NULL;

-- Update Publisher Level Capping Fields
ALTER TABLE publisher_offers ADD COLUMN capping_type ENUM('budget', 'conversion') NULL;
ALTER TABLE publisher_offers ADD COLUMN capping_duration ENUM('daily', 'weekly', 'monthly') NULL;
ALTER TABLE publisher_offers ADD COLUMN capping_action ENUM('stop', 'reject') DEFAULT 'stop';

-- Ensure previous cap columns (amount holders) exist or reuse them:
-- offers: budget_cap, conversion_cap, daily_cap, total_cap, monthly_cap
-- publisher_offers: capping_budget_amount, capping_conversions_amount

-- (Optional) Copy data from legacy columns if necessary, but manual migration is safer for complex logic.
