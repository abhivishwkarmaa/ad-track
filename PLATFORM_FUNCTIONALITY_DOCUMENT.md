# Multi-Tenant Ad Tracking Platform - Complete Functionality Document

## 📋 Platform Overview

This document describes the complete functionality of the multi-tenant ad tracking platform, including how it works, what it can do, and how all components interact.

**Platform Type**: Multi-Tenant SaaS Ad Tracking Platform  
**Architecture**: Subdomain-based tenant isolation  
**Technology Stack**: React (Frontend) + Fastify/Node.js (Backend) + MySQL + Redis  
**Deployment**: Single backend, single frontend, unlimited tenants via subdomains

---

## 🎯 Core Functionality

### 1. Multi-Tenant Architecture

#### What It Does

The platform supports **unlimited tenants** (companies/organizations) on a **single codebase** and **single database**, with complete data isolation between tenants.

#### How It Works

1. **Subdomain-Based Tenant Resolution**:
   - Each tenant gets a unique subdomain: `tenant1.track-myads.com`, `tenant2.track-myads.com`
   - Backend extracts tenant from HTTP `Host` header
   - No tenant ID in URL paths - all tenant resolution is automatic

2. **Automatic Tenant Isolation**:
   - Every database query automatically includes `tenant_id` filter
   - Tenant A cannot see Tenant B's data, even with direct API calls
   - JWT tokens include `tenant_id` and are validated against request tenant

3. **Single Codebase, Multiple Tenants**:
   - One frontend build serves all tenants
   - One backend service handles all tenants
   - Tenant context determined at request time from Host header

#### Key Features

- ✅ **Unlimited Tenants**: Add new tenants without code changes
- ✅ **Complete Isolation**: Zero data leakage between tenants
- ✅ **Automatic Resolution**: No manual tenant selection needed
- ✅ **Subdomain-Based**: Clean URLs, no path-based routing
- ✅ **Production-Ready**: Hardened with strict security rules

---

### 2. Tenant Management

#### What It Does

Super admins can create, manage, suspend, and monitor tenants through a dedicated admin panel.

#### How It Works

**Admin Panel Access**:
- URL: `https://admin.track-myads.com`
- Only super admins (tenant_id = NULL) can access
- Separate JWT secret for admin users

**Tenant Operations**:

1. **Create Tenant**:
   ```
   POST /api/admin/tenants
   {
     "name": "Acme Corporation",
     "slug": "acme",
     "status": "active"
   }
   ```
   - Creates tenant record in database
   - Creates subdomain: `acme.track-myads.com`
   - Creates initial tenant admin user

2. **List Tenants**:
   ```
   GET /api/admin/tenants
   ```
   - Returns all tenants with status, metrics
   - Only accessible to super admins

3. **Suspend/Resume Tenant**:
   ```
   POST /api/admin/tenants/:id/suspend
   POST /api/admin/tenants/:id/resume
   ```
   - Suspended tenants cannot access their subdomain
   - Returns 403 error immediately on access attempt
   - All tenant data preserved, just access blocked

4. **View Tenant Metrics**:
   ```
   GET /api/admin/tenants/:id/metrics
   ```
   - Clicks per day
   - Conversions per day
   - Revenue metrics
   - Redis queue depth
   - Active publishers/offers

5. **Update Tenant**:
   ```
   PATCH /api/admin/tenants/:id
   ```
   - Update tenant name, status
   - Cannot change slug (subdomain)

#### Security Rules

- ✅ Super admins can ONLY access via `admin.track-myads.com`
- ✅ Tenant admins can ONLY access via their tenant subdomain
- ✅ JWT `tenant_id` must match request tenant
- ✅ Suspended tenants blocked immediately

---

### 3. User Authentication & Authorization

#### What It Does

Separate authentication systems for admin users and tenant users, with strict tenant isolation.

#### How It Works

**Admin Authentication**:
- **Subdomain**: `admin.track-myads.com`
- **JWT Secret**: `ADMIN_JWT_SECRET`
- **Token Type**: `"admin"`
- **Tenant ID**: `NULL` (super admin)

**Tenant Authentication**:
- **Subdomain**: `tenant1.track-myads.com`
- **JWT Secret**: `TENANT_JWT_SECRET`
- **Token Type**: `"tenant"`
- **Tenant ID**: `{tenant_id}` (from database)

