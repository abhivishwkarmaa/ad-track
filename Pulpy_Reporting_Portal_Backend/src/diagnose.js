
import 'dotenv/config';
import pool from './db/connection.js';

async function diagnose() {
    try {
        const [tenants] = await pool.query('SELECT id, slug FROM tenants WHERE slug = ?', ['panzcon']);
        console.log('Tenant:', tenants[0]);
        if (!tenants[0]) {
            const [allTenants] = await pool.query('SELECT id, slug FROM tenants');
            console.log('All Tenants:', allTenants);
            return;
        }

        const tenantId = tenants[0].id;
        const [offers] = await pool.query('SELECT id, public_offer_id FROM offers WHERE tenant_id = ?', [tenantId]);
        console.log('Offers for panzcon:', offers);

        const [offer1] = await pool.query('SELECT id, tenant_id FROM offers WHERE id = 1');
        console.log('Offer with ID 1:', offer1[0]);

        const [assignments] = await pool.query(`
            SELECT po.id, po.public_assignment_id, po.offer_id, po.publisher_id, po.tenant_id 
            FROM publisher_offers po 
            WHERE po.tenant_id = ?`, [tenantId]);
        console.log('Assignments for panzcon:', assignments);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

diagnose();
