-- MySQL dump 10.13  Distrib 8.0.44, for macos15 (arm64)
--
-- Host: 192.142.3.54    Database: track_myads
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.24.04.1

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
-- Table structure for table `admin_users`
--

DROP TABLE IF EXISTS `admin_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `role` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'admin',
  `company_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tenant_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_admin_users_tenant` (`tenant_id`),
  KEY `idx_admin_users_tenant_status` (`tenant_id`,`role`),
  CONSTRAINT `fk_admin_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `advertisers`
--

DROP TABLE IF EXISTS `advertisers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advertisers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `company_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `website` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'active',
  `tenant_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `public_advertiser_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `uniq_tenant_public_advertiser_id` (`tenant_id`,`public_advertiser_id`),
  KEY `idx_advertisers_tenant` (`tenant_id`),
  CONSTRAINT `fk_advertisers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `affiliate_postback_logs`
--

DROP TABLE IF EXISTS `affiliate_postback_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `affiliate_postback_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `publisher_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `conversion_id` int DEFAULT NULL,
  `affiliate_click_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fired_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `http_status` int DEFAULT NULL,
  `response_body` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `execution_time_ms` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_publisher` (`publisher_id`),
  KEY `idx_conversion` (`conversion_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_affiliate_postback_logs_tenant` (`tenant_id`),
  KEY `idx_affiliate_postback_logs_tenant_publisher` (`tenant_id`,`publisher_id`),
  KEY `idx_affiliate_postback_logs_tenant_created` (`tenant_id`,`created_at`),
  CONSTRAINT `fk_affiliate_postback_logs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13870 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clicks`
--

DROP TABLE IF EXISTS `clicks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clicks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `offer_id` int NOT NULL,
  `publisher_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `publisher_offer_id` int DEFAULT NULL,
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `x_forwarded_for` varchar(512) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `referrer` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `authorization_token` varchar(512) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `click_uuid` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `region` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `isp` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `location` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `domain` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `device_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `browser` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `os` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `os_version` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `device_brand` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `device_model` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `source_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `device_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `google_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `android_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rcid` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tid` varchar(512) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `extra_params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Dynamic parameters passed in tracking URL',
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
  KEY `idx_clicks_tenant_offer` (`tenant_id`,`offer_id`),
  KEY `idx_clicks_tenant_publisher` (`tenant_id`,`publisher_id`),
  KEY `idx_clicks_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_clicks_tenant_timestamp` (`tenant_id`,`timestamp`),
  KEY `idx_clicks_tenant_created_v2` (`tenant_id`,`created_at`),
  KEY `idx_clicks_date_offer_cover` (`tenant_id`,`created_at`,`offer_id`),
  KEY `idx_clicks_date_country_cover` (`tenant_id`,`created_at`,`country`),
  KEY `idx_tenant_date_offer` (`tenant_id`,`created_at`,`offer_id`),
  KEY `idx_tenant_date_pub` (`tenant_id`,`created_at`,`publisher_id`),
  KEY `idx_clicks_referrer` (`referrer`(255)),
  KEY `idx_clicks_tenant_created_ip` (`tenant_id`,`created_at`,`ip`),
  KEY `idx_clicks_tenant_created_xff` (`tenant_id`,`created_at`,`x_forwarded_for`(255)),
  KEY `idx_clicks_tenant_created_auth_token` (`tenant_id`,`created_at`,`authorization_token`),
  KEY `idx_clicks_tenant_pub_created_ip` (`tenant_id`,`publisher_id`,`created_at`,`ip`),
  KEY `idx_clicks_tenant_offer_created_ip` (`tenant_id`,`offer_id`,`created_at`,`ip`),
  KEY `idx_clicks_tenant_pub_offer_created` (`tenant_id`,`publisher_id`,`offer_id`,`created_at`),
  CONSTRAINT `fk_click_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_click_po` FOREIGN KEY (`publisher_offer_id`) REFERENCES `publisher_offers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_click_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_clicks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `clicks_chk_1` CHECK (json_valid(`location`)),
  CONSTRAINT `clicks_chk_2` CHECK (json_valid(`extra_params`))
) ENGINE=InnoDB AUTO_INCREMENT=8412630 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contact_submissions`
--

DROP TABLE IF EXISTS `contact_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `referer` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('new','read','replied','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'new',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contact_submissions_email` (`email`),
  KEY `idx_contact_submissions_status` (`status`),
  KEY `idx_contact_submissions_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=231 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conversions`
--

DROP TABLE IF EXISTS `conversions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversion_uuid` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `click_uuid` varchar(128) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `offer_id` int NOT NULL,
  `publisher_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `publisher_offer_id` int DEFAULT NULL,
  `rcid` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('pending','approved','rejected','rejected_cap','click_expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `amount` decimal(10,2) NOT NULL,
  `payout` decimal(10,2) NOT NULL,
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `postback_payload` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `extra_params` json DEFAULT NULL COMMENT 'Dynamic parameters from original click',
  `is_test` tinyint(1) DEFAULT '0' COMMENT 'Flag to identify test conversions (1=test, 0=real)',
  `affiliate_postback_fired` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = affiliate postback already sent for this conversion (only when status=approved)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rcid_offer` (`rcid`,`offer_id`),
  UNIQUE KEY `uniq_click_uuid` (`click_uuid`),
  KEY `idx_conversions_status` (`status`),
  KEY `idx_conversions_timestamp` (`timestamp`),
  KEY `idx_conversions_offer_date` (`offer_id`,`created_at`),
  KEY `idx_conversions_publisher_created` (`publisher_id`,`created_at`),
  KEY `idx_conversions_tenant` (`tenant_id`),
  KEY `idx_conversions_tenant_offer` (`tenant_id`,`offer_id`),
  KEY `idx_conversions_tenant_publisher` (`tenant_id`,`publisher_id`),
  KEY `idx_conversions_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_conversions_tenant_status` (`tenant_id`,`status`),
  KEY `fk_conv_po` (`publisher_offer_id`),
  KEY `idx_conversions_is_test` (`is_test`),
  KEY `idx_conversions_tenant_is_test` (`tenant_id`,`is_test`),
  KEY `idx_conversions_tenant_pub_date` (`tenant_id`,`publisher_id`,`created_at`),
  KEY `idx_conversions_date_offer_covering` (`tenant_id`,`created_at`,`offer_id`,`status`,`amount`,`payout`),
  KEY `idx_conversions_affiliate_postback_fired` (`status`,`affiliate_postback_fired`),
  CONSTRAINT `fk_conv_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_po` FOREIGN KEY (`publisher_offer_id`) REFERENCES `publisher_offers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conv_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conversions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=55167 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `daily_click_stats`
--

DROP TABLE IF EXISTS `daily_click_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_click_stats` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `stat_date` date NOT NULL COMMENT 'IST calendar date (computed in Node.js)',
  `publisher_id` int NOT NULL,
  `offer_id` int NOT NULL,
  `total_clicks` int unsigned NOT NULL DEFAULT '0',
  `unique_ips` int unsigned NOT NULL DEFAULT '0',
  `total_conversions` int unsigned NOT NULL DEFAULT '0',
  `approved_conversions` int unsigned NOT NULL DEFAULT '0',
  `pending_conversions` int unsigned NOT NULL DEFAULT '0',
  `rejected_conversions` int unsigned NOT NULL DEFAULT '0',
  `revenue` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `payout` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `pending_payout` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `profit` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dcs_key` (`tenant_id`,`stat_date`,`publisher_id`,`offer_id`),
  KEY `idx_dcs_tenant_date` (`tenant_id`,`stat_date`),
  KEY `idx_dcs_tenant_date_offer` (`tenant_id`,`stat_date`,`offer_id`),
  KEY `idx_dcs_tenant_date_pub` (`tenant_id`,`stat_date`,`publisher_id`)
) ENGINE=InnoDB AUTO_INCREMENT=351 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `daily_offer_stats`
--

