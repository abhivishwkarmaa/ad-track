-- ============================================
-- Subscription & Trial System Migration
-- Production-grade multi-tenant SaaS billing
-- ============================================

-- Step 1: Add subscription and trial fields to tenants table
ALTER TABLE `tenants`
  -- State management (ENUM - single source of truth)
  MODIFY COLUMN `status` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') DEFAULT 'TRIAL' COMMENT 'Tenant subscription state',
  
  -- Trial tracking (UTC timestamps)
  ADD COLUMN `trial_start_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Trial start time (UTC) - set on first login',
  ADD COLUMN `trial_end_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Trial end time (UTC) - trial_start_at + 10 days',
  
  -- Subscription tracking (UTC timestamps)
  ADD COLUMN `subscription_start_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Subscription activation time (UTC)',
  ADD COLUMN `subscription_end_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Subscription expiry time (UTC)',
  
  -- Metadata
  ADD COLUMN `subscription_plan` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Subscription plan identifier (e.g., basic, pro, enterprise)',
  ADD COLUMN `billing_email` VARCHAR(255) NULL DEFAULT NULL COMMENT 'Billing contact email',
  
  -- Indexes for performance
  ADD INDEX `idx_tenants_state` (`status`),
  ADD INDEX `idx_tenants_trial_end` (`trial_end_at`),
  ADD INDEX `idx_tenants_subscription_end` (`subscription_end_at`);

-- Step 2: Create subscription history table for audit trail
CREATE TABLE IF NOT EXISTS `subscription_history` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` INT(11) NOT NULL,
  `action` ENUM('TRIAL_STARTED', 'TRIAL_EXTENDED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXTENDED', 'SUBSCRIPTION_EXPIRED', 'TENANT_SUSPENDED', 'TENANT_UNSUSPENDED', 'TRIAL_RESET') NOT NULL,
  `previous_state` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') NULL,
  `new_state` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') NOT NULL,
  `previous_end_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Previous expiry time (trial or subscription)',
  `new_end_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'New expiry time (trial or subscription)',
  `admin_id` INT(11) NULL DEFAULT NULL COMMENT 'Admin who performed the action (NULL for system actions)',
  `notes` TEXT NULL DEFAULT NULL COMMENT 'Additional notes about the action',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subscription_history_tenant` (`tenant_id`),
  KEY `idx_subscription_history_action` (`action`),
  KEY `idx_subscription_history_created` (`created_at`),
  CONSTRAINT `fk_subscription_history_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Audit trail for all subscription and trial changes';

-- Step 3: Update existing tenants to TRIAL state (if they don't have subscription data)
-- This is safe to run multiple times
UPDATE `tenants`
SET 
  `status` = 'TRIAL',
  `trial_start_at` = NULL,
  `trial_end_at` = NULL
WHERE 
  `status` = 'active' 
  AND `trial_start_at` IS NULL 
  AND `subscription_start_at` IS NULL;

-- Step 4: Create a stored procedure for state calculation (deterministic)
-- This ensures state is always calculated consistently
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS `calculate_tenant_state`(IN tenant_id_param INT)
BEGIN
  DECLARE current_state ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED');
  DECLARE trial_end TIMESTAMP;
  DECLARE subscription_end TIMESTAMP;
  DECLARE now_utc TIMESTAMP;
  
  -- Get current UTC time
  SET now_utc = UTC_TIMESTAMP();
  
  -- Get tenant data
  SELECT 
    `status`,
    `trial_end_at`,
    `subscription_end_at`
  INTO 
    current_state,
    trial_end,
    subscription_end
  FROM `tenants`
  WHERE `id` = tenant_id_param;
  
  -- Calculate new state based on deterministic rules
  -- Rule 1: SUSPENDED is manual - don't auto-change
  IF current_state = 'SUSPENDED' THEN
    -- Keep suspended
    SET current_state = 'SUSPENDED';
  
  -- Rule 2: Active subscription takes precedence
  ELSEIF subscription_end IS NOT NULL THEN
    IF now_utc <= subscription_end THEN
      SET current_state = 'ACTIVE';
    ELSE
      SET current_state = 'EXPIRED';
    END IF;
  
  -- Rule 3: Trial state
  ELSEIF trial_end IS NOT NULL THEN
    IF now_utc <= trial_end THEN
      SET current_state = 'TRIAL';
    ELSE
      SET current_state = 'EXPIRED';
    END IF;
  
  -- Rule 4: No trial started yet
  ELSE
    SET current_state = 'TRIAL';
  END IF;
  
  -- Update tenant state if changed
  UPDATE `tenants`
  SET `status` = current_state
  WHERE `id` = tenant_id_param AND `status` != current_state;
END$$

DELIMITER ;

-- Step 5: Create a cron job helper to check all tenant states
-- This should be run periodically (e.g., every hour) to update expired states
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS `update_all_tenant_states`()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE tid INT;
  DECLARE cur CURSOR FOR SELECT `id` FROM `tenants`;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN cur;
  
  read_loop: LOOP
    FETCH cur INTO tid;
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    CALL calculate_tenant_state(tid);
  END LOOP;
  
  CLOSE cur;
END$$

DELIMITER ;

-- Migration complete
-- Next steps:
-- 1. Run this migration
-- 2. Set up a cron job to call `update_all_tenant_states()` every hour
-- 3. Update application code to call `calculate_tenant_state(tenant_id)` on login
