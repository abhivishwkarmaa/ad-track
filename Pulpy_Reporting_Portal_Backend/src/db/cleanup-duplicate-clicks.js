/**
 * Script to clean up duplicate clicks
 * Keeps the first record (lowest ID) and deletes the rest
 * Run this BEFORE applying the UNIQUE constraint on click_uuid
 */

import pool from './connection.js';

async function cleanupDuplicateClicks() {
    try {
        console.log('🧹 Starting cleanup of duplicate clicks...\n');

        // First, check what duplicates exist
        const [duplicates] = await pool.query(`
            SELECT 
                click_uuid,
                COUNT(*) as count,
                GROUP_CONCAT(id ORDER BY id) as ids
            FROM clicks
            GROUP BY click_uuid
            HAVING count > 1
        `);

        if (duplicates.length === 0) {
            console.log('✅ No duplicate clicks found. Cleanup not needed.');
            return;
        }

        console.log(`Found ${duplicates.length} click_uuid values with duplicates\n`);

        let totalDeleted = 0;

        for (const dup of duplicates) {
            const ids = dup.ids.split(',').map(id => parseInt(id));
            const keepId = ids[0]; // Keep the first (lowest ID)
            const deleteIds = ids.slice(1); // Delete the rest

            if (deleteIds.length === 0) continue;

            // Delete duplicate records (keep the first one)
            const [result] = await pool.query(
                `DELETE FROM clicks WHERE id IN (?) AND click_uuid = ?`,
                [deleteIds, dup.click_uuid]
            );

            const deleted = result.affectedRows || 0;
            totalDeleted += deleted;

            console.log(`✅ Cleaned click ${dup.click_uuid}: kept ID ${keepId}, deleted ${deleted} duplicate(s)`);
        }

        console.log(`\n🎉 Cleanup completed! Total duplicate clicks removed: ${totalDeleted}\n`);

        // Verify no duplicates remain
        const [remaining] = await pool.query(`
            SELECT click_uuid, COUNT(*) as count
            FROM clicks
            GROUP BY click_uuid
            HAVING count > 1
        `);

        if (remaining.length === 0) {
            console.log('✅ Verification: No duplicate clicks remain');
            console.log('   You can now safely apply the UNIQUE constraint on click_uuid.\n');
        } else {
            console.log(`❌ Warning: ${remaining.length} duplicate click_uuid values still exist`);
            console.log('   Please investigate and clean up manually.\n');
        }

    } catch (error) {
        console.error('❌ Cleanup error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run cleanup
cleanupDuplicateClicks().catch(console.error);
