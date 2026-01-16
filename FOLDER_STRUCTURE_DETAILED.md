# Detailed Folder Structure

## 📁 Pulpy_Reporting_Portal_Backend

```
Pulpy_Reporting_Portal_Backend/
├── src/                                    # Source code
│   ├── config/                             # Configuration files
│   │   ├── redis.js                        # Redis connection configuration
│   │   └── redisHygiene.js                # Redis cleanup configuration
│   │
│   ├── controllers/                        # Request handlers (business logic)
│   │   ├── adminController.js             # Admin operations
│   │   ├── advertiser.controller.js       # Advertiser CRUD operations
│   │   ├── authController.js              # Authentication (login/register)
│   │   ├── dashboardController.js         # Dashboard data endpoints
│   │   ├── offer.controller.js            # Offer CRUD operations
│   │   ├── postbackController.js          # Postback processing
│   │   ├── reportController.js            # Report generation
│   │   ├── tenantController.js            # Tenant management
│   │   └── trackingController.js          # Click/impression tracking
│   │
│   ├── db/                                 # Database related files
│   │   ├── connection.js                   # MySQL connection pool
│   │   ├── migrate.js                      # Migration runner
│   │   ├── migrate_postback_logs.js       # Postback logs migration
│   │   ├── run-tenant-migration.js        # Tenant migration runner
│   │   ├── validate-constraints.js        # Database constraint validation
│   │   ├── cleanup-duplicates.js          # Duplicate record cleanup
│   │   └── migrations/                     # SQL migration files
│   │       ├── schema.sql                  # Main database schema
│   │       ├── 001_add_multi_tenant_support.sql
│   │       └── 003_add_unique_click_uuid.sql
│   │
│   ├── middleware/                         # Express middleware
│   │   ├── auth.js                         # JWT authentication middleware
│   │   ├── errorHandler.js                # Error handling middleware
│   │   ├── requestLogger.js               # Request logging middleware
│   │   ├── tenant.js                       # Tenant resolution (subdomain-based)
│   │   └── validate.js                     # Input validation middleware
│   │
│   ├── routes/                             # API route definitions
│   │   ├── admin.js                        # Admin routes
│   │   ├── advertiser.routes.js           # Advertiser routes
│   │   ├── auth.js                         # Authentication routes
│   │   ├── offer.routes.js                # Offer routes
│   │   ├── postback.js                     # Postback routes
│   │   ├── reports.js                      # Report routes
│   │   ├── tenant.js                       # Tenant management routes
│   │   └── tracking.js                     # Tracking routes (click/imp)
│   │
│   ├── schemas/                            # Data validation schemas
│   │   ├── advertiser.schema.js           # Advertiser validation schema
│   │   └── offer.schema.js                # Offer validation schema
│   │
│   ├── services/                           # Business logic services
│   │   ├── advertiser.service.js          # Advertiser business logic
│   │   ├── assignmentService.js           # Assignment management
│   │   ├── cacheService.js                # Redis caching service
│   │   ├── dashboardService.js            # Dashboard calculations
│   │   ├── offer.service.js               # Offer business logic
│   │   ├── postbackService.js             # Postback processing
│   │   ├── publisherService.js            # Publisher management
│   │   ├── reportService.js               # Report generation
│   │   └── trackingService.js             # Click/impression tracking
│   │
│   ├── tests/                              # Test files
│   │   └── (test files)
│   │
│   ├── utils/                              # Utility functions
│   │   ├── countryLookup.js               # IP geolocation
│   │   ├── deviceParser.js                # User agent parsing
│   │   ├── errorPage.js                   # Error page generation
│   │   ├── errorResponse.js               # Error response formatting
│   │   ├── ipExtractor.js                 # IP extraction from request
│   │   ├── ispLookup.js                   # ISP lookup
│   │   ├── logger.js                      # Logging utility
│   │   ├── tenantScope.js                 # Tenant scoping helpers
│   │   └── urlGenerator.js                # URL generation utilities
│   │
│   ├── validators/                         # Input validators
│   │   └── (validator files)
│   │
│   ├── workers/                            # Background workers
│   │   ├── redisWorker.js                 # Click processing worker
│   │   ├── statsWorker.js                 # Statistics aggregation worker
│   │   └── redisHygieneWorker.js          # Redis cleanup worker
│   │
│   └── server.js                           # Main server entry point
│
├── scripts/                                # Utility scripts
│   ├── generate-admin-hash.js             # Generate admin password hash
│   ├── test-server.js                     # Server testing script
│   └── verify-imports.js                  # Verify module imports
│
├── docs/                                   # Documentation
│   ├── API_ENDPOINTS.md                   # API documentation
│   ├── ARCHITECTURE_V2.md                 # Architecture documentation
│   ├── MULTI_TENANT_IMPLEMENTATION.md     # Multi-tenant docs
│   └── PRODUCTION_HARDENING.md            # Production security docs
│
├── logs/                                   # Application logs
│   ├── api-server-error.log               # API server errors
│   ├── api-server-out.log                 # API server output
│   ├── click-worker-error.log             # Click worker errors
│   ├── click-worker-out.log               # Click worker output
│   ├── stats-worker-error.log             # Stats worker errors
│   └── stats-worker-out.log               # Stats worker output
│
├── check_duplicate_clicks.js              # Check for duplicate clicks
├── check_dlq.js                           # Check dead letter queue
├── check_redis.js                         # Redis connectivity check
├── check_caps_24.js                       # Cap checking script
├── check_click_24.js                      # Click checking script
├── check_integrity_24.js                  # Data integrity check
├── test-click-tracking.sh                 # Click tracking test script
├── test-url-formats.js                    # URL format testing
├── test_redis_hset.js                     # Redis hash test
├── test_redis_pipeline.js                 # Redis pipeline test
├── verify_redis_entry.js                  # Redis entry verification
├── verify-migration.js                    # Migration verification
├── click-worker.js                        # Click worker entry point
├── stats-worker.js                        # Stats worker entry point
├── docker-compose.yml                     # Docker compose configuration
├── Dockerfile                             # Docker image definition
├── ecosystem.config.cjs                   # PM2 configuration
├── jest.config.js                         # Jest test configuration
├── package.json                           # Node.js dependencies
├── package-lock.json                      # Dependency lock file
├── .gitignore                             # Git ignore rules
│
└── Documentation Files (*.md)
    ├── DUPLICATE_CLICKS_FIX.md
    ├── CLICK_RECORDING_FIX.md
    ├── CLICK_TRACKING_FIX.md
    ├── TENANT_ISOLATION_FIX.md
    ├── APPLY_MIGRATION_NOW.md
    ├── DEPLOYMENT.md
    ├── SETUP.md
    └── (many more...)
```

