/**
 * Test tracking URL generation with public_offer_id
 */

import assignmentService from './src/services/assignmentService.js';
import pool from './src/db/connection.js';

async function testTrackingUrlGeneration() {
    console.log('\n🧪 Testing Tracking URL Generation with Public Offer ID\n');
    console.log('='.repeat(60));

    try {
        // Find an assignment
        const [assignments] = await pool.query(
            `SELECT * FROM publisher_offers LIMIT 1`
        );

        if (assignments.length === 0) {
            console.log('❌ No assignments found in database');
            await pool.end();
            process.exit(1);
        }

        const assignment = assignments[0];
        console.log('\n1️⃣  Found Assignment:');
        console.log(`   Assignment ID: ${assignment.id}`);
        console.log(`   Offer ID (internal): ${assignment.offer_id}`);
        console.log(`   Publisher ID: ${assignment.publisher_id}`);
        console.log(`   Tenant ID: ${assignment.tenant_id}`);

        // Get the offer to see its public_offer_id
        const [offers] = await pool.query(
            `SELECT id, public_offer_id, name FROM offers WHERE id = ?`,
            [assignment.offer_id]
        );

        if (offers.length === 0) {
            console.log('❌ Offer not found');
            await pool.end();
            process.exit(1);
        }

        const offer = offers[0];
        console.log('\n2️⃣  Offer Details:');
        console.log(`   Offer ID (internal): ${offer.id}`);
        console.log(`   Public Offer ID: ${offer.public_offer_id}`);
        console.log(`   Offer Name: ${offer.name}`);

        // Generate tracking URL
        console.log('\n3️⃣  Generating Tracking URL...');
        const baseURL = 'https://tenant.track-myads.com';
        const trackingUrl = await assignmentService.generateTrackingURL(
            assignment.id,
            baseURL,
            'standard'
        );

        console.log(`   Base URL: ${baseURL}`);
        console.log(`   Generated URL: ${trackingUrl}`);

        // Parse and verify
        if (trackingUrl) {
            const url = new URL(trackingUrl);
            const offerIdParam = url.searchParams.get('offer_id');
            const pubIdParam = url.searchParams.get('pub_id');

            console.log('\n4️⃣  URL Parameters:');
            console.log(`   offer_id: ${offerIdParam}`);
            console.log(`   pub_id: ${pubIdParam}`);

            // Verify it's using public_offer_id
            if (parseInt(offerIdParam) === offer.public_offer_id) {
                console.log('\n✅ SUCCESS: Tracking URL uses public_offer_id!');
                console.log(`   Expected: ${offer.public_offer_id}`);
                console.log(`   Got: ${offerIdParam}`);
            } else {
                console.log('\n❌ FAILURE: Tracking URL is NOT using public_offer_id!');
                console.log(`   Expected (public_offer_id): ${offer.public_offer_id}`);
                console.log(`   Got (offer_id param): ${offerIdParam}`);
                console.log(`   Internal offer ID: ${offer.id}`);
            }
        } else {
            console.log('\n❌ Failed to generate tracking URL');
        }

        // Test alternative format too
        console.log('\n5️⃣  Testing Alternative Format...');
        const altTrackingUrl = await assignmentService.generateTrackingURL(
            assignment.id,
            baseURL,
            'alternative'
        );

        if (altTrackingUrl) {
            console.log(`   Alternative URL: ${altTrackingUrl}`);
            const altUrl = new URL(altTrackingUrl);
            const oidParam = altUrl.searchParams.get('oid');
            console.log(`   oid parameter: ${oidParam}`);

            if (parseInt(oidParam) === offer.public_offer_id) {
                console.log('   ✅ Alternative format also uses public_offer_id!');
            } else {
                console.log('   ❌ Alternative format NOT using public_offer_id!');
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Test completed!');
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

// Run test
testTrackingUrlGeneration();
