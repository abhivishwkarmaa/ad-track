import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import offerPublicIdService from '../services/offerPublicIdService.js';
import assignmentService from '../services/assignmentService.js';

async function testPostbackRoutes(fastify, options) {
    // Start a new test session (Singleton per tenant + publisher + offer)
    // Logic: Parse public IDs from tracking_url (or body) -> resolve to internal IDs -> save Redis key.
    // When click is hit, trackClick resolves URL offer_id/pub_id to internal IDs and checks same Redis key.
    fastify.post('/start', async (request, reply) => {
        try {
            const { affiliate_id, offer_id, tracking_url } = request.body;
            const tenantId = getTenantIdFromRequest(request);

            if (!tenantId) {
                return reply.code(400).send({ success: false, error: 'Tenant context required' });
            }

            // 🔥 CRITICAL: Derive public offer_id and pub_id from tracking_url so Redis key matches the click
            // When the user opens the tracking URL, the click handler reads offer_id and pub_id from the URL.
            // We must use those same IDs (resolved to internal) for the test session key.
            let publicOfferId = tracking_url ? null : parseInt(offer_id);
            let publicPublisherId = tracking_url ? null : parseInt(affiliate_id);

            if (tracking_url) {
                try {
                    // Support relative URLs (e.g. /click?offer_id=2&pub_id=3) by parsing with a base
                    const url = tracking_url.startsWith('http')
                        ? new URL(tracking_url)
                        : new URL(tracking_url, 'http://localhost');
                    const params = url.searchParams;
                    const fromUrlOffer = params.get('offer_id') || params.get('oid');
                    const fromUrlPub = params.get('pub_id') || params.get('a');
                    if (fromUrlOffer) publicOfferId = parseInt(fromUrlOffer, 10);
                    if (fromUrlPub) publicPublisherId = parseInt(fromUrlPub, 10);
                } catch (e) {
                    logger.warn('Could not parse tracking_url for test session, using body params', { url: tracking_url });
                }
            }

            if (publicOfferId == null || isNaN(publicOfferId)) publicOfferId = parseInt(offer_id, 10);
            if (publicPublisherId == null || isNaN(publicPublisherId)) publicPublisherId = parseInt(affiliate_id, 10);

            if (isNaN(publicOfferId) || isNaN(publicPublisherId)) {
                return reply.code(400).send({
                    success: false,
                    error: 'Valid offer_id and affiliate_id are required (or provide them in the tracking URL as offer_id and pub_id)'
                });
            }

            // 1. Resolve Public Publisher ID -> Internal ID (for Redis key)
            const publisher = await offerPublicIdService.getPublisherByPublicId(publicPublisherId, tenantId);
            if (!publisher) {
                return reply.code(404).send({ success: false, error: 'Publisher not found' });
            }
            const internalPublisherId = publisher.id;

            // 2. Resolve Public Offer ID -> Internal ID (for Redis key)
            const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
            if (!offer) {
                logger.error('❌ Offer not found', { public_offer_id: publicOfferId, tenant_id: tenantId });
                return reply.code(404).send({
                    success: false,
                    error: `Offer with public ID ${publicOfferId} not found`
                });
            }
            const internalOfferId = offer.id;

            logger.info('✅ Test session: Public IDs resolved to internal (Redis key)', {
                public_offer_id: publicOfferId,
                internal_offer_id: internalOfferId,
                public_publisher_id: publicPublisherId,
                internal_publisher_id: internalPublisherId,
                tenant_id: tenantId
            });

            // 3. Require assignment (click path would fail otherwise; fail fast for better UX)
            const assignment = await assignmentService.findByPublisherAndOffer(internalPublisherId, internalOfferId, tenantId);
            if (!assignment) {
                return reply.code(400).send({
                    success: false,
                    error: 'No assignment found for this publisher and offer. Create an assignment first.'
                });
            }
            const publicAssignmentId = assignment.id;

            // 4. Resolve Postback URL
            const postbackUrl = publisher.global_postback_url;
            if (!postbackUrl) {
                return reply.code(400).send({ success: false, error: 'Publisher has no global postback URL configured' });
            }

            // ✅ CRITICAL: Use INTERNAL IDs for Redis key (must match trackClick lookup)
            const key = `test:postback:${tenantId}:${internalPublisherId}:${internalOfferId}`;
            const sessionData = {
                status: 'pending', // pending | click_received | completed | failed
                started_at: Date.now(),
                affiliate_click_id: null,
                postback_url: postbackUrl,
                postback_fired: false,
                postback_response: null,
                completed_at: null,
                public_offer_id: publicOfferId,
                internal_offer_id: internalOfferId,
                public_publisher_id: publicPublisherId,
                internal_publisher_id: internalPublisherId,
                public_assignment_id: publicAssignmentId,
                internal_assignment_id: assignment.internal_id
            };

            // Remove any existing key (overwrite)
            // await redis.del(key); // set replaces anyway

            const sessionTtlSeconds = 300; // 5 minutes to open the tracking URL
            await redis.set(key, JSON.stringify(sessionData), 'EX', sessionTtlSeconds);

            logger.info('Test Postback Session Started [Redis]', {
                tenant_id: tenantId,
                public_publisher_id: publicPublisherId,
                internal_publisher_id: internalPublisherId,
                public_offer_id: publicOfferId,
                internal_offer_id: internalOfferId,
                key
            });

            return reply.send({
                success: true,
                message: 'Test started. Open the tracking URL; we will detect the click and fire the postback.',
                expires_in_seconds: sessionTtlSeconds
            });

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

            const publicOfferId = parseInt(offer_id, 10);
            const publicPublisherId = parseInt(affiliate_id, 10);
            if (isNaN(publicOfferId) || isNaN(publicPublisherId)) {
                return reply.code(400).send({ success: false, error: 'Invalid affiliate_id or offer_id' });
            }

            // Resolve public IDs to internal (same key as /start and click path)
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

            const publisher = await offerPublicIdService.getPublisherByPublicId(publicPublisherId, tenantId);
            if (!publisher) {
                return reply.code(404).send({ success: false, error: 'Publisher not found' });
            }
            const internalPublisherId = publisher.id;

            // ✅ CRITICAL: Use INTERNAL IDs for Redis key lookup
            const key = `test:postback:${tenantId}:${internalPublisherId}:${internalOfferId}`;
            const data = await redis.get(key);

            // Session expired or never existed
            if (!data) {
                return reply.send({
                    success: true,
                    status: 'expired',
                    message: 'Test timed out. No click received.'
                });
            }

            const session = JSON.parse(data);

            // Handle FAILED state
            if (session.status === 'failed') {
                return reply.send({
                    success: false,
                    status: 'failed',
                    message: 'Test failed: No click_id found in URL',
                    error: 'Missing click_id or tid parameter in tracking URL'
                });
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
                return reply.send({
                    success: true,
                    status: 'success',
                    result: {
                        click_id: session.affiliate_click_id,
                        affiliate_click_id: session.affiliate_click_id,
                        public_offer_id: session.public_offer_id,
                        public_publisher_id: session.public_publisher_id,
                        public_assignment_id: session.public_assignment_id,
                        postback_fired: session.postback_fired || false,
                        conversion: {
                            status: 'approved',
                            click_id: session.affiliate_click_id,
                            public_offer_id: session.public_offer_id,
                            public_publisher_id: session.public_publisher_id,
                            public_assignment_id: session.public_assignment_id,
                            postback: session.postback_response || {
                                url: session.postback_url?.replace('{click_id}', session.affiliate_click_id) || 'Unknown',
                                status: 200,
                                response: 'Fired via Redis Isolation'
                            }
                        }
                    },
                    message: 'Test postback fired successfully'
                });
            }

            // Return PENDING or PROCESSING
            return reply.send({
                success: true,
                status: status,
                message: session.status === 'click_received'
                    ? 'Click received, firing postback...'
                    : 'Waiting for click...'
            });

        } catch (error) {
            logger.error('Test Postback Status Error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });
}

export default testPostbackRoutes;