DROP TABLE IF EXISTS `daily_offer_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_offer_stats` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `offer_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `day` date NOT NULL,
  `impressions` int DEFAULT '0',
  `clicks` int DEFAULT '0',
  `unique_clicks` int DEFAULT '0',
  `conversions` int DEFAULT '0',
  `approved_conversions` int DEFAULT '0',
  `pending_conversions` int DEFAULT '0',
  `rejected_conversions` int DEFAULT '0',
  `revenue` decimal(10,2) DEFAULT '0.00',
  `payout` decimal(10,2) DEFAULT '0.00',
  `profit` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_day` (`offer_id`,`day`),
  KEY `idx_daily_stats_day` (`day`),
  KEY `idx_daily_offer_stats_tenant` (`tenant_id`),
  KEY `idx_daily_offer_stats_tenant_offer` (`tenant_id`,`offer_id`),
  KEY `idx_daily_offer_stats_tenant_day` (`tenant_id`,`day`),
  CONSTRAINT `fk_daily_offer_stats_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stats_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=921807 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `daily_offer_stats_fix_backup`
--

DROP TABLE IF EXISTS `daily_offer_stats_fix_backup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_offer_stats_fix_backup` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `offer_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `day` date NOT NULL,
  `impressions` int DEFAULT '0',
  `clicks` int DEFAULT '0',
  `unique_clicks` int DEFAULT '0',
  `conversions` int DEFAULT '0',
  `approved_conversions` int DEFAULT '0',
  `pending_conversions` int DEFAULT '0',
  `rejected_conversions` int DEFAULT '0',
  `revenue` decimal(10,2) DEFAULT '0.00',
  `payout` decimal(10,2) DEFAULT '0.00',
  `profit` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_day` (`offer_id`,`day`),
  KEY `idx_daily_stats_day` (`day`),
  KEY `idx_daily_offer_stats_tenant` (`tenant_id`),
  KEY `idx_daily_offer_stats_tenant_offer` (`tenant_id`,`offer_id`),
  KEY `idx_daily_offer_stats_tenant_day` (`tenant_id`,`day`)
) ENGINE=InnoDB AUTO_INCREMENT=269041 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `impressions`
--

DROP TABLE IF EXISTS `impressions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `impressions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `imp_uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT (uuid()),
  `offer_id` int NOT NULL,
  `publisher_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `referrer` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_impressions_offer` (`offer_id`),
  KEY `idx_impressions_publisher` (`publisher_id`),
  KEY `idx_impressions_timestamp` (`timestamp`),
  KEY `idx_impressions_tenant` (`tenant_id`),
  KEY `idx_impressions_tenant_offer` (`tenant_id`,`offer_id`),
  KEY `idx_impressions_tenant_created` (`tenant_id`,`created_at`),
  CONSTRAINT `fk_imp_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_imp_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_impressions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `offer_params`
--

DROP TABLE IF EXISTS `offer_params`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `offer_params` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `offer_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `param_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Parameter name (e.g., click_id, source, sub_source)',
  `is_required` tinyint(1) DEFAULT '0' COMMENT 'Whether this parameter is mandatory',
  `default_value` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Default value if parameter not provided',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_param` (`offer_id`,`param_key`),
  KEY `idx_offer_params_offer` (`offer_id`),
  KEY `idx_offer_params_tenant` (`tenant_id`),
  KEY `idx_offer_params_tenant_offer` (`tenant_id`,`offer_id`),
  CONSTRAINT `offer_params_ibfk_1` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `offer_params_ibfk_2` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Dynamic parameters for offer tracking URLs';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `offers`
