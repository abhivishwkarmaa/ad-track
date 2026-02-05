
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import redis from './src/config/redis.js';

const TENANT_SECRET = 'tenant-secret-key-change-in-production';
const USER_ID = 5;
const TENANT_ID = 4;
const HOST = 'abhinav.localhost';
const PORT = 5001;

async function verifyDashboard() {
    const refreshToken = uuidv4();
    const sessionKey = `auth:session:${refreshToken}`;

    // 1. Set Session in Redis
    await redis.set(sessionKey, JSON.stringify({
        user_id: USER_ID,
        role: 'tenant_admin',
        tenant_id: TENANT_ID,
        last_activity: Date.now()
    }), 'EX', 3600);

    console.log('✅ Session set in Redis');

    // 2. Sign Token
    const token = jwt.sign(
        { id: USER_ID, email: 'abhivishwkarmaa52@gmail.com', role: 'tenant_admin' },
        TENANT_SECRET,
        { expiresIn: '1h' }
    );
    console.log('✅ Token signed');

    // 3. Make Request
    try {
        console.log('🚀 Sending request to /api/admin/reports/dashboard...');
        const response = await axios.get(`http://localhost:${PORT}/api/admin/reports/dashboard`, {
            params: {
                date_from: '2026-02-05',
                date_to: '2026-02-05',
                group_by: 'hour',
                limit: 10
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cookie': `refresh_token=${refreshToken}`,
                'Host': HOST // Simulate subdomain
            }
        });

        console.log('✅ Response Status:', response.status);
        console.log('✅ Data Keys:', Object.keys(response.data.data));
        console.log('✅ SUCCESS! Aggregated dashboard works.');

    } catch (error) {
        console.error('❌ Request Failed:', error.response ? error.response.data : error.message);
    } finally {
        // Cleanup
        await redis.del(sessionKey);
        redis.disconnect(); // Close redis connection to allow script to exit
    }
}

verifyDashboard();