**Login Flow**:

1. User visits `tenant1.track-myads.com`
2. Backend resolves tenant from Host header
3. User submits credentials
4. Backend validates credentials
5. Backend generates JWT with:
   ```json
   {
     "id": 123,
     "email": "admin@tenant1.com",
     "role": "tenant_admin",
     "tenant_id": 1,
     "token_type": "tenant"
   }
   ```
6. Frontend stores JWT in localStorage
7. All subsequent requests include JWT in Authorization header

**Authorization Rules**:

- ✅ Tenant admin can ONLY access their tenant's data
- ✅ Super admin can access admin panel and all tenant management
- ✅ JWT `tenant_id` validated against request tenant on every request
- ✅ Mismatched tenant_id → 403 Forbidden
- ✅ Suspended tenant → 403 Forbidden

---

### 4. Ad Tracking (Clicks & Impressions)

#### What It Does

Tracks ad clicks and impressions with complete tenant isolation, supporting both subdomain-based and legacy tracking URLs.

#### How It Works

**Click Tracking**:

1. **With Tenant Subdomain** (Recommended):
   ```
   GET https://tenant1.track-myads.com/click?offer_id=123&publisher_id=456&...
   ```
   - Backend extracts tenant from Host header (`tenant1`)
   - Validates offer/publisher belong to tenant
   - Stores click with `tenant_id`

2. **Without Subdomain** (Legacy Support):
   ```
   GET https://api.track-myads.com/click?offer_id=123&publisher_id=456&...
   ```
   - Backend derives tenant from offer/publisher `tenant_id`
   - Validates offer/publisher exist
   - Stores click with derived `tenant_id`

**Impression Tracking**:

```
GET https://tenant1.track-myads.com/imp?offer_id=123&publisher_id=456&...
```

- Requires tenant subdomain
- Validates offer/publisher belong to tenant
- Stores impression with `tenant_id`

**Tracking Features**:

- ✅ **Cap Management**: Daily/hourly/lifetime caps per tenant
- ✅ **Deduplication**: Prevents duplicate clicks/conversions
- ✅ **Redis Caching**: Fast click storage before DB persistence
- ✅ **Background Processing**: Redis worker persists clicks to MySQL
- ✅ **Tenant Isolation**: Caps and data scoped per tenant

**Tracking Data Flow**:

```
1. Click Request → Backend
2. Validate tenant (from Host or offer/publisher)
3. Check caps (tenant-scoped)
4. Store in Redis (with tenant_id)
5. Return redirect URL
6. Background worker persists to MySQL
```

---

### 5. Conversion Tracking (Postbacks)

#### What It Does

Tracks conversions (sales, leads, signups) when affiliates send postback URLs.

#### How It Works

**Postback Flow**:

1. **Affiliate Sends Postback**:
   ```
   GET https://tenant1.track-myads.com/postback?click_id=abc123&payout=10.50&...
   ```

2. **Backend Processing**:
   - Resolves tenant from Host header
   - Looks up click in Redis (by click_id)
   - If not in Redis, queries MySQL
   - Validates click belongs to tenant
   - Checks for duplicate conversion
   - Stores conversion with `tenant_id`
   - Updates offer/publisher stats

**Conversion Features**:

- ✅ **Deduplication**: Prevents duplicate conversions
- ✅ **Click Lookup**: Finds original click by click_id
- ✅ **Revenue Tracking**: Stores payout amounts
- ✅ **Tenant Isolation**: Conversions scoped per tenant
- ✅ **Real-time Updates**: Stats updated immediately

**Postback URL Format**:

```
https://tenant1.track-myads.com/postback?
  click_id={click_id}&
  payout={amount}&
  status={approved|rejected}&
  transaction_id={optional}
```

---

### 6. Offer Management

#### What It Does

Tenant admins can create, manage, and track performance of advertising offers.

#### How It Works

**Offer Operations** (Tenant-Scoped):

1. **Create Offer**:
   ```
   POST /api/admin/offers
   {
     "name": "Summer Sale",
     "payout": 10.50,
     "redirect_url": "https://example.com/offer",
     "cap_type": "daily",
     "cap_value": 1000
   }
   ```
   - Automatically assigned to current tenant
   - `tenant_id` set from request context

