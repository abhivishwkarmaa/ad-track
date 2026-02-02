import pool from './connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runSpecificMigration() {
    try {
        const sqlPath = path.join(__dirname, 'migrations', '010_create_test_postback_sessions.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration: 010_create_test_postback_sessions.sql');
        await pool.query('DROP TABLE IF EXISTS test_postback_sessions');
        await pool.query(sql);
        console.log('✅ Migration success!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

runSpecificMigration();