---

## 📁 Pulpy_Reporting_Portal_frontend

```
Pulpy_Reporting_Portal_frontend/
├── src/                                    # Source code
│   ├── components/                         # Reusable React components
│   │   ├── Layout/                         # Layout components
│   │   │   ├── Layout.jsx                  # Main layout wrapper
│   │   │   └── Sidebar.jsx                 # Sidebar navigation
│   │   ├── ReportsExample/                 # Report components
│   │   └── (other components)
│   │
│   ├── context/                            # React Context providers
│   │   ├── AuthContext.jsx                 # Authentication context
│   │   └── ToastContext.jsx                # Toast notification context
│   │
│   ├── hooks/                              # Custom React hooks
│   │   └── useReports.js                   # Reports custom hook
│   │
│   ├── pages/                              # Page components
│   │   ├── Dashboard/                      # Dashboard page
│   │   │   └── Dashboard.jsx
│   │   ├── Offer/                          # Offer management pages
│   │   │   ├── NewOffer.jsx                # Create new offer
│   │   │   ├── EditOffer.jsx               # Edit existing offer
│   │   │   ├── OfferDetail.jsx             # Offer details view
│   │   │   └── Offer.css                   # Offer styles
│   │   ├── Assignment/                     # Assignment management
│   │   │   ├── NewAssignment.jsx
│   │   │   ├── EditAssignment.jsx
│   │   │   ├── ManageAssignment.jsx
│   │   │   └── Assignment.css
│   │   ├── Affiliate/                      # Publisher/Affiliate pages
│   │   │   ├── NewAffiliate.jsx
│   │   │   ├── EditAffiliate.jsx
│   │   │   ├── ManageAffiliate.jsx
│   │   │   ├── PostbackTest.jsx
│   │   │   └── Affiliate.css
│   │   ├── Advertiser/                     # Advertiser management
│   │   │   ├── NewAdvertiser.jsx
│   │   │   ├── EditAdvertiser.jsx
│   │   │   └── ManageAdvertiser.jsx
│   │   ├── Reports/                        # Report pages
│   │   │   ├── DetailedReports.jsx
│   │   │   └── Reports.css
│   │   ├── Tenant/                         # Tenant management (Super Admin)
│   │   │   ├── NewTenant.jsx
│   │   │   ├── EditTenant.jsx
│   │   │   ├── ManageTenant.jsx
│   │   │   ├── TenantDetail.jsx
│   │   │   └── Tenant.css
│   │   └── LiveLogs/                       # Live logs page
│   │       └── LiveLogs.jsx
│   │
│   ├── services/                           # API service functions
│   │   └── api.js                          # API request helpers
│   │
│   ├── utils/                              # Utility functions
│   │   └── clipboard.js                    # Clipboard utilities
│   │
│   ├── assets/                             # Static assets (images, icons)
│   │   └── (asset files)
│   │
│   ├── App.jsx                             # Main app component
│   ├── App.css                             # App styles
│   ├── main.jsx                            # Entry point
│   └── index.css                           # Global styles
│
├── public/                                 # Public static assets
│   └── vite.svg                            # Vite logo
│
├── index.html                              # HTML entry point
├── vite.config.js                          # Vite build configuration
├── eslint.config.js                        # ESLint configuration
├── package.json                            # Frontend dependencies
├── package-lock.json                       # Dependency lock file
└── .gitignore                              # Git ignore rules
```

---

## 📊 Quick Summary

### Backend Structure:
- **Controllers**: Handle HTTP requests
- **Services**: Business logic
- **Routes**: API endpoint definitions
- **Middleware**: Request processing (auth, tenant, logging)
- **Workers**: Background job processing
- **DB**: Database migrations and connections
- **Utils**: Helper functions

### Frontend Structure:
- **Pages**: Main page components
- **Components**: Reusable UI components
- **Context**: Global state management
- **Services**: API communication
- **Hooks**: Custom React hooks
- **Utils**: Helper functions

---

## 🗂️ File Types Summary

### Backend:
- `.js` - JavaScript source files
- `.sql` - Database migration files
- `.cjs` - CommonJS config files (PM2)
- `.json` - Configuration (package.json, Postman collection)
- `.md` - Documentation files
- `.log` - Application logs

### Frontend:
- `.jsx` - React components
- `.css` - Stylesheets
- `.js` - JavaScript utilities
- `.json` - Configuration files
- `.html` - HTML entry point
- `.svg` - Vector graphics

---

**Last Updated**: Generated from actual project structure
