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
            console.log("scbkjsbcjksbckjsdbkjv==========")
            
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

            // 2. 🔥 CRITICAL FIX: Resolve Public Offer ID to Internal Offer ID
            // The offer_id from the tracking URL is a PUBLIC ID (external-facing)
            // We need to resolve it to the INTERNAL ID (database primary key)
            // This ensures the Redis key matches what trackClick will look up
            const publicOfferId = parseInt(offer_id);
            const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);

            if (!offer) {
                logger.error('❌ Offer not found', {
                    public_offer_id: publicOfferId,
                    tenant_id: tenantId
                });
                return reply.code(404).send({
                    success: false,
                    error: `Offer with public ID ${publicOfferId} not found`
                });
            }

            // ✅ Now we have the INTERNAL offer ID (offer.id)
            const internalOfferId = offer.id;
            console.log(affiliate_id, offer_id, tracking_url, internalOfferId)
            logger.info('✅ Resolved Public Offer ID to Internal ID', {
                public_offer_id: publicOfferId,
                internal_offer_id: internalOfferId,
                tenant_id: tenantId
            });

            // 3. Resolve Postback URL
            const postbackUrl = publisher.global_postback_url;
            if (!postbackUrl) {
                return reply.code(400).send({ success: false, error: 'Publisher has no global postback URL configured' });
            }

            // ✅ CRITICAL: Use INTERNAL offer ID for Redis key
            // This MUST match the key that trackClick will look up
            const key = `test:postback:${tenantId}:${affiliate_id}:${internalOfferId}`;
            console.log(key, "key")
            const sessionData = {
                status: 'pending', // pending | click_received | completed | failed
                started_at: Date.now(),
                affiliate_click_id: null,
                postback_url: postbackUrl,
                postback_fired: false,
                postback_response: null,
                completed_at: null,
                public_offer_id: publicOfferId, // Store for reference
                internal_offer_id: internalOfferId // Store for reference
            };

            // Remove any existing key (overwrite)
            // await redis.del(key); // set replaces anyway

            // Create new session with 900s TTL (2 minutes)
            await redis.set(key, JSON.stringify(sessionData), 'EX', 120);

            logger.info('Test Postback Session Started [Redis]', {
                tenant_id: tenantId,
                affiliate_id,
                public_offer_id: publicOfferId,
                internal_offer_id: internalOfferId,
                key
            });

            return {
                success: true,
                message: 'Test started. Waiting for click...',
                expires_in_seconds: 900
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

            // 🔥 CRITICAL FIX: Resolve Public Offer ID to Internal Offer ID
            // The offer_id from the query is a PUBLIC ID (same as in tracking URL)
            // We need to resolve it to the INTERNAL ID to match the Redis key
            const publicOfferId = parseInt(offer_id);
            const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);

            if (!offer) {
                logger.error('❌ Offer not found for status check', {
                    public_offer_id: publicOfferId,
                    tenant_id: tenantId
                });
                return reply.code(404).send({
                    success: false,
                    error: `Offer with public ID ${publicOfferId} not found`
                });
            }

            const internalOfferId = offer.id;

            logger.debug('✅ Status check: Resolved Public Offer ID to Internal ID', {
                public_offer_id: publicOfferId,
                internal_offer_id: internalOfferId,
                tenant_id: tenantId
            });

            // ✅ CRITICAL: Use INTERNAL offer ID for Redis key lookup
            const key = `test:postback:${tenantId}:${affiliate_id}:${internalOfferId}`;
            const data = await redis.get(key);

            // Session expired or never existed
            if (!data) {
                return {
                    success: true,
                    status: 'expired',
                    message: 'Test timed out. No click received.'
                };
            }

            const session = JSON.parse(data);

            // Handle FAILED state
            if (session.status === 'failed') {
                return {
                    success: false,
                    status: 'failed',
                    message: 'Test failed: No click_id found in URL',
                    error: 'Missing click_id or tid parameter in tracking URL'
                };
            }

            // Map internal Redis status to Frontend Expected Status
            // pending -> pending
            // click_received -> processing
            // completed -> success
            let status = 'pending';
            if (session.status === 'click_received') status = 'processing';
            if (session.status === 'completed') status = 'success';

            // Return SUCCESS with full details
            if (status === 'success') {
                return {
                    success: true,
                    status: 'success',
                    result: {
                        click_id: session.affiliate_click_id,
                        affiliate_click_id: session.affiliate_click_id,
                        postback_fired: session.postback_fired || false,
                        conversion: {
                            status: 'approved',
                            click_id: session.affiliate_click_id,
                            postback: session.postback_response || {
                                url: session.postback_url?.replace('{click_id}', session.affiliate_click_id) || 'Unknown',
                                status: 200,
                                response: 'Fired via Redis Isolation'
                            }
                        }
                    },
                    message: 'Test postback fired successfully'
                };
            }

            // Return PENDING or PROCESSING
            return {
                success: true,
                status: status,
                message: session.status === 'click_received'
                    ? 'Click received, firing postback...'
                    : 'Waiting for click...'
            };

        } catch (error) {
            logger.error('Test Postback Status Error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });
}

export default testPostbackRoutes;
