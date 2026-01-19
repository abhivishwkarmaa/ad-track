
import pool from './src/db/connection.js';

async function checkOfferCaps() {
    const offerId = 24;
    try {
        const [rows] = await pool.query('SELECT * FROM offers WHERE id = ?', [offerId]);
        console.log(rows[0]);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOfferCaps();
