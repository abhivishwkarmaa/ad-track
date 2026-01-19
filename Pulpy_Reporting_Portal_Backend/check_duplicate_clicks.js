/**
 * Script to check for duplicate clicks in the database
 * Run this to identify duplicate click_uuid values before applying the UNIQUE constraint
 */

import pool from './src/db/connection.js';

async function checkDuplicateClicks() {
    try {
        console.log('🔍 Checking for duplicate clicks...\n');

        // Check for duplicate click_uuid values
        const [duplicates] = await pool.query(`
            SELECT 
                click_uuid,
                COUNT(*) as count,
                GROUP_CONCAT(id ORDER BY id) as ids,
                GROUP_CONCAT(created_at ORDER BY id) as created_dates,
                MIN(created_at) as first_created,
                MAX(created_at) as last_created
            FROM clicks
            GROUP BY click_uuid
            HAVING count > 1
            ORDER BY count DESC
            LIMIT 50
        `);

        if (duplicates.length === 0) {
            console.log('✅ No duplicate clicks found!');
            console.log('   You can safely apply the UNIQUE constraint on click_uuid.\n');
            return;
        }

        console.log(`❌ Found ${duplicates.length} duplicate click_uuid values:\n`);
        
        let totalDuplicateRecords = 0;
        duplicates.forEach((dup, index) => {
            const ids = dup.ids.split(',').map(id => parseInt(id));
            const duplicateCount = dup.count - 1; // Subtract 1 to get number of duplicates
            totalDuplicateRecords += duplicateCount;
            
            console.log(`${index + 1}. Click UUID: ${dup.click_uuid}`);
            console.log(`   Count: ${dup.count} records`);
            console.log(`   IDs: ${ids.join(', ')}`);
            console.log(`   First created: ${dup.first_created}`);
            console.log(`   Last created: ${dup.last_created}`);
            console.log(`   → ${duplicateCount} duplicate record(s) to remove\n`);
        });

        console.log(`\n📊 Summary:`);
        console.log(`   Total unique click_uuid values with duplicates: ${duplicates.length}`);
        console.log(`   Total duplicate records to remove: ${totalDuplicateRecords}`);
        console.log(`\n💡 To clean up duplicates, run:`);
        console.log(`   node src/db/cleanup-duplicate-clicks.js\n`);

    } catch (error) {
        console.error('❌ Error checking for duplicates:', error);
    } finally {
        await pool.end();
    }
}

checkDuplicateClicks();
