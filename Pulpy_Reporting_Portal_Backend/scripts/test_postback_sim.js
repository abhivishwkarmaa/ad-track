import pool from '../src/db/connection.js';
import adminController from '../src/controllers/adminController.js';
import publisherService from '../src/services/publisherService.js';

// Mock Reply Object
const mockReply = {
    code: function (statusCode) {
        this.statusCode = statusCode;
        return this;
    },
    send: function (data) {
        console.log('\n--- RESPONSE START ---');
        console.log('Status Code:', this.statusCode || 200);
        console.log(JSON.stringify(data, null, 2));
        console.log('--- RESPONSE END ---\n');
        return this;
    },
    header: function () { return this; }
};

// Mock Request Object
const mockRequest = {
    body: {},
    tenantId: null,
    headers: { host: 'localhost' },
    ip: '127.0.0.1'
};

async function runTest() {
    console.log('Starting Postback Simulation Test...');
    let publisherId = null;
    let originalUrl = null;

    try {
        // 1. Get Tenant
        const [tenants] = await pool.query('SELECT * FROM tenants WHERE status = "active" LIMIT 1');
        if (tenants.length === 0) {
            console.error('No active tenants found.');
            process.exit(1);
        }
        const tenant = tenants[0];
        mockRequest.tenantId = tenant.id;
        console.log(`Using Tenant: ${tenant.name} (${tenant.id})`);

        // 2. Get Publisher
        // Find one, or create one if none exist
        const [publishers] = await pool.query('SELECT * FROM publishers WHERE tenant_id = ? LIMIT 1', [tenant.id]);

        if (publishers.length === 0) {
            // Create dummy publisher
            console.log('No publishers found, skipping test (or implement create logic)');
            process.exit(0);
        }

        const publisher = publishers[0];
        publisherId = publisher.id;
        originalUrl = publisher.global_postback_url;
        console.log(`Using Publisher: ${publisher.company_name} (${publisher.id})`);

        // 3. Set Test URL
        const testUrl = 'https://httpbin.org/get?click_id={click_id}&status={status}&txid={txid}';
        await pool.query('UPDATE publishers SET global_postback_url = ? WHERE id = ?', [testUrl, publisherId]);
        console.log(`Set temporary Postback URL: ${testUrl}`);

        // 4. Test 1: Dry Run
        console.log('\nTest 1: Dry Run');
        mockRequest.body = {
            publisher_id: publisherId,
            affiliate_click_id: 'test_click_123',
            status: 'approved',
            payout: 10.50,
            txid: 'tx_999',
            method: 'GET',
            dry_run: true
        };
        await adminController.testAffiliatePostback(mockRequest, mockReply);

        // 5. Test 2: Real Fire (GET)
        console.log('\nTest 2: Real Fire (GET)');
        mockRequest.body.dry_run = false;
        await adminController.testAffiliatePostback(mockRequest, mockReply);

        // 6. Test 3: POST Method
        console.log('\nTest 3: POST Method');
        mockRequest.body.method = 'POST';
        await pool.query('UPDATE publishers SET global_postback_url = ? WHERE id = ?', ['https://httpbin.org/post?cid={click_id}', publisherId]);
        await adminController.testAffiliatePostback(mockRequest, mockReply);

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        // 7. Cleanup
        if (publisherId !== null) {
            console.log('Restoring original Postback URL...');
            await pool.query('UPDATE publishers SET global_postback_url = ? WHERE id = ?', [originalUrl, publisherId]);
        }
        await pool.end(); // Close DB connection
    }
}

runTest();
