CREATE TABLE IF NOT EXISTS test_postback_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publisher_id BIGINT NOT NULL,
  test_token VARCHAR(64) NULL,
  tracking_url TEXT NULL,
  received_tid VARCHAR(512) NULL,
  status ENUM('pending','fired','expired') DEFAULT 'pending',
  result_data TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fired_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_test_session_lookup (publisher_id, status, created_at),
  INDEX idx_test_token (test_token),
  INDEX idx_test_tenant (tenant_id)
);
