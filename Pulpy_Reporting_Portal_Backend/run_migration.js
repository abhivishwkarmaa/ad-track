import pool from './src/db/connection.js';

async function migrate() {
    try {
        console.log('Running migration...');
        await pool.query("ALTER TABLE offers ADD COLUMN country_action varchar(20) DEFAULT NULL COMMENT 'Country targeting action: ALLOW or BLOCK', ADD COLUMN country_list text DEFAULT NULL COMMENT 'List of countries to allow or block (comma separated)';");
        console.log('Migration successful.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist.');
        } else {
            console.error('Migration failed:', err);
        }
    } finally {
        process.exit(0);
    }
}

migrate();
