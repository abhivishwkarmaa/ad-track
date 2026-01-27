-- =====================================================
-- Migration: Add Offer Parameters Table
-- Purpose: Support dynamic placeholders in tracking URLs
-- =====================================================

-- Create offer_params table for dynamic URL parameters
CREATE TABLE IF NOT EXISTS offer_params (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  offer_id INT NOT NULL,
  tenant_id INT DEFAULT NULL,
  
  param_key VARCHAR(64) NOT NULL COMMENT 'Parameter name (e.g., click_id, source, sub_source)',
  is_required BOOLEAN DEFAULT false COMMENT 'Whether this parameter is mandatory',
  default_value VARCHAR(255) DEFAULT NULL COMMENT 'Default value if parameter not provided',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_offer_params_offer (offer_id),
  INDEX idx_offer_params_tenant (tenant_id),
  INDEX idx_offer_params_tenant_offer (tenant_id, offer_id),
  
  -- Foreign keys
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Ensure unique param keys per offer
  UNIQUE KEY uniq_offer_param (offer_id, param_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='Dynamic parameters for offer tracking URLs';

-- =====================================================
-- Add extra_params column to clicks table
-- Purpose: Store dynamic parameters as JSON
-- =====================================================

ALTER TABLE clicks
ADD COLUMN extra_params JSON DEFAULT NULL COMMENT 'Dynamic parameters passed in tracking URL';

-- Note: Functional indexes not supported in MariaDB 10.11
-- JSON queries will use full table scan or other indexes

-- =====================================================
-- Add extra_params column to conversions table
-- =====================================================

ALTER TABLE conversions
ADD COLUMN extra_params JSON DEFAULT NULL COMMENT 'Dynamic parameters from original click';

-- =====================================================
-- Verification Queries
-- =====================================================
-- SELECT * FROM offer_params WHERE offer_id = 1;
-- SELECT click_uuid, extra_params FROM clicks WHERE extra_params IS NOT NULL LIMIT 10;