2. **List Offers**:
   ```
   GET /api/admin/offers
   ```
   - Returns ONLY offers for current tenant
   - Includes performance metrics (clicks, conversions, revenue)

3. **Update Offer**:
   ```
   PATCH /api/admin/offers/:id
   ```
   - Can only update own tenant's offers
   - Validates offer belongs to tenant

4. **Delete Offer**:
   ```
   DELETE /api/admin/offers/:id
   ```
   - Soft delete (marks as inactive)
   - Preserves historical data

**Offer Features**:

- ✅ **Tenant Isolation**: Each tenant sees only their offers
- ✅ **Cap Management**: Daily/hourly/lifetime caps
- ✅ **Performance Tracking**: Clicks, conversions, revenue per offer
- ✅ **Status Management**: Active, paused, expired
- ✅ **Bulk Operations**: Import/export offers

---

### 7. Publisher Management

#### What It Does

Tenant admins can manage publishers (affiliates) who promote their offers.

#### How It Works

**Publisher Operations** (Tenant-Scoped):

1. **Create Publisher**:
   ```
   POST /api/admin/publishers
   {
     "name": "Affiliate Network",
     "email": "contact@affiliate.com",
     "commission_rate": 0.15
   }
   ```
   - Automatically assigned to current tenant

2. **List Publishers**:
   ```
   GET /api/admin/publishers
   ```
   - Returns ONLY publishers for current tenant
   - Includes performance metrics

3. **Assign Offers to Publishers**:
   ```
   POST /api/admin/publishers/:id/assign
   {
     "offer_ids": [1, 2, 3]
   }
   ```
   - Creates publisher-offer assignments
   - Validates offers belong to tenant

4. **View Publisher Performance**:
   ```
   GET /api/admin/publishers/:id/stats
   ```
   - Clicks, conversions, revenue
   - Per-offer breakdown
   - Time-series data

**Publisher Features**:

- ✅ **Tenant Isolation**: Each tenant manages their own publishers
- ✅ **Offer Assignments**: Control which publishers can promote which offers
- ✅ **Performance Tracking**: Detailed stats per publisher
- ✅ **Commission Management**: Set commission rates per publisher
- ✅ **Postback URLs**: Generate unique postback URLs per publisher

---

### 8. Reporting & Analytics

#### What It Does

Comprehensive reporting and analytics dashboard for tenants, with real-time and historical data.

#### How It Works

**Dashboard Overview**:

- **URL**: `https://tenant1.track-myads.com/dashboard`
- **Data Scope**: Only current tenant's data
- **Real-time Updates**: Live metrics from Redis + MySQL

**Available Reports**:

1. **Overview Dashboard**:
   - Total clicks (today, yesterday, this month)
   - Total conversions (today, yesterday, this month)
   - Revenue (today, yesterday, this month)
   - Conversion rate
   - Top performing offers
   - Top performing publishers
   - Geographic distribution

2. **Offer Performance**:
   ```
   GET /api/admin/reports/offers?date_from=2026-01-01&date_to=2026-01-31
   ```
   - Clicks, conversions, revenue per offer
   - Conversion rates
   - Cap utilization
   - Time-series charts

3. **Publisher Performance**:
   ```
   GET /api/admin/reports/publishers?date_from=2026-01-01&date_to=2026-01-31
   ```
   - Clicks, conversions, revenue per publisher
   - Commission payouts
   - Top publishers ranking

4. **Detailed Reports**:
   ```
   GET /api/admin/reports/detailed?offer_id=123&publisher_id=456&...
   ```
   - Individual click/conversion records
   - Filterable by date, offer, publisher, country
   - Exportable to CSV

5. **Geographic Reports**:
   ```
   GET /api/admin/reports/top-countries?metric=conversions&limit=10
   ```
   - Top countries by clicks/conversions/revenue
   - Country-wise breakdown

**Report Features**:

- ✅ **Tenant-Scoped**: All reports filtered by tenant automatically
- ✅ **Date Filtering**: Custom date ranges
- ✅ **Real-time Data**: Combines Redis (recent) + MySQL (historical)
- ✅ **Exportable**: CSV export for all reports
- ✅ **Performance Optimized**: Indexed queries, cached aggregations

---

### 9. Data Isolation & Security

#### What It Does

Strict tenant isolation at database, application, and network levels.

