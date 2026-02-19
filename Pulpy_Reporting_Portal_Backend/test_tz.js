import pool from './src/db/connection.js';

async function test() {
    try {
        const [rows] = await pool.query("SELECT CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30') as ist_time, UTC_TIMESTAMP() as utc, NOW() as now_db");
        console.log('Timezone Test Result:', rows[0]);
    } catch (err) {
        console.error('Timezone Test Error:', err);
    } finally {
        process.exit();
    }
}

test();
