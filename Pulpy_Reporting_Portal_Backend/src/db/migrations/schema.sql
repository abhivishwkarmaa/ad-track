-- CREATE DATABASE  IF NOT EXISTS `tvfvdjub_Pulpy_Reporting_Portal` /*!40100 DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci */;
-- USE `tvfvdjub_Pulpy_Reporting_Portal`;
-- -- MySQL dump 10.13  Distrib 8.0.44, for macos15 (arm64)
-- --
-- -- Host: 157.10.98.169    Database: tvfvdjub_Pulpy_Reporting_Portal
-- -- ------------------------------------------------------
-- -- Server version	5.5.5-10.11.15-MariaDB-cll-lve

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `tenants`
--
USE    tvfvdjub_ilbmart_copy;

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(50) NOT NULL,
  `status` enum('active','suspended') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_tenants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `admin_users`
--

DROP TABLE IF EXISTS `admin_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(50) DEFAULT 'admin',
  `tenant_id` int(11) DEFAULT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_admin_users_tenant` (`tenant_id`),
  KEY `idx_admin_users_tenant_status` (`tenant_id`, `role`),
  CONSTRAINT `fk_admin_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `advertisers`
--

DROP TABLE IF EXISTS `advertisers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advertisers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `company_name` varchar(150) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `tenant_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_advertisers_tenant` (`tenant_id`),
  CONSTRAINT `fk_advertisers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `affiliate_postback_logs`
--

DROP TABLE IF EXISTS `affiliate_postback_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `affiliate_postback_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `publisher_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `conversion_id` int(11) DEFAULT NULL,
  `affiliate_click_id` varchar(255) DEFAULT NULL,
  `fired_url` text NOT NULL,
  `http_status` int(11) DEFAULT NULL,
  `response_body` text DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `execution_time_ms` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_publisher` (`publisher_id`),
  KEY `idx_conversion` (`conversion_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_affiliate_postback_logs_tenant` (`tenant_id`),
  KEY `idx_affiliate_postback_logs_tenant_publisher` (`tenant_id`, `publisher_id`),
  KEY `idx_affiliate_postback_logs_tenant_created` (`tenant_id`, `created_at`),
  CONSTRAINT `fk_affiliate_postback_logs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=338 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clicks`
--

DROP TABLE IF EXISTS `clicks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clicks` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `offer_id` int(11) NOT NULL,
  `publisher_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `publisher_offer_id` int(11) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `referrer` text DEFAULT NULL,
  `click_uuid` text NOT NULL,
  `country` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `isp` varchar(255) DEFAULT NULL,
  `location` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`location`)),
  `domain` varchar(255) DEFAULT NULL,
  `device_type` varchar(50) DEFAULT NULL,
  `browser` varchar(100) DEFAULT NULL,
  `os` varchar(100) DEFAULT NULL,
  `os_version` varchar(50) DEFAULT NULL,
  `device_brand` varchar(100) DEFAULT NULL,
  `device_model` varchar(100) DEFAULT NULL,
  `source_id` varchar(255) DEFAULT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `android_id` varchar(255) DEFAULT NULL,
  `rcid` varchar(255) DEFAULT NULL,
  `tid` varchar(255) DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_click_po` (`publisher_offer_id`),
  KEY `idx_clicks_offer` (`offer_id`),
  KEY `idx_clicks_publisher` (`publisher_id`),
  KEY `idx_clicks_timestamp` (`timestamp`),
  KEY `idx_clicks_rcid` (`rcid`),
  KEY `idx_clicks_tid` (`tid`),
  KEY `idx_clicks_uuid` (`click_uuid`(768)),
  KEY `idx_clicks_country` (`country`),
  KEY `idx_clicks_device_type` (`device_type`),
  KEY `idx_clicks_offer_pub_ip` (`offer_id`,`publisher_id`,`ip`,`created_at`),
  KEY `idx_clicks_offer_pub_created` (`offer_id`,`publisher_id`,`created_at`),
  KEY `idx_clicks_offer_created` (`offer_id`,`created_at`),
  KEY `idx_clicks_publisher_created` (`publisher_id`,`created_at`),
  KEY `idx_clicks_click_uuid` (`click_uuid`(768)),
  KEY `idx_clicks_ip` (`ip`),
  KEY `idx_clicks_tenant` (`tenant_id`),
  KEY `idx_clicks_tenant_offer` (`tenant_id`, `offer_id`),
  KEY `idx_clicks_tenant_publisher` (`tenant_id`, `publisher_id`),
  KEY `idx_clicks_tenant_created` (`tenant_id`, `created_at`),
  KEY `idx_clicks_tenant_timestamp` (`tenant_id`, `timestamp`),
  CONSTRAINT `fk_click_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_click_po` FOREIGN KEY (`publisher_offer_id`) REFERENCES `publisher_offers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_click_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_clicks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=787018 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conversions`
--

DROP TABLE IF EXISTS `conversions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `conversion_uuid` char(36) NOT NULL DEFAULT uuid(),
  `click_uuid` text DEFAULT NULL,
  `offer_id` int(11) NOT NULL,
  `publisher_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `publisher_offer_id` int(11) DEFAULT NULL,
  `rcid` varchar(255) NOT NULL,
  `status` enum('pending','approved','rejected','rejected_cap') DEFAULT 'pending',
  `amount` decimal(10,2) NOT NULL,
  `payout` decimal(10,2) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT current_timestamp(),
  `postback_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`postback_payload`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rcid_offer` (`rcid`,`offer_id`),
  UNIQUE KEY `uniq_click_uuid` (`click_uuid`) USING HASH,
  KEY `fk_conv_po` (`publisher_offer_id`),
  KEY `idx_conversions_status` (`status`),
  KEY `idx_conversions_timestamp` (`timestamp`),
  KEY `idx_conversions_offer_date` (`offer_id`,`created_at`),
  KEY `idx_conversions_click_uuid` (`click_uuid`(768)),
  KEY `idx_conversions_offer_created` (`offer_id`,`created_at`),
  KEY `idx_conversions_publisher_created` (`publisher_id`,`created_at`),
  KEY `idx_conversions_tenant` (`tenant_id`),
  KEY `idx_conversions_tenant_offer` (`tenant_id`, `offer_id`),
  KEY `idx_conversions_tenant_publisher` (`tenant_id`, `publisher_id`),
  KEY `idx_conversions_tenant_created` (`tenant_id`, `created_at`),
  KEY `idx_conversions_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_conv_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_po` FOREIGN KEY (`publisher_offer_id`) REFERENCES `publisher_offers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conv_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=762 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `daily_offer_stats`