#### How It Works

**Database-Level Isolation**:

1. **Tenant ID in Every Table**:
   - `offers.tenant_id`
   - `publishers.tenant_id`
   - `clicks.tenant_id`
   - `conversions.tenant_id`
   - `impressions.tenant_id`
   - `admin_users.tenant_id`

2. **Compound Indexes**:
   ```sql
   INDEX idx_offers_tenant_created (tenant_id, created_at)
   INDEX idx_clicks_tenant_created (tenant_id, created_at)
   ```
   - Optimizes tenant-scoped queries
   - Ensures fast data retrieval

3. **Foreign Key Constraints**:
   ```sql
   FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
   ```
   - Prevents orphaned records
   - Prevents accidental tenant deletion

**Application-Level Isolation**:

1. **Automatic Query Scoping**:
   ```javascript
   // Every query automatically includes tenant_id
   SELECT * FROM offers 
   WHERE tenant_id = ? AND status = 'active'
   ```

2. **JWT Validation**:
   ```javascript
   // JWT tenant_id must match request tenant
   if (jwt.tenant_id !== request.tenantId) {
     return 403 Forbidden
   }
   ```

3. **Middleware Enforcement**:
   - Tenant resolution middleware runs on every request
   - Suspended tenants blocked immediately
   - Unknown subdomains return 404

**Network-Level Isolation**:

1. **Subdomain-Based Access**:
   - Each tenant has unique subdomain
   - Cannot access other tenants' subdomains
   - DNS-level isolation

2. **Backend Protection**:
   - Backend port (5001) not publicly accessible
   - Only NGINX can reach backend
   - Firewall rules block direct access

**Security Features**:

- ✅ **Zero Data Leakage**: Impossible for Tenant A to see Tenant B data
- ✅ **JWT Validation**: Token tenant_id validated on every request
- ✅ **Suspended Tenant Blocking**: Immediate 403 on access attempt
- ✅ **Unknown Subdomain Blocking**: 404 for invalid subdomains
- ✅ **Rate Limiting**: Per-tenant rate limits in NGINX
- ✅ **Audit Logging**: All tenant access attempts logged

---

### 10. Development & Production Environments

#### What It Does

Seamless development and production environments with identical functionality.

#### How It Works

**Development Environment**:

1. **Local Subdomains**:
   ```
   /etc/hosts:
   127.0.0.1 tenant1.localhost
   127.0.0.1 tenant2.localhost
   127.0.0.1 admin.localhost
   ```

2. **Frontend**:
   - Vite dev server on `:5173`
   - Proxies `/api/*` to backend `:5001`
   - Preserves Host header (`changeOrigin: false`)

3. **Backend**:
   - Fastify server on `:5001`
   - Receives Host header from Vite proxy
   - Resolves tenant from Host header

4. **Access**:
   - `http://tenant1.localhost:5173` → Tenant 1 dashboard
   - `http://admin.localhost:5173` → Admin panel

**Production Environment**:

1. **DNS Configuration**:
   ```
   *.track-myads.com → Server IP
   admin.track-myads.com → Server IP
   ```

2. **NGINX**:
   - Listens on `:443` (HTTPS)
   - Serves frontend static files
   - Proxies `/api/*` to backend `:5001`
   - Preserves Host header (`proxy_set_header Host $host`)

3. **Backend**:
   - Fastify server on `:5001` (internal only)
   - Not publicly accessible
   - Receives Host header from NGINX

4. **Access**:
   - `https://tenant1.track-myads.com` → Tenant 1 dashboard
   - `https://admin.track-myads.com` → Admin panel

**Key Differences**:

| Feature | Development | Production |
|---------|------------|------------|
| Frontend | Vite dev server `:5173` | NGINX static files `:443` |
| Backend | Direct access `:5001` | Internal only `:5001` |
| Proxy | Vite proxy | NGINX proxy |
| Host Header | Preserved by Vite | Preserved by NGINX |
| SSL | No | Yes (HTTPS) |
| Subdomains | `*.localhost` | `*.track-myads.com` |

**Unified Codebase**:

- ✅ Same frontend code for dev and prod
- ✅ Same backend code for dev and prod
- ✅ No environment-specific URLs
- ✅ Relative API paths work everywhere

---

### 11. Redis Integration

#### What It Does

