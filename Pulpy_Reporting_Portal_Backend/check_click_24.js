
import pool from './src/db/connection.js';

async function checkClickRecorded() {
    const offerId = 24;
    const pubId = 10;

    console.log(`Checking clicks for Offer ${offerId}, Publisher ${pubId}...`);

    try {
        const [rows] = await pool.query(
            'SELECT * FROM clicks WHERE offer_id = ? AND publisher_id = ? ORDER BY created_at DESC LIMIT 5',
            [offerId, pubId]
        );

        console.log(`Found ${rows.length} clicks:`);
        rows.forEach(r => console.log(`- ID: ${r.id}, ClickUUID: ${r.click_uuid}, Created: ${r.created_at}, Tenant: ${r.tenant_id}`));

        if (rows.length > 0) {
            console.log("✅ Click recorded successfully.");
            process.exit(0);
        } else {
            console.log("❌ No clicks found.");
            process.exit(1);
        }
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

checkClickRecorded();