--

DROP TABLE IF EXISTS `offers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `offers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `advertiser_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('draft','live','paused','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'draft' COMMENT 'Offer status: draft, live, paused, or archived (never deleted)',
  `offer_visibility` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Offer visibility setting: public, private, restricted, etc.',
  `offer_currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `advertiser_model` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `advertiser_amount` decimal(10,2) NOT NULL,
  `affiliate_model` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `affiliate_amount` decimal(10,2) NOT NULL,
  `offer_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `preview_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `token_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `macros_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `ip_action` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ip_list` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `device_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `device_action` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Device targeting action: ALLOW or BLOCK',
  `os_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `os_action` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'OS targeting action: ALLOW or BLOCK',
  `browser_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `browser_action` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Browser targeting action: ALLOW or BLOCK',
  `isp_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `carrier_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `city_targeting_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `legacy_capping_mix` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'none',
  `daily_cap` int DEFAULT NULL,
  `monthly_cap` int DEFAULT NULL,
  `total_cap` int DEFAULT NULL,
  `conversion_cap` int DEFAULT NULL,
  `capping_conversions_duration` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Conversion capping duration: daily, weekly, or monthly',
  `budget_cap` decimal(10,2) DEFAULT NULL,
  `advertiser_capping_budget_duration` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Advertiser budget capping duration: daily, weekly, or monthly',
  `advertiser_capping_budget_amount` decimal(10,2) DEFAULT NULL COMMENT 'Advertiser budget capping amount',
  `advertiser_over_capping` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Advertiser over-capping action: pause, fallback, reject, etc.',
  `affiliate_over_capping` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Affiliate over-capping action: pause, fallback, reject, etc.',
  `cap_action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fallback_enabled` tinyint(1) DEFAULT '0',
  `fallback_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fallback_offer_id` int DEFAULT NULL,
  `advertiser_postback_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `advertiser_postback_method` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `advertiser_postback_macros_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `system_postback_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `system_postback_method` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `system_postback_macros_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `public_offer_id` int NOT NULL COMMENT 'Stable public ID used in tracking URLs, unique per tenant',
  `capping_type` enum('budget','conversion') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capping_duration` enum('daily','weekly','monthly') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capping_action` enum('stop','reject','fallback') COLLATE utf8mb4_general_ci DEFAULT 'stop',
  `fallback_type` enum('offer','custom') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `country_action` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Country targeting action: ALLOW or BLOCK',
  `country_list` text COLLATE utf8mb4_general_ci COMMENT 'List of countries to allow or block (comma separated)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_tenant_public_offer_id` (`tenant_id`,`public_offer_id`),
  KEY `fk_offers_advertiser` (`advertiser_id`),
  KEY `idx_offers_visibility` (`offer_visibility`),
  KEY `idx_offers_advertiser_capping` (`advertiser_capping_budget_duration`,`advertiser_capping_budget_amount`),
  KEY `idx_offers_tenant` (`tenant_id`),
  KEY `idx_offers_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_offers_tenant_status` (`tenant_id`,`status`),
  KEY `idx_offer_lookup` (`tenant_id`,`public_offer_id`,`status`),
  KEY `idx_offers_tenant_status_opt` (`tenant_id`,`status`),
  CONSTRAINT `fk_offers_advertiser` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`),
  CONSTRAINT `fk_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `offers_chk_1` CHECK (json_valid(`macros_json`)),
  CONSTRAINT `offers_chk_2` CHECK (json_valid(`device_targeting_json`)),
  CONSTRAINT `offers_chk_3` CHECK (json_valid(`os_targeting_json`)),
  CONSTRAINT `offers_chk_4` CHECK (json_valid(`browser_targeting_json`)),
  CONSTRAINT `offers_chk_5` CHECK (json_valid(`isp_targeting_json`)),
  CONSTRAINT `offers_chk_6` CHECK (json_valid(`carrier_targeting_json`)),
  CONSTRAINT `offers_chk_7` CHECK (json_valid(`city_targeting_json`)),
  CONSTRAINT `offers_chk_8` CHECK (json_valid(`advertiser_postback_macros_json`)),
  CONSTRAINT `offers_chk_9` CHECK (json_valid(`system_postback_macros_json`))
) ENGINE=InnoDB AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `email` varchar(255) NOT NULL,
  `otp` varchar(10) NOT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publisher_offers`
--

DROP TABLE IF EXISTS `publisher_offers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publisher_offers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `publisher_id` int NOT NULL,
  `offer_id` int NOT NULL,
  `tenant_id` int DEFAULT NULL,
  `payout_override` decimal(10,2) DEFAULT NULL,
  `cap_override` int DEFAULT NULL,
  `conversion_approval_percentage` decimal(5,2) DEFAULT NULL,
  `capping_budget_duration` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capping_budget_amount` decimal(10,2) DEFAULT NULL,
  `capping_conversions_duration` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capping_conversions_amount` int DEFAULT NULL,
  `callback_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `destination_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `status` enum('active','inactive','suspended') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'active',
  `assigned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `public_assignment_id` int DEFAULT NULL,
  `capping_type` enum('budget','conversion') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capping_duration` enum('daily','weekly','monthly') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capping_action` enum('stop','reject') COLLATE utf8mb4_general_ci DEFAULT 'stop',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_publisher_offer` (`publisher_id`,`offer_id`),
  UNIQUE KEY `uniq_tenant_public_assignment_id` (`tenant_id`,`public_assignment_id`),
  KEY `idx_po_status` (`status`),
  KEY `idx_po_capping_budget` (`capping_budget_duration`,`capping_budget_amount`),
  KEY `idx_po_capping_conversions` (`capping_conversions_duration`,`capping_conversions_amount`),
  KEY `idx_publisher_offers_offer` (`offer_id`),
  KEY `idx_publisher_offers_tenant` (`tenant_id`),
  KEY `idx_publisher_offers_tenant_offer` (`tenant_id`,`offer_id`),
  KEY `idx_publisher_offers_tenant_publisher` (`tenant_id`,`publisher_id`),
  KEY `idx_publisher_offers_tenant_status` (`tenant_id`,`status`),
  CONSTRAINT `fk_po_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_po_publisher` FOREIGN KEY (`publisher_id`) REFERENCES `publishers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_publisher_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=375 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publishers`