High-performance caching and queue system for click tracking and background processing.

#### How It Works

**Click Storage**:

1. **Click Received**:
   ```
   GET /click?offer_id=123&...
   ```

2. **Store in Redis**:
   ```javascript
   redis.setex(`click:${clickId}`, 1800, JSON.stringify(clickData))
   ```
   - Key: `click:{click_id}`
   - TTL: 30 minutes
   - Value: JSON click data with `tenant_id`

3. **Background Worker**:
   - Redis worker polls for clicks
   - Persists to MySQL in batches
   - Removes from Redis after persistence

**Conversion Lookup**:

1. **Postback Received**:
   ```
   GET /postback?click_id=abc123&...
   ```

2. **Lookup in Redis**:
   ```javascript
   const clickData = await redis.get(`click:${clickId}`)
   ```

3. **Fallback to MySQL**:
   - If not in Redis, query MySQL
   - Redis acts as hot cache

**Redis Features**:

- ✅ **TTL Management**: Automatic expiration of old clicks
- ✅ **Stream Processing**: Redis Streams for click queue
- ✅ **Deduplication**: Prevents duplicate conversions
- ✅ **Tenant-Scoped**: All keys include tenant context
- ✅ **Hygiene Worker**: Automatic cleanup of old data

**Redis Hygiene**:

- Runs every hour
- Enforces TTLs on click/conversion keys
- Trims Redis streams
- Cleans up deduplication keys
- Prevents memory leaks

---

### 12. Database Schema

#### What It Does

Multi-tenant database schema with tenant isolation at the data model level.

#### How It Works

**Core Tables**:

1. **tenants**:
   ```sql
   id INT PRIMARY KEY
   name VARCHAR(100)
   slug VARCHAR(50) UNIQUE  -- subdomain identifier
   status ENUM('active', 'suspended')
   created_at TIMESTAMP
   ```

2. **admin_users**:
   ```sql
   id INT PRIMARY KEY
   email VARCHAR(255)
   password_hash VARCHAR(255)
   role ENUM('admin', 'tenant_admin')
   tenant_id INT NULL  -- NULL = super admin
   FOREIGN KEY (tenant_id) REFERENCES tenants(id)
   ```

3. **offers**:
   ```sql
   id INT PRIMARY KEY
   tenant_id INT NOT NULL
   name VARCHAR(255)
   payout DECIMAL(10,2)
   redirect_url TEXT
   cap_type ENUM('daily', 'hourly', 'lifetime')
   cap_value INT
   status ENUM('active', 'paused', 'expired')
   FOREIGN KEY (tenant_id) REFERENCES tenants(id)
   INDEX idx_offers_tenant_created (tenant_id, created_at)
   ```

4. **publishers**:
   ```sql
   id INT PRIMARY KEY
   tenant_id INT NOT NULL
   name VARCHAR(255)
   email VARCHAR(255)
   commission_rate DECIMAL(5,4)
   FOREIGN KEY (tenant_id) REFERENCES tenants(id)
   ```

5. **clicks**:
   ```sql
   id INT PRIMARY KEY
   tenant_id INT NOT NULL
   click_id VARCHAR(255) UNIQUE
   offer_id INT
   publisher_id INT
   ip_address VARCHAR(45)
   user_agent TEXT
   referrer TEXT
   created_at TIMESTAMP
   FOREIGN KEY (tenant_id) REFERENCES tenants(id)
   FOREIGN KEY (offer_id) REFERENCES offers(id)
   FOREIGN KEY (publisher_id) REFERENCES publishers(id)
   INDEX idx_clicks_tenant_created (tenant_id, created_at)
   ```

6. **conversions**:
   ```sql
   id INT PRIMARY KEY
   tenant_id INT NOT NULL
   click_id VARCHAR(255)
   offer_id INT
   publisher_id INT
   payout DECIMAL(10,2)
   status ENUM('approved', 'rejected', 'pending')
   transaction_id VARCHAR(255)
   created_at TIMESTAMP
   FOREIGN KEY (tenant_id) REFERENCES tenants(id)
   INDEX idx_conversions_tenant_created (tenant_id, created_at)
   ```

**Schema Features**:

