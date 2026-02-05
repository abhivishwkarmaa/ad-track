import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger, responseLogger } from './middleware/requestLogger.js';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import tenantRoutes from './routes/tenant.js';
import advertiserRoutes from './routes/advertiser.routes.js';
import offerRoutes from './routes/offer.routes.js';
import trackingRoutes from './routes/tracking.js';
import postbackRoutes from './routes/postback.js';
import reportRoutes from './routes/reports.js';
import contactRoutes from './routes/contact.js';
import testPostbackRoutes from './routes/testPostback.js';
import subscriptionRoutes from './routes/subscription.js';
import dashboardRoutes from './routes/dashboard.js';

const fastify = Fastify({
  logger: logger,
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  // ✅ CRITICAL: Enable trust proxy for VPS/NGINX reverse proxy
  // This allows Fastify to trust X-Forwarded-* headers from NGINX
  // Without this, request.hostname will be "backend" (upstream name) instead of actual domain
  trustProxy: true,
});

// Initialize server
async function initializeServer() {
  // Register plugins
  await fastify.register(cors, {
    origin: true, // allow all origins/ports
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-User-Activity'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Allow tracking pixels
  });

  await fastify.register(cookie);

  await fastify.register(rateLimit, {
    max: 5000,
    timeWindow: '1 minute',
    skipOnError: true,
  });

  // ✅ CRITICAL: Configure content type parser to allow empty bodies for DELETE
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    // Allow empty body for DELETE requests
    if (req.method === 'DELETE' && (!body || body.trim() === '')) {
      return done(null, {});
    }
    try {
      const json = JSON.parse(body);
      done(null, json);
    } catch (err) {
      done(err, undefined);
    }
  });

  // Register middleware
  fastify.addHook('onRequest', requestLogger);

  // Tenant resolution middleware (runs before routes)
  // This extracts tenant from subdomain and attaches to request context
  fastify.addHook('onRequest', async (request, reply) => {
    const { resolveTenant } = await import('./middleware/tenant.js');
    await resolveTenant(request, reply);
  });

  // Subscription enforcement (centralized tenant access control)
  fastify.addHook('preHandler', async (request, reply) => {
    const { enforceSubscriptionAccess } = await import('./middleware/subscriptionAccess.js');
    await enforceSubscriptionAccess(request, reply);
  });

  fastify.addHook('onResponse', responseLogger);
  fastify.setErrorHandler(errorHandler);

  // Health check
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(adminRoutes, { prefix: '/api/admin' });
  await fastify.register(tenantRoutes, { prefix: '/api/admin' }); // Tenant management (admin subdomain only)
  await fastify.register(advertiserRoutes);
  await fastify.register(offerRoutes);
  await fastify.register(trackingRoutes);
  await fastify.register(postbackRoutes);
  await fastify.register(reportRoutes, { prefix: '/api/admin/reports' });
  await fastify.register(dashboardRoutes, { prefix: '/api' });
  await fastify.register(testPostbackRoutes, { prefix: '/api/test-postback' });
  await fastify.register(contactRoutes, { prefix: '/api' }); // Contact form endpoint
  await fastify.register(subscriptionRoutes, { prefix: '/api' }); // Subscription management

  // 🔒 SECURE 404 Not Found Handler
  // Must be after routes - returns minimal response, logs full details server-side
  fastify.setNotFoundHandler(async (request, reply) => {
    const timestamp = new Date().toISOString();
    const method = request.method;
    const url = request.url;
    // ✅ CRITICAL: Use X-Forwarded-Host for VPS/NGINX reverse proxy
    const host = request.headers['x-forwarded-host'] ||
      request.headers.host ||
      request.hostname ||
      '';
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'N/A';
    const tenantId = request.tenantId || null;
    const tenantSlug = request.tenant?.slug || null;

    // ✅ Log full diagnostic details server-side (never expose to client)
    logger.warn('404 Not Found - Full Diagnostics', {
      timestamp,
      method,
      url,
      host,
      ip,
      userAgent: userAgent.substring(0, 200),
      tenantId,
      tenantSlug
    });

    // ✅ Determine endpoint type for appropriate response
    const { isTrackingEndpoint, isApiEndpoint } = await import('./utils/secureErrors.js');
    const isTracking = isTrackingEndpoint(url);
    const isApi = isApiEndpoint(url);

    // ✅ Return minimal response based on endpoint type
    if (isTracking) {
      // Tracking endpoints: minimal response only
      return reply.code(404).send({
        success: false
      });
    } else if (isApi) {
      // API endpoints: clean message
      return reply.code(404).send({
        success: false,
        message: 'Not found'
      });
    } else {
      // Unknown endpoints: minimal response
      return reply.code(404).send({
        success: false
      });
    }
  });
}

// Start server
const start = async () => {
  try {
    // Initialize server (register plugins and routes)
    await initializeServer();

    const port = parseInt(process.env.PORT || '5000');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    logger.info(`\n🚀 Server started successfully!`);
    logger.info(`   Listening on ${host}:${port}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);

    // Workers are now managed by separate PM2 processes (click-worker, stats-worker)
    // Only start them here if explicitly requested (e.g. for local dev without PM2)
    if (process.env.START_WORKERS_WITH_API === 'true') {
      logger.info('⚠️ Starting workers inside API process (START_WORKERS_WITH_API=true)');

      // ✅ CRITICAL: Start Redis click worker (processes clicks from stream)
      try {
        const runWorker = (await import('./workers/redisWorker.js')).default;
        // Start worker in background (non-blocking)
        runWorker().catch(err => {
          logger.error('❌ Redis click worker failed:', err);
        });
        logger.info('✅ Redis click worker started');
      } catch (error) {
        logger.error('❌ Failed to start Redis click worker:', error);
      }

      // Start Redis hygiene worker (runs every hour)
      if (process.env.ENABLE_REDIS_HYGIENE !== 'false') {
        try {
          const redisHygieneWorker = (await import('./workers/redisHygieneWorker.js')).default;
          redisHygieneWorker.start(3600000); // 1 hour
          logger.info('✅ Redis hygiene worker started');
        } catch (error) {
          logger.warn('Failed to start Redis hygiene worker:', error);
        }
      }
    } else {
      logger.info('ℹ️ Workers skipped in API process (managed separately)');
    }
  } catch (err) {
    console.error('\n❌ Failed to start server:');
    console.error(err);
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

