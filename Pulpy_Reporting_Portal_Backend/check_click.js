import pool from './src/db/connection.js';

async function checkClick(uuid) {
    try {
        const [rows] = await pool.query('SELECT * FROM clicks WHERE click_uuid = ?', [uuid]);
        if (rows.length > 0) {
            console.log('✅ Click Found:', JSON.stringify(rows[0], null, 2));
        } else {
            console.log('❌ Click Not Found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkClick('CUzU0vUgHIvVRGv_WlJ5KsGv1y5YfnsfGihJ');