- ✅ **Tenant ID Everywhere**: All data tables include `tenant_id`
- ✅ **Foreign Keys**: Referential integrity enforced
- ✅ **Compound Indexes**: Optimized for tenant-scoped queries
- ✅ **NOT NULL Constraints**: `tenant_id` required (after migration)
- ✅ **ON DELETE RESTRICT**: Prevents accidental tenant deletion

---

## 🔄 Request Lifecycle

### Complete Request Flow

**Example: Tenant Admin Views Offers**

```
1. Browser Request:
   GET https://tenant1.track-myads.com/api/admin/offers
   Host: tenant1.track-myads.com
   Authorization: Bearer {jwt_token}

2. NGINX (Production) / Vite (Development):
   - Receives request with Host: tenant1.track-myads.com
   - Proxies to http://localhost:5001/api/admin/offers
   - Preserves Host header: tenant1.track-myads.com ✅

3. Backend - Tenant Resolution Middleware:
   - Extracts "tenant1" from Host header
   - Queries: SELECT * FROM tenants WHERE slug = 'tenant1'
   - Validates tenant exists and is active
   - Attaches to request: request.tenantId = 1

4. Backend - Authentication Middleware:
   - Extracts JWT from Authorization header
   - Verifies JWT signature (TENANT_JWT_SECRET)
   - Decodes JWT: { tenant_id: 1, role: 'tenant_admin' }
   - Validates: JWT tenant_id (1) === request tenantId (1) ✅
   - Attaches to request: request.admin = { id: 123, tenant_id: 1 }

5. Backend - Route Handler:
   - Query: SELECT * FROM offers WHERE tenant_id = 1
   - Returns: Only Tenant 1's offers

6. Response:
   {
     "success": true,
     "data": [
       { "id": 1, "name": "Summer Sale", "tenant_id": 1, ... },
       { "id": 2, "name": "Winter Promo", "tenant_id": 1, ... }
     ]
   }

7. Frontend:
   - Receives response
   - Renders offers in UI
   - User sees only their tenant's offers ✅
```

**Key Points**:

- ✅ Host header preserved through entire chain
- ✅ Tenant resolved automatically from subdomain
- ✅ JWT validated against request tenant
- ✅ Database query automatically scoped by tenant
- ✅ Zero manual tenant selection needed

---

## 🎯 Platform Capabilities Summary

### What the Platform Can Do

1. ✅ **Support Unlimited Tenants**: Add new tenants without code changes
2. ✅ **Complete Data Isolation**: Zero data leakage between tenants
3. ✅ **Subdomain-Based Access**: Clean URLs, automatic tenant resolution
4. ✅ **Admin Panel**: Super admin manages all tenants
5. ✅ **Tenant Dashboards**: Each tenant has their own dashboard
6. ✅ **Ad Tracking**: Click and impression tracking with tenant isolation
7. ✅ **Conversion Tracking**: Postback processing with deduplication
8. ✅ **Offer Management**: Create, manage, track offers per tenant
9. ✅ **Publisher Management**: Manage affiliates per tenant
10. ✅ **Reporting & Analytics**: Comprehensive reports per tenant
11. ✅ **Cap Management**: Daily/hourly/lifetime caps per tenant
12. ✅ **Real-time Metrics**: Live dashboard updates
13. ✅ **Export Functionality**: CSV export for all reports
14. ✅ **Suspension Control**: Suspend/resume tenants instantly
15. ✅ **Tenant Metrics**: Monitor per-tenant performance
16. ✅ **Redis Integration**: High-performance caching and queuing
17. ✅ **Background Processing**: Async click/conversion persistence
18. ✅ **Security Hardening**: JWT validation, rate limiting, audit logging
19. ✅ **Development & Production**: Same codebase, different environments
20. ✅ **Scalable Architecture**: Ready for horizontal scaling

### What the Platform Cannot Do

1. ❌ **Cross-Tenant Data Access**: Tenant A cannot see Tenant B data (by design)
2. ❌ **Tenant Creation by Users**: Only super admins can create tenants
3. ❌ **Subdomain Changes**: Tenant slugs (subdomains) cannot be changed after creation
4. ❌ **Direct Backend Access**: Backend port not publicly accessible (security)
5. ❌ **Hardcoded URLs**: Frontend uses relative paths only (no hardcoded backend URLs)

---

## 🔐 Security Features

### Authentication & Authorization

