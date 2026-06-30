import trackingController from '../controllers/trackingController.js';

async function trackingRoutes(fastify, options) {
  // Click tracking
  // Click tracking - handle both GET and HEAD
  fastify.route({
    method: ['GET', 'HEAD'],
    url: '/click',
    handler: async (request, reply) => {
      if (request.method === 'HEAD') {
        return reply.code(200).send();
      }
      return trackingController.handleClick(request, reply);
    }
  });

  // Impression tracking
  fastify.get('/imp', trackingController.handleImpression);

  // Diagnostic endpoint to check click processing
  fastify.get('/debug/clicks', async (request, reply) => {
    try {
      const redis = (await import('../config/redis.js')).default;
      const streamLength = await redis.xlen('stream:clicks');
      const groupInfo = await redis.xinfo('GROUPS', 'stream:clicks').catch(() => null);
      
      // Get a sample of recent messages
      const recentMessages = await redis.xrevrange('stream:clicks', '+', '-', 'COUNT', 5).catch(() => []);
      
      // Check if click hash data exists for the most recent click
      let clickHashData = null;
      let latestClickId = null;
      if (recentMessages.length > 0) {
        // Extract click ID from stream message fields
        const fields = recentMessages[0][1];
        const idIndex = fields.indexOf('id');
        if (idIndex !== -1 && idIndex + 1 < fields.length) {
          latestClickId = fields[idIndex + 1];
          clickHashData = await redis.hgetall(`click:${latestClickId}`).catch(() => null);
        }
      }
      
      return {
        success: true,
        stream_length: streamLength,
        group_info: groupInfo,
        recent_messages: recentMessages.map(([id, fields]) => {
          const fieldObj = {};
          for (let i = 0; i < fields.length; i += 2) {
            fieldObj[fields[i]] = fields[i + 1];
          }
          return { id, fields: fieldObj };
        }),
        latest_click_hash_data: clickHashData,
        latest_click_hash_exists: clickHashData && Object.keys(clickHashData).length > 0
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Diagnostic endpoint to check if offer/publisher/tenant exist
  fastify.get('/debug/validate/:offerId/:publisherId', async (request, reply) => {
    try {
      const { offerId, publisherId } = request.params;
      const pool = (await import('../db/connection.js')).default;
      
      // Check if offer exists
      const [offerRows] = await pool.query(
        'SELECT id, name, tenant_id, status FROM offers WHERE id = ?',
        [offerId]
      );
      
      // Check if publisher exists
      const [publisherRows] = await pool.query(
        'SELECT id, company_name, tenant_id, status FROM publishers WHERE id = ?',
        [publisherId]
      );
      
      // Check if tenant exists (if offer or publisher has tenant_id)
      let tenantRows = [];
      const tenantIds = new Set();
      if (offerRows[0]?.tenant_id) tenantIds.add(offerRows[0].tenant_id);
      if (publisherRows[0]?.tenant_id) tenantIds.add(publisherRows[0].tenant_id);
      
      if (tenantIds.size > 0) {
        const [tenantResult] = await pool.query(
          'SELECT id, name FROM tenants WHERE id IN (?)',
          [Array.from(tenantIds)]
        );
        tenantRows = tenantResult;
      }
      
      return {
        success: true,
        offer: offerRows[0] || null,
        publisher: publisherRows[0] || null,
        tenants: tenantRows,
        validation: {
          offer_exists: !!offerRows[0],
          publisher_exists: !!publisherRows[0],
          offer_tenant_exists: offerRows[0]?.tenant_id ? 
            tenantRows.some(t => t.id === offerRows[0].tenant_id) : null,
          publisher_tenant_exists: publisherRows[0]?.tenant_id ? 
            tenantRows.some(t => t.id === publisherRows[0].tenant_id) : null,
          tenants_match: offerRows[0]?.tenant_id && publisherRows[0]?.tenant_id ?
            offerRows[0].tenant_id === publisherRows[0].tenant_id : null
        }
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Diagnostic endpoint to check worker status and recent database clicks
  fastify.get('/debug/worker-status', async (request, reply) => {
    try {
      const redis = (await import('../config/redis.js')).default;
      const clickRepository = (await import('../repositories/clickRepository.js')).default;
      
      // Check Redis stream
      const streamLength = await redis.xlen('stream:clicks').catch(() => 0);
      const groupInfo = await redis.xinfo('GROUPS', 'stream:clicks').catch(() => null);
      
      // Check recent clicks in database
      const dbClicks = await clickRepository.findRecentOrderedByCreatedAt(5);
      
      // Check if worker is processing (check for pending messages)
      let pendingCount = 0;
      if (groupInfo && Array.isArray(groupInfo)) {
        const pendingIndex = groupInfo.indexOf('pending');
        if (pendingIndex !== -1 && pendingIndex + 1 < groupInfo.length) {
          pendingCount = parseInt(groupInfo[pendingIndex + 1]) || 0;
        }
      }
      
      return {
        success: true,
        redis: {
          stream_length: streamLength,
          pending_messages: pendingCount,
          group_info: groupInfo
        },
        database: {
          recent_clicks_count: Array.isArray(dbClicks) ? dbClicks.length : 0,
          recent_clicks: dbClicks || []
        },
        worker_status: pendingCount > 0 ? 'processing' : streamLength > 0 ? 'has_messages' : 'idle'
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });
}

export default trackingRoutes;

