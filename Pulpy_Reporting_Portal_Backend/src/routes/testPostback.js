import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';

async function testPostbackRoutes(fastify, options) {
    // Start a new test session (Singleton per tenant)
    fastify.post('/start', async (request, reply) => {
        try {
            const { affiliate_id, tracking_url } = request.body;
            const tenantId = getTenantIdFromRequest(request);

            if (!tenantId) {
                return reply.code(400).send({ success: false, error: 'Tenant context required' });
            }

            // Key: test_session:tenant:{tenant_id}
            // This ensures only one active test per tenant
            const sessionKey = `test_session:tenant:${tenantId}`;

            const sessionData = {
                tenant_id: tenantId,
                affiliate_id: affiliate_id || '',
                tracking_url: tracking_url || '',
                created_at: new Date().toISOString(),
                status: 'waiting', // waiting -> fired -> expired
                result: ''
            };

            await redis.hset(sessionKey, sessionData);
            await redis.expire(sessionKey, 120); // 2 minutes TTL

            logger.info('Test Postback Session Started', {
                tenant_id: tenantId,
                affiliate_id
            });

            return {
                success: true,
                message: 'Test session started. Waiting for click...',
                expires_in_seconds: 120
            };

        } catch (error) {
            logger.error('Test Postback Start Error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    // Check test status
    fastify.get('/status', async (request, reply) => {
        try {
            const tenantId = getTenantIdFromRequest(request);

            if (!tenantId) {
                return reply.code(400).send({ success: false, error: 'Tenant context required' });
            }

            const sessionKey = `test_session:tenant:${tenantId}`;
            const session = await redis.hgetall(sessionKey);

            if (!session || Object.keys(session).length === 0) {
                // If key is gone, it expired
                return {
                    success: true,
                    status: 'expired',
                    message: 'Test timed out. Click did not reach the tracker.'
                };
            }

            let result = null;
            if (session.result) {
                try {
                    result = JSON.parse(session.result);
                } catch (e) { }
            }

            return {
                success: true,
                status: session.status,
                result,
                created_at: session.created_at
            };

        } catch (error) {
            logger.error('Test Postback Status Error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });
}

export default testPostbackRoutes;