--

DROP TABLE IF EXISTS `daily_offer_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_offer_stats` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `offer_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `day` date NOT NULL,
  `impressions` int(11) DEFAULT 0,
  `clicks` int(11) DEFAULT 0,
  `unique_clicks` int(11) DEFAULT 0,
  `conversions` int(11) DEFAULT 0,
  `revenue` decimal(10,2) DEFAULT 0.00,
  `payout` decimal(10,2) DEFAULT 0.00,
  `profit` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_day` (`offer_id`,`day`),
  KEY `idx_daily_stats_day` (`day`),
  KEY `idx_daily_offer_stats_tenant` (`tenant_id`),
  KEY `idx_daily_offer_stats_tenant_offer` (`tenant_id`, `offer_id`),
  KEY `idx_daily_offer_stats_tenant_day` (`tenant_id`, `day`),
  CONSTRAINT `fk_stats_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_daily_offer_stats_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=665461 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `impressions`
--

DROP TABLE IF EXISTS `impressions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `impressions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `imp_uuid` char(36) NOT NULL DEFAULT uuid(),
  `offer_id` int(11) NOT NULL,
  `publisher_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `referrer` text DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_impressions_offer` (`offer_id`),
  KEY `idx_impressions_publisher` (`publisher_id`),
  KEY `idx_impressions_timestamp` (`timestamp`),
  KEY `idx_impressions_tenant` (`tenant_id`),
  KEY `idx_impressions_tenant_offer` (`tenant_id`, `offer_id`),
  KEY `idx_impressions_tenant_created` (`tenant_id`, `created_at`),
  CONSTRAINT `fk_imp_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_imp_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_impressions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `offers`
--