--

DROP TABLE IF EXISTS `publishers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publishers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `company_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `global_postback_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `status` enum('pending','active','suspended') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'active',
  `tenant_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `public_publisher_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email_tenant` (`email`,`tenant_id`),
  UNIQUE KEY `uniq_tenant_public_publisher_id` (`tenant_id`,`public_publisher_id`),
  KEY `idx_publishers_status` (`status`),
  KEY `idx_publishers_email` (`email`),
  KEY `idx_publishers_tenant` (`tenant_id`),
  KEY `idx_publishers_tenant_status` (`tenant_id`,`status`),
  KEY `idx_publishers_tenant_created` (`tenant_id`,`created_at`),
  CONSTRAINT `fk_publishers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `subscription_history`
--

DROP TABLE IF EXISTS `subscription_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `action` enum('TRIAL_STARTED','TRIAL_EXTENDED','SUBSCRIPTION_ACTIVATED','SUBSCRIPTION_EXTENDED','SUBSCRIPTION_EXPIRED','TENANT_SUSPENDED','TENANT_UNSUSPENDED','TRIAL_RESET') COLLATE utf8mb4_general_ci NOT NULL,
  `previous_state` enum('TRIAL','ACTIVE','EXPIRED','SUSPENDED') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `new_state` enum('TRIAL','ACTIVE','EXPIRED','SUSPENDED') COLLATE utf8mb4_general_ci NOT NULL,
  `previous_end_at` timestamp NULL DEFAULT NULL COMMENT 'Previous expiry time (trial or subscription)',
  `new_end_at` timestamp NULL DEFAULT NULL COMMENT 'New expiry time (trial or subscription)',
  `admin_id` int DEFAULT NULL COMMENT 'Admin who performed the action (NULL for system actions)',
  `notes` text COLLATE utf8mb4_general_ci COMMENT 'Additional notes about the action',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subscription_history_tenant` (`tenant_id`),
  KEY `idx_subscription_history_action` (`action`),
  KEY `idx_subscription_history_created` (`created_at`),
  CONSTRAINT `fk_subscription_history_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Audit trail for all subscription and trial changes';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `tenant_stats`
