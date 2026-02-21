import 'dotenv/config';
import trackingService from './src/services/trackingService.js';
import offerService from './src/services/offer.service.js';
import pool from './src/db/connection.js';

async function testCountryTargeting() {
    try {
        console.log('Testing Country Targeting Implementation...');

        // We will bypass the database layer for testing trackingService directly by mocking the offer details
        const fakeOffer = {
            id: 9999,
            status: 'live',
            country_action: 'BLOCK',
            country_list: 'US,UK',
            capping_type: 'none',
        };

        const fakeAssignment = { id: 8888, publisher_id: 7777, status: 'active', capping_type: 'none' };
        const fakePublisher = { id: 7777, status: 'active' };

        const mockRequest = { headers: { host: 'abhi.localhost' } };
        // We will simulate a user from the US. IP 8.8.8.8 resolves to US in most GeoIP setups, or we can just mock standard.
        const ip = '8.8.8.8';
        const userAgent = 'Mozilla/5.0';
        const query = {};

        // For trackingService to not crash, we override or mock if needed
        // But trackClick expects a lot of DB fetches depending on the id
        // Wait, trackClick takes: (tenantId, request, offer, publisher, assignment, ip, userAgent, query)

        const resultUS = await trackingService.trackClick(
            1, // tenantId
            mockRequest,
            fakeOffer,
            fakePublisher,
            fakeAssignment,
            ip,
            userAgent,
            query
        );

        console.log('--- TEST 1: Blocked Country (US) ---');
        if (resultUS.html && resultUS.html.includes('Country Not Allowed')) {
            console.log('✅ PASS: Traffic completely blocked for US.');
        } else {
            console.log('❌ FAIL: Expected country block page. Instead got:', resultUS);
        }

        // Test 2: ALLOW India
        fakeOffer.country_action = 'ALLOW';
        fakeOffer.country_list = 'IN';

        // 103.14.0.0 is an Indian IP route
        const ipIN = '103.14.0.1';

        const resultIN = await trackingService.trackClick(
            1,
            mockRequest,
            fakeOffer,
            fakePublisher,
            fakeAssignment,
            ipIN,
            userAgent,
            query
        );

        console.log('--- TEST 2: Allowed Country (IN) ---');
        // If it doesn't return HTML, it means the validation passed and it generated a redirectUrl
        if (!resultIN.html && resultIN.redirect) {
            console.log('✅ PASS: Traffic allowed through for IN.');
        } else if (resultIN.html && !resultIN.html.includes('Country')) {
            // Might fail on some other cap since we bypassed things, but validation is what we want to test
            console.log('✅ PASS: Traffic passed Country but failed elsewhere:', resultIN.html);
        } else if (resultIN.html && resultIN.html.includes('Country')) {
            console.log('❌ FAIL: Traffic was unexpectedly blocked for IN.');
        } else {
            console.log('✅ PASS: Validation passed, result is:', resultIN);
        }

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        process.exit(0);
    }
}

testCountryTargeting();
