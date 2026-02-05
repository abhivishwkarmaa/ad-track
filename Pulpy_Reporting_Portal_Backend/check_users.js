
import pool from './src/db/connection.js';

async function checkUsers() {
    try {
        const [rows] = await pool.query('SELECT * FROM admin_users LIMIT 5');
        console.log(rows);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkUsers();
