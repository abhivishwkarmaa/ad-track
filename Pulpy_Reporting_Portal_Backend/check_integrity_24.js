
import pool from './src/db/connection.js';

async function checkIntegrity() {
    const offerId = 24;
    const pubId = 10;

    console.log(`Checking integrity for Offer ${offerId} and Publisher ${pubId}...`);

    try {
        // 1. Check Offer
        const [offerRows] = await pool.query('SELECT id, status, tenant_id FROM offers WHERE id = ?', [offerId]);
        if (offerRows.length === 0) {
            console.log('❌ Offer not found!');
        } else {
            console.log('✅ Offer found:', offerRows[0]);
        }

        // 2. Check Publisher
        const [pubRows] = await pool.query('SELECT id, status, tenant_id FROM publishers WHERE id = ?', [pubId]);
        if (pubRows.length === 0) {
            console.log('❌ Publisher not found!');
        } else {
            console.log('✅ Publisher found:', pubRows[0]);
        }

        // 3. Check Assignment (Publisher Offer)
        const [assignRows] = await pool.query('SELECT id, status, tenant_id FROM publisher_offers WHERE offer_id = ? AND publisher_id = ?', [offerId, pubId]);
        if (assignRows.length === 0) {
            console.log('❌ Assignment (publisher_offers) not found!');
        } else {
            console.log('✅ Assignment found:', assignRows[0]);
        }

        // 4. Check Tenant Consistency
        if (offerRows.length > 0 && pubRows.length > 0) {
            if (offerRows[0].tenant_id !== pubRows[0].tenant_id) {
                console.log(`❌ Tenant Mismatch! Offer Tenant: ${offerRows[0].tenant_id}, Publisher Tenant: ${pubRows[0].tenant_id}`);
            } else {
                console.log(`✅ Tenant Match: ${offerRows[0].tenant_id}`);
            }
        }

        if (assignRows.length > 0 && offerRows.length > 0) {
            if (assignRows[0].tenant_id !== offerRows[0].tenant_id) {
                console.log(`❌ Assignment Tenant Mismatch! Assignment: ${assignRows[0].tenant_id}, Offer: ${offerRows[0].tenant_id}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Error during integrity check:', err);
        process.exit(1);
    }
}

checkIntegrity();
