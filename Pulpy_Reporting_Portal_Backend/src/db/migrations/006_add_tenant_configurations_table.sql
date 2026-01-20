-- ============================================
-- Tenant Configurations Migration
-- Stores account manager info and signup links per tenant
-- ============================================

CREATE TABLE IF NOT EXISTS `tenant_configurations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) NOT NULL,
  `account_manager_name` varchar(255) DEFAULT NULL,
  `account_manager_email` varchar(255) DEFAULT NULL,
  `account_manager_phone` varchar(50) DEFAULT NULL,
  `account_manager_telegram` varchar(100) DEFAULT NULL,
  `account_manager_skype` varchar(100) DEFAULT NULL,
  `signup_link` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tenant_configurations_tenant` (`tenant_id`),
  CONSTRAINT `fk_tenant_configurations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
