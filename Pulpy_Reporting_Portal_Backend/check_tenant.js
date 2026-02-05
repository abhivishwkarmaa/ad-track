
import pool from './src/db/connection.js';

async function checkTenants() {
    try {
        const [rows] = await pool.query('SELECT * FROM tenants WHERE id = 4');
        console.log(rows);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkTenants();
