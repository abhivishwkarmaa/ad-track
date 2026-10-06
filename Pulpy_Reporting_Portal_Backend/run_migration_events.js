import pool from './src/db/connection.js';

async function migrateEvents() {
    try {
        console.log('🚀 Running Migration: 003_add_event_based_tracking...');

        // 1. Create offer_events table
        console.log('1. Creating offer_events table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS \`offer_events\` (
              \`id\` bigint NOT NULL AUTO_INCREMENT,
              \`tenant_id\` int NOT NULL,
              \`offer_id\` int NOT NULL,
              \`event_name\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Identifier sent in callback, e.g. install, registration, deposit',
              \`title\` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Display label in UI',
              \`advertiser_amount\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Revenue received from advertiser for this event',
              \`affiliate_amount\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Payout given to affiliate for this event',
              \`allow_multiple\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = unique per click (deduped), 1 = allow multiple conversions per click',
              \`status\` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              UNIQUE KEY \`uniq_offer_event\` (\`offer_id\`, \`event_name\`),
              KEY \`idx_tenant_offer_events\` (\`tenant_id\`, \`offer_id\`),
              CONSTRAINT \`fk_oe_offer\` FOREIGN KEY (\`offer_id\`) REFERENCES \`offers\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_oe_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `);
        console.log('✅ offer_events table verified/created.');

        // 2. Add event_name column to conversions table if not exists
        console.log('2. Checking event_name column in conversions...');
        const [colRows] = await pool.query("SHOW COLUMNS FROM conversions LIKE 'event_name'");
        if (!colRows || colRows.length === 0) {
            await pool.query(`
                ALTER TABLE \`conversions\` 
                ADD COLUMN \`event_name\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'default' AFTER \`rcid\`
            `);
            console.log('✅ Added event_name column to conversions.');
        } else {
            console.log('ℹ️ event_name column already exists in conversions.');
        }

        // 3. Inspect indexes on conversions
        console.log('3. Adjusting indexes on conversions...');
        const [indexes] = await pool.query('SHOW INDEX FROM conversions');
        const indexNames = new Set(indexes.map(i => i.Key_name));

        // Drop old uniq_click_uuid if present
        if (indexNames.has('uniq_click_uuid')) {
            await pool.query('ALTER TABLE `conversions` DROP INDEX `uniq_click_uuid`');
            console.log('✅ Dropped single-column uniq_click_uuid index.');
        }

        // Add uniq_click_uuid_event if not present
        if (!indexNames.has('uniq_click_uuid_event')) {
            await pool.query('ALTER TABLE `conversions` ADD UNIQUE KEY `uniq_click_uuid_event` (`click_uuid`, `event_name`)');
            console.log('✅ Added composite unique index uniq_click_uuid_event(click_uuid, event_name).');
        }

        // Drop old uniq_rcid_offer if present
        if (indexNames.has('uniq_rcid_offer')) {
            await pool.query('ALTER TABLE `conversions` DROP INDEX `uniq_rcid_offer`');
            console.log('✅ Dropped single-event uniq_rcid_offer index.');
        }

        // Add uniq_rcid_offer_event if not present
        if (!indexNames.has('uniq_rcid_offer_event')) {
            await pool.query('ALTER TABLE `conversions` ADD UNIQUE KEY `uniq_rcid_offer_event` (`rcid`, `offer_id`, `event_name`)');
            console.log('✅ Added composite unique index uniq_rcid_offer_event(rcid, offer_id, event_name).');
        }

        // Add idx_conversions_event_name if not present
        if (!indexNames.has('idx_conversions_event_name')) {
            await pool.query('ALTER TABLE `conversions` ADD KEY `idx_conversions_event_name` (`event_name`)');
            console.log('✅ Added index idx_conversions_event_name.');
        }

        // 4. Ensure is_primary column in offer_events
        console.log('4. Checking is_primary column in offer_events...');
        const [isPrimaryCol] = await pool.query("SHOW COLUMNS FROM offer_events LIKE 'is_primary'");
        if (!isPrimaryCol || isPrimaryCol.length === 0) {
            await pool.query('ALTER TABLE `offer_events` ADD COLUMN `is_primary` tinyint(1) NOT NULL DEFAULT 0 AFTER `affiliate_amount`');
            console.log('✅ Added is_primary column to offer_events.');
        } else {
            console.log('ℹ️ is_primary column already exists in offer_events.');
        }

        // 5. Create daily_offer_event_stats table
        console.log('5. Checking daily_offer_event_stats table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS \`daily_offer_event_stats\` (
              \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
              \`tenant_id\` int NOT NULL,
              \`offer_id\` int NOT NULL,
              \`event_name\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default',
              \`day\` date NOT NULL,
              \`conversions\` int unsigned NOT NULL DEFAULT '0',
              \`approved_conversions\` int unsigned NOT NULL DEFAULT '0',
              \`pending_conversions\` int unsigned NOT NULL DEFAULT '0',
              \`rejected_conversions\` int unsigned NOT NULL DEFAULT '0',
              \`revenue\` decimal(18,4) NOT NULL DEFAULT '0.0000',
              \`payout\` decimal(18,4) NOT NULL DEFAULT '0.0000',
              \`profit\` decimal(18,4) NOT NULL DEFAULT '0.0000',
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              UNIQUE KEY \`uniq_tenant_offer_event_day\` (\`tenant_id\`,\`offer_id\`,\`event_name\`,\`day\`),
              KEY \`idx_event_stats_day\` (\`day\`),
              KEY \`idx_event_stats_offer\` (\`offer_id\`),
              KEY \`idx_event_stats_event\` (\`event_name\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ daily_offer_event_stats table verified/created.');

        // 6. Create event_logs table
        console.log('6. Checking event_logs table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS \`event_logs\` (
              \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
              \`tenant_id\` int NOT NULL,
              \`offer_id\` int NOT NULL,
              \`publisher_id\` int NOT NULL DEFAULT '0',
              \`click_uuid\` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`event_name\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`amount\` decimal(18,4) NOT NULL DEFAULT '0.0000',
              \`payout\` decimal(18,4) NOT NULL DEFAULT '0.0000',
              \`is_conversion\` tinyint(1) NOT NULL DEFAULT '0',
              \`status\` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved',
              \`ip\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`postback_payload\` json DEFAULT NULL,
              \`affiliate_postback_fired\` tinyint(1) NOT NULL DEFAULT '0',
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              KEY \`idx_event_logs_click\` (\`click_uuid\`),
              KEY \`idx_event_logs_lookup\` (\`tenant_id\`, \`click_uuid\`, \`event_name\`),
              KEY \`idx_event_logs_tenant_offer\` (\`tenant_id\`,\`offer_id\`),
              KEY \`idx_event_logs_created\` (\`created_at\`),
              KEY \`idx_event_logs_event_name\` (\`event_name\`),
              KEY \`idx_event_logs_tenant_event\` (\`tenant_id\`,\`event_name\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ event_logs table verified/created.');

        // Check idx_event_logs_lookup
        const [evIndexes] = await pool.query('SHOW INDEX FROM event_logs WHERE Key_name = "idx_event_logs_lookup"');
        if (!evIndexes || evIndexes.length === 0) {
            await pool.query('ALTER TABLE `event_logs` ADD KEY `idx_event_logs_lookup` (`tenant_id`, `click_uuid`, `event_name`)');
            console.log('✅ Added composite index idx_event_logs_lookup to event_logs.');
        }

        console.log('🎉 All Event-based tracking migrations completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration error:', err);
        process.exit(1);
    }
}

migrateEvents();
