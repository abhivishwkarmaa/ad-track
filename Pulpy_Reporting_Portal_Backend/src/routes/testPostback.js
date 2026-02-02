import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import publisherService from '../services/publisherService.js';
import offerService from '../services/offer.service.js';
import offerPublicIdService from '../services/offerPublicIdService.js';

async function testPostbackRoutes(fastify, options) {
    // Start a new test session (Singleton per tenant + publisher + offer)
    fastify.post('/start', async (request, reply) => {
        try {
            const { affiliate_id, offer_id, tracking_url } = request.body;
            const tenantId = getTenantIdFromRequest(request);

            if (!tenantId) {
                return reply.code(400).send({ success: false, error: 'Tenant context required' });
            }

            if (!affiliate_id || !offer_id) {
                return reply.code(400).send({ success: false, error: 'Affiliate ID and Offer ID are required' });
            }

            // 1. Verify Publisher
            const publisher = await publisherService.findById(affiliate_id, tenantId);
            if (!publisher) {
                return reply.code(404).send({ success: false, error: 'Publisher not found' });
            }

            // 2. Verify Offer (Optional but good for validation)
            // We use public ID in URL but internal ID here, mostly fine.
            const offer = await offerService.getOfferById(offer_id, tenantId);
            if (!offer) {
                return reply.code(404).send({ success: false, error: 'Offer not found' });
            }

            // 3. Resolve Postback URL
            const postbackUrl = publisher.global_postback_url;
            if (!postbackUrl) {
                return reply.code(400).send({ success: false, error: 'Publisher has no global postback URL configured' });
            }

            // ✅ Key Pattern: test:postback:{tenant_id}:{publisher_id}:{offer_id}
            const key = `test:postback:${tenantId}:${affiliate_id}:${offer_id}`;

            const sessionData = {
                status: 'pending',
                started_at: Date.now(),
                affiliate_click_id: null,
                postback_url: postbackUrl,
                postback_fired: false
            };

            // Remove any existing key (overwrite)
            // await redis.del(key); // set replaces anyway

            // Create new session with 120s TTL
            await redis.set(key, JSON.stringify(sessionData), 'EX', 120);

            logger.info('Test Postback Session Started [Redis]', {
                tenant_id: tenantId,
                affiliate_id,
                offer_id,
                key
            });

            return {
                success: true,
                message: 'Test started. Waiting for click...',
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
            const { affiliate_id, offer_id } = request.query;

            if (!tenantId) {
                return reply.code(400).send({ success: false, error: 'Tenant context required' });
            }

            if (!affiliate_id || !offer_id) {
                return reply.code(400).send({ success: false, error: 'Affiliate ID and Offer ID required for status check' });
            }

            const key = `test:postback:${tenantId}:${affiliate_id}:${offer_id}`;
            const data = await redis.get(key);

            if (!data) {
                return {
                    success: true,
                    status: 'expired',
                    message: 'Test timed out. No click received.'
                };
            }

            const session = JSON.parse(data);

            // Map internal Redis status to Frontend Expected Status
            // pending -> pending
            // click_received -> processing
            // completed -> success

            let status = 'pending';
            if (session.status === 'click_received') status = 'processing';
            if (session.status === 'completed') status = 'success';

            if (status === 'success') {
                return {
                    success: true,
                    status: 'success',
                    result: {
                        click_id: session.affiliate_click_id,
                        affiliate_click_id: session.affiliate_click_id,
                        postback_fired: true,
                        conversion: {
                            status: 'approved',
                            click_id: session.affiliate_click_id,
                            postback: {
                                url: session.postback_url?.replace('{click_id}', session.affiliate_click_id) || 'Unknown',
                                status: 200,
                                response: 'Fired via Redis Isolation'
                            }
                        }
                    },
                    message: 'Test postback fired successfully'
                };
            }

            return {
                success: true,
                status: status,
                message: session.status === 'click_received' ? 'Click received, firing postback...' : 'Waiting for click...'
            };

        } catch (error) {
            logger.error('Test Postback Status Error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });
}

export default testPostbackRoutes;
