
import pool from './connection.js';
import logger from '../utils/logger.js';

async function runSchemaUpdate() {
    console.log('🔄 Starting schema update for public IDs...');
    const connection = await pool.getConnection();

    try {
        // 1. Add Columns if they don't exist
        const addColumn = async (table, col) => {
            try {
                await connection.query(`ALTER TABLE ${table} ADD COLUMN ${col} INT`);
                console.log(`✅ Added ${col} to ${table}`);
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`ℹ️  Column ${col} already exists in ${table}`);
                } else {
                    throw err;
                }
            }
        };

        await addColumn('advertisers', 'public_advertiser_id');
        await addColumn('publishers', 'public_publisher_id');
        await addColumn('publisher_offers', 'public_assignment_id');

        // 2. Backfill Logic
        console.log('🔄 Backfilling public IDs...');

        // Get all tenants
        const [tenants] = await connection.query('SELECT id FROM tenants');
        console.log(`Found ${tenants.length} tenants.`);

        for (const tenant of tenants) {
            const tenantId = tenant.id;
            console.log(`Processing Tenant ${tenantId}...`);

            // Backfill Advertisers
            const [advertisers] = await connection.query(
                'SELECT id FROM advertisers WHERE tenant_id = ? AND public_advertiser_id IS NULL ORDER BY created_at ASC',
                [tenantId]
            );

            let nextAdvId = 1;
            const [maxAdv] = await connection.query('SELECT MAX(public_advertiser_id) as max_id FROM advertisers WHERE tenant_id = ?', [tenantId]);
            if (maxAdv[0].max_id) {
                nextAdvId = maxAdv[0].max_id + 1;
            }

            for (const adv of advertisers) {
                await connection.query('UPDATE advertisers SET public_advertiser_id = ? WHERE id = ?', [nextAdvId, adv.id]);
                nextAdvId++;
            }
            if (advertisers.length > 0) console.log(`   Processed ${advertisers.length} advertisers.`);

            // Backfill Publishers
            const [publishers] = await connection.query(
                'SELECT id FROM publishers WHERE tenant_id = ? AND public_publisher_id IS NULL ORDER BY created_at ASC',
                [tenantId]
            );

            let nextPubId = 1;
            const [maxPub] = await connection.query('SELECT MAX(public_publisher_id) as max_id FROM publishers WHERE tenant_id = ?', [tenantId]);
            if (maxPub[0].max_id) {
                nextPubId = maxPub[0].max_id + 1;
            }

            for (const pub of publishers) {
                await connection.query('UPDATE publishers SET public_publisher_id = ? WHERE id = ?', [nextPubId, pub.id]);
                nextPubId++;
            }
            if (publishers.length > 0) console.log(`   Processed ${publishers.length} publishers.`);

            // Backfill Assignments
            const [assignments] = await connection.query(
                'SELECT id FROM publisher_offers WHERE tenant_id = ? AND public_assignment_id IS NULL ORDER BY assigned_at ASC',
                [tenantId]
            );

            let nextAssId = 1;
            const [maxAss] = await connection.query('SELECT MAX(public_assignment_id) as max_id FROM publisher_offers WHERE tenant_id = ?', [tenantId]);
            if (maxAss[0].max_id) {
                nextAssId = maxAss[0].max_id + 1;
            }

            for (const ass of assignments) {
                await connection.query('UPDATE publisher_offers SET public_assignment_id = ? WHERE id = ?', [nextAssId, ass.id]);
                nextAssId++;
            }
            if (assignments.length > 0) console.log(`   Processed ${assignments.length} assignments.`);
        }

        // 3. Add Unique Constraints
        const addUnique = async (table, constraintName, cols) => {
            try {
                await connection.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${constraintName} (${cols})`);
                console.log(`✅ Added unique constraint ${constraintName} to ${table}`);
            } catch (err) {
                if (err.code === 'ER_DUP_KEYNAME') {
                    console.log(`ℹ️  Constraint ${constraintName} already exists`);
                } else {
                    console.error(`Error adding unique key: ${err.message}`);
                    // Don't throw, just log
                }
            }
        };

        await addUnique('advertisers', 'uniq_tenant_public_advertiser_id', 'tenant_id, public_advertiser_id');
        await addUnique('publishers', 'uniq_tenant_public_publisher_id', 'tenant_id, public_publisher_id');
        await addUnique('publisher_offers', 'uniq_tenant_public_assignment_id', 'tenant_id, public_assignment_id');

        console.log('🎉 Public ID schema update completed successfully!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Schema update failed:', err);
        process.exit(1);
    } finally {
        connection.release();
    }
}

runSchemaUpdate();
