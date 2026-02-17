import pool from '../connection.js';
import logger from '../../utils/logger.js';

async function runMigration() {
    const connection = await pool.getConnection();
    try {
        logger.info('Starting capping migration...');

        // Check if column capping_type exists and rename it if legacy_capping_mix doesn't exist
        const [legacyCols] = await connection.query("SHOW COLUMNS FROM offers LIKE 'legacy_capping_mix'");
        const [cappingCols] = await connection.query("SHOW COLUMNS FROM offers LIKE 'capping_type'");

        if (legacyCols.length === 0 && cappingCols.length > 0) {
            const colType = cappingCols[0].Type.toLowerCase();
            // If it's the old enum or varchar, rename it
            if (colType.includes('varchar') || (colType.includes('enum') && colType.includes('daily'))) {
                logger.info('Renaming old capping_type column to legacy_capping_mix...');
                await connection.query("ALTER TABLE offers CHANGE COLUMN capping_type legacy_capping_mix VARCHAR(50) DEFAULT 'none'");
            }
        }

        // Add Offer Columns
        const [checkOffer] = await connection.query("SHOW COLUMNS FROM offers LIKE 'capping_strategy'"); // Renamed in prompt but SQL used capping_type?
        // Wait, in my SQL file I used capping_type ENUM.
        // If I renamed the old capping_type to legacy_capping_mix, I can add capping_type again.

        // Let's create columns if they don't exist
        const [offerCols] = await connection.query("SHOW COLUMNS FROM offers LIKE 'capping_type'");
        if (offerCols.length === 0) {
            logger.info('Adding capping_type to offers...');
            await connection.query("ALTER TABLE offers ADD COLUMN capping_type ENUM('budget', 'conversion') NULL");
        }

        const [durationCols] = await connection.query("SHOW COLUMNS FROM offers LIKE 'capping_duration'");
        if (durationCols.length === 0) {
            logger.info('Adding capping_duration to offers...');
            await connection.query("ALTER TABLE offers ADD COLUMN capping_duration ENUM('daily', 'weekly', 'monthly') NULL");
        }

        const [actionCols] = await connection.query("SHOW COLUMNS FROM offers LIKE 'capping_action'");
        if (actionCols.length === 0) {
            logger.info('Adding capping_action to offers...');
            await connection.query("ALTER TABLE offers ADD COLUMN capping_action ENUM('stop', 'reject', 'fallback') DEFAULT 'stop'");
        }

        const [fallbackCols] = await connection.query("SHOW COLUMNS FROM offers LIKE 'fallback_type'");
        if (fallbackCols.length === 0) {
            logger.info('Adding fallback_type to offers...');
            await connection.query("ALTER TABLE offers ADD COLUMN fallback_type ENUM('offer', 'custom') NULL");
        }


        // Publisher Offers
        const [pubType] = await connection.query("SHOW COLUMNS FROM publisher_offers LIKE 'capping_type'");
        if (pubType.length === 0) {
            logger.info('Adding capping_type to publisher_offers...');
            await connection.query("ALTER TABLE publisher_offers ADD COLUMN capping_type ENUM('budget', 'conversion') NULL");
        }

        const [pubDur] = await connection.query("SHOW COLUMNS FROM publisher_offers LIKE 'capping_duration'");
        if (pubDur.length === 0) {
            logger.info('Adding capping_duration to publisher_offers...');
            await connection.query("ALTER TABLE publisher_offers ADD COLUMN capping_duration ENUM('daily', 'weekly', 'monthly') NULL");
        }

        const [pubAct] = await connection.query("SHOW COLUMNS FROM publisher_offers LIKE 'capping_action'");
        if (pubAct.length === 0) {
            logger.info('Adding capping_action to publisher_offers...');
            await connection.query("ALTER TABLE publisher_offers ADD COLUMN capping_action ENUM('stop', 'reject') DEFAULT 'stop'");
        }

        logger.info('Migration complete.');
    } catch (err) {
        logger.error('Migration failed:', err);
    } finally {
        connection.release();
        process.exit();
    }
}

runMigration();