--

DROP TABLE IF EXISTS `tenant_stats`;
/*!50001 DROP VIEW IF EXISTS `tenant_stats`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `tenant_stats` AS SELECT 
 1 AS `tenant_id`,
 1 AS `tenant_name`,
 1 AS `tenant_slug`,
 1 AS `tenant_status`,
 1 AS `total_offers`,
 1 AS `total_publishers`,
 1 AS `total_clicks`,
 1 AS `total_conversions`,
 1 AS `total_revenue`,
 1 AS `total_payout`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `tenants`
--

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `slug` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('TRIAL','ACTIVE','EXPIRED','SUSPENDED') COLLATE utf8mb4_general_ci DEFAULT 'TRIAL' COMMENT 'Tenant subscription state',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `trial_start_at` timestamp NULL DEFAULT NULL COMMENT 'Trial start time (UTC) - set on first login',
  `trial_end_at` timestamp NULL DEFAULT NULL COMMENT 'Trial end time (UTC) - trial_start_at + 10 days',
  `subscription_start_at` timestamp NULL DEFAULT NULL COMMENT 'Subscription activation time (UTC)',
  `subscription_end_at` timestamp NULL DEFAULT NULL COMMENT 'Subscription expiry time (UTC)',
  `subscription_plan` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Subscription plan identifier (e.g., basic, pro, enterprise)',
  `billing_email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Billing contact email',
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_tenants_status` (`status`),
  KEY `idx_tenants_state` (`status`),
  KEY `idx_tenants_trial_end` (`trial_end_at`),
  KEY `idx_tenants_subscription_end` (`subscription_end_at`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `test_postback_sessions`
--

DROP TABLE IF EXISTS `test_postback_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_postback_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `publisher_id` bigint NOT NULL,
  `test_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tracking_url` text COLLATE utf8mb4_unicode_ci,
  `received_tid` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','fired','expired') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `result_data` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fired_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_test_session_lookup` (`publisher_id`,`status`,`created_at`),
  KEY `idx_test_token` (`test_token`),
  KEY `idx_test_tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Final view structure for view `tenant_stats`
--

/*!50001 DROP VIEW IF EXISTS `tenant_stats`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`track_admin`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `tenant_stats` AS select `t`.`id` AS `tenant_id`,`t`.`name` AS `tenant_name`,`t`.`slug` AS `tenant_slug`,`t`.`status` AS `tenant_status`,count(distinct `o`.`id`) AS `total_offers`,count(distinct `p`.`id`) AS `total_publishers`,count(distinct `c`.`id`) AS `total_clicks`,count(distinct `conv`.`id`) AS `total_conversions`,coalesce(sum(`conv`.`amount`),0) AS `total_revenue`,coalesce(sum(`conv`.`payout`),0) AS `total_payout` from ((((`tenants` `t` left join `offers` `o` on((`o`.`tenant_id` = `t`.`id`))) left join `publishers` `p` on((`p`.`tenant_id` = `t`.`id`))) left join `clicks` `c` on((`c`.`tenant_id` = `t`.`id`))) left join `conversions` `conv` on((`conv`.`tenant_id` = `t`.`id`))) group by `t`.`id`,`t`.`name`,`t`.`slug`,`t`.`status` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-13 18:50:02
