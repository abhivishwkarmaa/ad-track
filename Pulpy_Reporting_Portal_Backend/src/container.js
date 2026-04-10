/**
 * ============================================================
 * Dependency Injection Container
 * ============================================================
 * Single source of truth for all class instantiation.
 * Wire order: pool → repositories → services (bottom-up).
 *
 * Pattern: Constructor Injection (SOLID – Dependency Inversion)
 * ============================================================
 */

import pool from './db/connection.js';

// ── Repositories ─────────────────────────────────────────────
import { AdvertiserRepository }     from './repositories/advertiserRepository.js';
import { AssignmentRepository }     from './repositories/assignmentRepository.js';
import { CacheRepository }          from './repositories/cacheRepository.js';
import { DashboardRepository }      from './repositories/dashboardRepository.js';
import { OfferParamsRepository }    from './repositories/offerParamsRepository.js';
import { OfferRepository }          from './repositories/offerRepository.js';
import { PostbackRepository }       from './repositories/postbackRepository.js';
import { PublicIdRepository }       from './repositories/publicIdRepository.js';
import { PublisherRepository }      from './repositories/publisherRepository.js';
import { ReportRepository }         from './repositories/reportRepository.js';
import { SubscriptionRepository }   from './repositories/subscriptionRepository.js';
import { TenantMetricsRepository }  from './repositories/tenantMetricsRepository.js';
import { TenantRepository }         from './repositories/tenantRepository.js';
import { TrackingRepository }       from './repositories/trackingRepository.js';

// ── Services ─────────────────────────────────────────────────
import { AdvertiserService }        from './services/advertiser.service.js';
import { AssignmentService }        from './services/assignmentService.js';
import { CacheService }             from './services/cacheService.js';
import { DashboardService }         from './services/dashboardService.js';
import { EmailService }             from './services/emailService.js';
import { OfferParamsService }       from './services/offerParamsService.js';
import { OfferPublicIdService }     from './services/offerPublicIdService.js';
import { OfferService as OfferServiceLegacy } from './services/offerService.js';
import { OfferService }             from './services/offer.service.js';
import { PostbackService }          from './services/postbackService.js';
import { PublisherService }         from './services/publisherService.js';
import { ReportService }            from './services/reportService.js';
import { SubscriptionService }      from './services/subscriptionService.js';
import { TenantMetricsService }     from './services/tenantMetricsService.js';
import { TenantResolutionService }  from './services/tenantResolutionService.js';
import { TrackingService }          from './services/trackingService.js';

// ════════════════════════════════════════════════════════════
// Layer 1 – Repositories  (depend only on pool)
// ════════════════════════════════════════════════════════════
export const advertiserRepository    = new AdvertiserRepository(pool);
export const assignmentRepository    = new AssignmentRepository(pool);
export const cacheRepository         = new CacheRepository(pool);
export const dashboardRepository     = new DashboardRepository(pool);
export const offerParamsRepository   = new OfferParamsRepository(pool);
export const offerRepository         = new OfferRepository(pool);
export const postbackRepository      = new PostbackRepository(pool);
export const publicIdRepository      = new PublicIdRepository(pool);
export const publisherRepository     = new PublisherRepository(pool);
export const reportRepository        = new ReportRepository(pool);
export const subscriptionRepository  = new SubscriptionRepository(pool);
export const tenantMetricsRepository = new TenantMetricsRepository(pool);
export const tenantRepository        = new TenantRepository(pool);
export const trackingRepository      = new TrackingRepository(pool);

// ════════════════════════════════════════════════════════════
// Layer 2a – Leaf services  (no inter-service deps)
// ════════════════════════════════════════════════════════════
export const emailService           = new EmailService();
export const offerParamsService     = new OfferParamsService(offerParamsRepository);
export const offerPublicIdService   = new OfferPublicIdService(publicIdRepository);
export const tenantMetricsService   = new TenantMetricsService(tenantMetricsRepository);
export const tenantResolutionService = new TenantResolutionService(tenantRepository);
export const subscriptionService    = new SubscriptionService(subscriptionRepository, pool);

// ════════════════════════════════════════════════════════════
// Layer 2b – Core domain services
// ════════════════════════════════════════════════════════════
export const advertiserService = new AdvertiserService(advertiserRepository, offerPublicIdService);
export const publisherService  = new PublisherService(publisherRepository, offerPublicIdService);
export const reportService     = new ReportService(reportRepository);

// OfferService (legacy thin wrapper used by some older controllers)
export const offerServiceLegacy = new OfferServiceLegacy(offerRepository);

// OfferService (full-featured, used by new controllers)
export const offerService = new OfferService(
  offerPublicIdService,
  offerParamsService,
  null,           // cacheService – circular dep resolved below
  offerRepository,
  assignmentRepository,
);

// PostbackService
export const postbackService = new PostbackService(postbackRepository);

// ════════════════════════════════════════════════════════════
// Layer 3 – Services that depend on other services
// ════════════════════════════════════════════════════════════

// CacheService depends on offerService, publisherService, assignmentService → forward-declare
// AssignmentService depends on cacheService → circular; resolve post-creation
export const assignmentService = new AssignmentService(
  publisherService,
  offerService,
  offerPublicIdService,
  null,             // cacheService – injected below
  assignmentRepository,
);

export const cacheService = new CacheService(
  offerService,
  publisherService,
  assignmentService,
  cacheRepository,
);

// Resolve circular deps by mutating after construction
offerService.cacheService        = cacheService;
assignmentService.cacheService   = cacheService;

// ════════════════════════════════════════════════════════════
// Layer 4 – Top-level services
// ════════════════════════════════════════════════════════════
export const trackingService = new TrackingService(
  offerService,
  publisherService,
  assignmentService,
  cacheService,
  postbackService,
  trackingRepository,
);

export const dashboardService = new DashboardService(
  offerService,
  publisherService,
  reportService,
  dashboardRepository,
);
