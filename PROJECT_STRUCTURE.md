# Project Structure

## Root Directory
```
Multi-Pulpy Final/
├── Pulpy_Reporting_Portal_Backend/     # Backend Node.js/Express API
│   ├── src/
│   │   ├── config/                     # Configuration files (Redis, etc.)
│   │   ├── controllers/                # Request handlers
│   │   ├── db/                         # Database connection & migrations
│   │   │   └── migrations/             # SQL migration files
│   │   ├── middleware/                 # Express middleware
│   │   ├── routes/                     # API route definitions
│   │   ├── schemas/                    # Data validation schemas
│   │   ├── services/                   # Business logic services
│   │   ├── tests/                      # Test files
│   │   ├── utils/                      # Utility functions
│   │   ├── validators/                 # Input validators
│   │   ├── workers/                    # Background workers (Redis, stats)
│   │   └── server.js                   # Main server entry point
│   ├── scripts/                        # Utility scripts
│   ├── logs/                          # Application logs
│   ├── docs/                          # Documentation
│   ├── package.json                    # Node.js dependencies
│   ├── docker-compose.yml              # Docker configuration
│   └── Dockerfile                      # Docker image definition
│
├── Pulpy_Reporting_Portal_frontend/    # Frontend React application
│   ├── src/
│   │   ├── components/                 # Reusable React components
│   │   ├── context/                    # React Context providers
│   │   ├── hooks/                      # Custom React hooks
│   │   ├── pages/                      # Page components
│   │   ├── services/                   # API service functions
│   │   ├── utils/                      # Utility functions
│   │   ├── App.jsx                     # Main app component
│   │   └── main.jsx                    # Entry point
│   ├── public/                         # Static assets
│   ├── package.json                    # Frontend dependencies
│   └── vite.config.js                  # Vite build configuration
│
├── nginx-production.conf               # NGINX reverse proxy config
└── README.md                           # Project documentation
```

## Backend Structure (Detailed)

```
Pulpy_Reporting_Portal_Backend/
├── src/
│   ├── config/
│   │   ├── redis.js                    # Redis connection
│   │   └── redisHygiene.js            # Redis cleanup
│   │
│   ├── controllers/
│   │   ├── adminController.js          # Admin operations
│   │   ├── advertiser.controller.js    # Advertiser CRUD
│   │   ├── authController.js           # Authentication
│   │   ├── dashboardController.js      # Dashboard data
│   │   ├── offer.controller.js         # Offer CRUD
│   │   ├── postbackController.js       # Postback handling
│   │   ├── reportController.js        # Reports
│   │   ├── tenantController.js         # Tenant management
│   │   └── trackingController.js       # Click/impression tracking
│   │
│   ├── db/
│   │   ├── connection.js               # MySQL connection pool
│   │   ├── migrate.js                   # Migration runner
│   │   ├── migrations/
│   │   │   ├── schema.sql              # Main schema
│   │   │   ├── 001_add_multi_tenant_support.sql
│   │   │   └── 003_add_unique_click_uuid.sql
│   │   ├── cleanup-duplicates.js       # Duplicate cleanup
│   │   └── validate-constraints.js     # Constraint validation
│   │
│   ├── middleware/
│   │   ├── auth.js                     # JWT authentication
│   │   ├── errorHandler.js             # Error handling
│   │   ├── requestLogger.js            # Request logging
│   │   ├── tenant.js                   # Tenant resolution (subdomain)
│   │   └── validate.js                 # Input validation
│   │
│   ├── routes/
│   │   ├── admin.js                    # Admin routes
│   │   ├── advertiser.routes.js        # Advertiser routes
│   │   ├── auth.js                     # Auth routes
│   │   ├── offer.routes.js             # Offer routes
│   │   ├── postback.js                 # Postback routes
│   │   ├── reports.js                  # Report routes
│   │   ├── tenant.js                   # Tenant routes
│   │   └── tracking.js                 # Tracking routes
│   │
│   ├── services/
│   │   ├── advertiser.service.js       # Advertiser business logic
│   │   ├── assignmentService.js        # Assignment management
│   │   ├── cacheService.js             # Redis caching
│   │   ├── dashboardService.js         # Dashboard calculations
│   │   ├── offer.service.js            # Offer business logic
│   │   ├── postbackService.js          # Postback processing
│   │   ├── publisherService.js         # Publisher management
│   │   ├── reportService.js            # Report generation
│   │   └── trackingService.js          # Click/impression tracking
│   │
│   ├── workers/
│   │   ├── redisWorker.js              # Click processing worker
│   │   ├── statsWorker.js              # Statistics aggregation
│   │   └── redisHygieneWorker.js       # Redis cleanup worker
│   │
│   ├── utils/
│   │   ├── countryLookup.js            # IP geolocation
│   │   ├── deviceParser.js             # User agent parsing
│   │   ├── errorPage.js                # Error page generation
│   │   ├── errorResponse.js            # Error response formatting
│   │   ├── ipExtractor.js              # IP extraction
│   │   ├── ispLookup.js                # ISP lookup
│   │   ├── logger.js                   # Logging utility
│   │   ├── tenantScope.js              # Tenant scoping helpers
│   │   └── urlGenerator.js             # URL generation
│   │
│   └── validators/
│       ├── offerValidator.js           # Offer validation
│       └── trackingValidator.js        # Tracking validation
│
├── scripts/                            # Utility scripts
├── logs/                              # Application logs
└── docs/                              # Documentation
```

## Frontend Structure (Detailed)

```
Pulpy_Reporting_Portal_frontend/
├── src/
│   ├── components/                      # Reusable components
│   │   ├── Layout/                     # Layout components
│   │   └── ReportsExample/            # Report components
│   │
│   ├── context/
│   │   ├── AuthContext.jsx             # Authentication state
│   │   └── ToastContext.jsx           # Toast notifications
│   │
│   ├── pages/
│   │   ├── Dashboard/                  # Dashboard page
│   │   ├── Offer/                     # Offer management
│   │   ├── Assignment/                # Assignment management
│   │   ├── Affiliate/                 # Publisher management
│   │   ├── Advertiser/                # Advertiser management
│   │   ├── Reports/                   # Report pages
│   │   └── Tenant/                    # Tenant management
│   │
│   ├── services/
│   │   └── api.js                     # API service functions
│   │
│   ├── utils/
│   │   └── clipboard.js               # Clipboard utilities
│   │
│   ├── App.jsx                        # Main app component
│   └── main.jsx                       # Entry point
│
└── public/                            # Static assets
```

## Key Configuration Files

- `nginx-production.conf` - NGINX reverse proxy for subdomain routing
- `docker-compose.yml` - Docker services orchestration
- `package.json` (backend) - Node.js dependencies
- `package.json` (frontend) - Frontend dependencies
- `vite.config.js` - Vite build tool configuration
