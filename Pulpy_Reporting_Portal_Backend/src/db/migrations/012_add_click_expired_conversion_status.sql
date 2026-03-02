-- Add click_expired to conversions.status enum
-- This allows storing conversions rejected due to click age > 24h

ALTER TABLE conversions
  MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'rejected_cap', 'click_expired')
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci
  DEFAULT 'pending';