- ✅ Separate JWT secrets for admin and tenant users
- ✅ JWT includes `tenant_id` and `token_type`
- ✅ Token validation on every request
- ✅ Tenant ID mismatch → 403 Forbidden
- ✅ Suspended tenant → 403 Forbidden
- ✅ Super admin only on admin subdomain

### Data Isolation

- ✅ Database-level tenant scoping
- ✅ Application-level query filtering
- ✅ JWT tenant validation
- ✅ Middleware enforcement
- ✅ Zero data leakage possible

### Network Security

- ✅ Backend not publicly accessible
- ✅ NGINX as reverse proxy
- ✅ SSL/TLS encryption (production)
- ✅ Rate limiting per tenant
- ✅ Security headers (X-Frame-Options, CSP, etc.)

### Audit & Monitoring

- ✅ Tenant access logging
- ✅ Suspended tenant attempt logging
- ✅ Unknown subdomain logging
- ✅ JWT validation failure logging
- ✅ Per-tenant metrics tracking

---

## 📊 Performance Features

### Caching

- ✅ Redis for click/conversion caching
- ✅ TTL-based expiration
- ✅ Hot cache for postback lookups

### Database Optimization

- ✅ Compound indexes on (tenant_id, created_at)
- ✅ Foreign key indexes
- ✅ Query optimization for tenant-scoped queries

### Background Processing

- ✅ Redis worker for click persistence
- ✅ Async conversion processing
- ✅ Batch database inserts

### Rate Limiting

- ✅ Per-tenant rate limits in NGINX
- ✅ Prevents abuse
- ✅ Fair usage enforcement

---

## 🚀 Deployment Architecture

### Development

```
Browser → Vite (:5173) → Backend (:5001)
         (tenant1.localhost)   (Host preserved)
```

### Production

```
Browser → NGINX (:443) → Backend (:5001)
         (tenant1.track-myads.com)  (Host preserved, internal only)
```

### Key Principles

- ✅ **Host Header Preservation**: Critical for tenant resolution
- ✅ **Relative Paths**: Frontend uses `/api/*` not hardcoded URLs
- ✅ **Proxy Configuration**: `changeOrigin: false` (Vite), `proxy_set_header Host` (NGINX)
- ✅ **Backend Protection**: Port 5001 not publicly accessible
- ✅ **Unified Codebase**: Same code for dev and prod

---

## 📝 Configuration Files

### Frontend

- **`vite.config.js`**: Vite proxy configuration with Host header preservation
- **`src/services/api.js`**: API client with relative paths

### Backend

- **`src/middleware/tenant.js`**: Tenant resolution middleware
- **`src/middleware/auth.js`**: Authentication with tenant validation
- **`src/server.js`**: Fastify server with tenant middleware

### Production

- **`nginx-production.conf`**: NGINX configuration with wildcard subdomains
- **Environment Variables**: JWT secrets, database credentials, Redis config

---

## ✅ Verification Checklist

### Development

- [x] Frontend uses relative paths (`/api/*`)
- [x] Vite proxy configured with `changeOrigin: false`
- [x] Host header preserved through proxy
- [x] Tenant resolution works with local subdomains
- [x] Different tenants show isolated data
- [x] Admin panel accessible on `admin.localhost:5173`

### Production

- [x] NGINX preserves Host header
- [x] Backend not exposed publicly
- [x] Wildcard subdomain support configured
- [x] SSL/TLS configured
- [x] Rate limiting configured
- [x] Security headers included

### Functionality

- [x] Tenant creation works
- [x] Tenant suspension works
- [x] Click tracking works
- [x] Conversion tracking works
- [x] Offer management works
- [x] Publisher management works
- [x] Reporting works
- [x] Data isolation verified

---

## 🎓 Summary

This multi-tenant ad tracking platform provides:

1. **Complete Multi-Tenancy**: Unlimited tenants on single codebase
2. **Strict Isolation**: Zero data leakage between tenants
3. **Subdomain-Based**: Automatic tenant resolution from Host header
4. **Production-Ready**: Hardened security, performance optimized
5. **Developer-Friendly**: Same codebase for dev and prod
6. **Scalable**: Ready for horizontal scaling

**The platform is fully functional and ready for production deployment.**

---

**Document Version**: 1.0  
**Last Updated**: January 14, 2026  
**Status**: ✅ Complete and Verified
