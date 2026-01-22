import pool from './src/db/connection.js';

async function getData() {
    try {
        const [tenants] = await pool.query('SELECT * FROM tenants LIMIT 1');
        if (tenants.length === 0) {
            console.log('No tenants found');
            process.exit(1);
        }
        const tenant = tenants[0];

        // Check for offers
        const [offers] = await pool.query('SELECT * FROM offers WHERE tenant_id = ? LIMIT 1', [tenant.id]);

        // Check for publishers
        const [publishers] = await pool.query('SELECT * FROM publishers WHERE tenant_id = ? LIMIT 1', [tenant.id]);

        // Calculate a valid Link
        // If no offer/pub, suggest creating one?

        console.log(JSON.stringify({
            tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
            offer: offers[0] ? { id: offers[0].id, name: offers[0].name } : null,
            publisher: publishers[0] ? { id: publishers[0].id, company_name: publishers[0].company_name } : null
        }, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

getData();