DROP TABLE IF EXISTS `offers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `offers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advertiser_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'draft' COMMENT 'Offer status: live, paused, or draft',
  `offer_visibility` varchar(50) DEFAULT NULL COMMENT 'Offer visibility setting: public, private, restricted, etc.',
  `offer_currency` varchar(10) NOT NULL,
  `country` varchar(100) NOT NULL,
  `advertiser_model` varchar(50) NOT NULL,
  `advertiser_amount` decimal(10,2) NOT NULL,
  `affiliate_model` varchar(50) NOT NULL,
  `affiliate_amount` decimal(10,2) NOT NULL,
  `offer_url` varchar(500) NOT NULL,
  `preview_url` varchar(500) DEFAULT NULL,
  `token_type` varchar(100) DEFAULT NULL,
  `macros_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`macros_json`)),
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `ip_action` varchar(20) DEFAULT NULL,
  `ip_list` text DEFAULT NULL,
  `device_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`device_targeting_json`)),
  `device_action` varchar(20) DEFAULT NULL COMMENT 'Device targeting action: ALLOW or BLOCK',
  `os_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`os_targeting_json`)),
  `os_action` varchar(20) DEFAULT NULL COMMENT 'OS targeting action: ALLOW or BLOCK',
  `browser_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`browser_targeting_json`)),
  `browser_action` varchar(20) DEFAULT NULL COMMENT 'Browser targeting action: ALLOW or BLOCK',
  `isp_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`isp_targeting_json`)),
  `carrier_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`carrier_targeting_json`)),
  `city_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`city_targeting_json`)),
  `capping_type` varchar(20) DEFAULT 'none' COMMENT 'Capping type: none, daily, weekly, or monthly',
  `daily_cap` int(11) DEFAULT NULL,
  `monthly_cap` int(11) DEFAULT NULL,
  `total_cap` int(11) DEFAULT NULL,
  `conversion_cap` int(11) DEFAULT NULL,
  `capping_conversions_duration` varchar(20) DEFAULT NULL COMMENT 'Conversion capping duration: daily, weekly, or monthly',
  `budget_cap` decimal(10,2) DEFAULT NULL,
  `advertiser_capping_budget_duration` varchar(20) DEFAULT NULL COMMENT 'Advertiser budget capping duration: daily, weekly, or monthly',
  `advertiser_capping_budget_amount` decimal(10,2) DEFAULT NULL COMMENT 'Advertiser budget capping amount',
  `advertiser_over_capping` varchar(50) DEFAULT NULL COMMENT 'Advertiser over-capping action: pause, fallback, reject, etc.',
  `affiliate_over_capping` varchar(50) DEFAULT NULL COMMENT 'Affiliate over-capping action: pause, fallback, reject, etc.',
  `cap_action` varchar(50) DEFAULT NULL,
  `fallback_enabled` tinyint(1) DEFAULT 0,
  `fallback_url` varchar(500) DEFAULT NULL,
  `fallback_offer_id` int(11) DEFAULT NULL,
  `advertiser_postback_url` varchar(500) DEFAULT NULL,
  `advertiser_postback_method` varchar(10) DEFAULT NULL,
  `advertiser_postback_macros_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`advertiser_postback_macros_json`)),
  `system_postback_url` varchar(500) DEFAULT NULL,
  `system_postback_method` varchar(10) DEFAULT NULL,
  `system_postback_macros_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`system_postback_macros_json`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_offers_advertiser` (`advertiser_id`),
  KEY `idx_offers_visibility` (`offer_visibility`),
  KEY `idx_offers_advertiser_capping` (`advertiser_capping_budget_duration`,`advertiser_capping_budget_amount`),
  KEY `idx_offers_tenant` (`tenant_id`),
  KEY `idx_offers_tenant_created` (`tenant_id`, `created_at`),
  KEY `idx_offers_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_offers_advertiser` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`),
  CONSTRAINT `fk_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publisher_offers`
--

DROP TABLE IF EXISTS `publisher_offers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publisher_offers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `publisher_id` int(11) NOT NULL,
  `offer_id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  `payout_override` decimal(10,2) DEFAULT NULL,
  `cap_override` int(11) DEFAULT NULL,
  `conversion_approval_percentage` decimal(5,2) DEFAULT NULL,
  `capping_budget_duration` varchar(20) DEFAULT NULL,
  `capping_budget_amount` decimal(10,2) DEFAULT NULL,
  `capping_conversions_duration` varchar(20) DEFAULT NULL,
  `capping_conversions_amount` int(11) DEFAULT NULL,
  `callback_url` text DEFAULT NULL,
  `destination_url` text DEFAULT NULL,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `assigned_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_publisher_offer` (`publisher_id`,`offer_id`),
  KEY `idx_po_status` (`status`),
  KEY `idx_po_capping_budget` (`capping_budget_duration`,`capping_budget_amount`),
  KEY `idx_po_capping_conversions` (`capping_conversions_duration`,`capping_conversions_amount`),
  KEY `idx_publisher_offers_offer` (`offer_id`),
  KEY `idx_publisher_offers_tenant` (`tenant_id`),
  KEY `idx_publisher_offers_tenant_offer` (`tenant_id`, `offer_id`),
  KEY `idx_publisher_offers_tenant_publisher` (`tenant_id`, `publisher_id`),
  KEY `idx_publisher_offers_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_po_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_po_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_publisher_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publishers`
--

DROP TABLE IF EXISTS `publishers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publishers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `global_postback_url` text DEFAULT NULL,
  `status` enum('pending','active','suspended') DEFAULT 'active',
  `tenant_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email_tenant` (`email`, `tenant_id`),
  KEY `idx_publishers_status` (`status`),
  KEY `idx_publishers_email` (`email`),
  KEY `idx_publishers_tenant` (`tenant_id`),
  KEY `idx_publishers_tenant_status` (`tenant_id`, `status`),
  KEY `idx_publishers_tenant_created` (`tenant_id`, `created_at`),
  CONSTRAINT `fk_publishers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-14 13:49:59
