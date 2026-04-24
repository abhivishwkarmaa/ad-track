# Multi-Tenant Production Hardening Guide

## Overview
This document outlines the production hardening steps for the multi-tenant ad tracking platform.

---

## 🔒 1. Strict Tenant Isolation Enforcement

### Implementation Status: ✅ COMPLETE

### Changes Made:

#### A. Authentication Middleware (`src/middleware/auth.js`)
- **Rule 1**: Super admins (tenant_id = NULL) can ONLY access via admin subdomain
- **Rule 2**: JWT tenant_id MUST match request tenant_id (strict enforcement)
- **Rule 3**: Suspended tenants are immediately rejected
- **Rule 4**: Separate JWT secrets for admin vs tenant tokens

#### B. Tenant Middleware (`src/middleware/tenant.js`)
- Rejects unknown tenant subdomains immediately
- Validates tenant status before allowing access
- Enhanced logging for security events

### Security Features:
```javascript
// Super admin restriction
if (!tenantId && !request.isAdminSubdomain) {
  return reply.code(403).send({
    error: 'Super admin access is only allowed via admin subdomain'
  });
}

// Strict tenant matching
if (requestTenantId && requestTenantId !== tenantId) {
  return reply.code(403).send({
    error: 'JWT tenant_id does not match request tenant'
  });
}

// Suspended tenant rejection
if (request.tenant.status !== 'active') {
  return reply.code(403).send({
    error: 'Tenant is currently suspended'
  });
}
```

---

## 🧱 2. Database-Level Safety

### Implementation Status: ✅ MIGRATION CREATED

### Migration File: `002_harden_multi_tenant_production.sql`

### Changes:

#### A. Compound Indexes
- `(tenant_id, offer_id)` - Fast tenant-scoped offer queries
- `(tenant_id, publisher_id)` - Fast tenant-scoped publisher queries
- `(tenant_id, created_at)` - Fast time-range queries per tenant
- Applied to: offers, publishers, clicks, conversions, impressions, publisher_offers, daily_offer_stats, affiliate_postback_logs

#### B. Foreign Key Constraints
- All `tenant_id` columns have FK to `tenants.id`
- Consider `ON DELETE RESTRICT` to prevent accidental tenant deletion
- Note: Requires dropping and recreating constraints (do carefully in production)

#### C. NOT NULL Migration (Optional)
- Migration includes commented-out ALTER statements
- Run after ensuring all existing data has tenant_id
- Creates default tenant for existing data if needed

### Indexes Created:
```sql
-- Example indexes
CREATE INDEX idx_clicks_tenant_offer ON clicks(tenant_id, offer_id);
CREATE INDEX idx_conversions_tenant_created ON conversions(tenant_id, created_at);
CREATE INDEX idx_offers_tenant_status ON offers(tenant_id, status);
```

### View Created:
```sql
CREATE VIEW tenant_stats AS
SELECT 
  t.id, t.name, t.slug, t.status,
  COUNT(DISTINCT o.id) as total_offers,
  COUNT(DISTINCT p.id) as total_publishers,
  COUNT(DISTINCT c.id) as total_clicks,
  COUNT(DISTINCT conv.id) as total_conversions,
  COALESCE(SUM(conv.amount), 0) as total_revenue
FROM tenants t
LEFT JOIN offers o ON o.tenant_id = t.id
...
```

---

## 🔑 3. Admin vs Tenant Authentication Model

### Implementation Status: ✅ COMPLETE

### Changes Made:

#### A. Separate JWT Secrets
- `ADMIN_JWT_SECRET` - For super admin tokens
- `TENANT_JWT_SECRET` - For tenant admin tokens
- Backward compatibility: Falls back to `JWT_SECRET` if new secrets not set

#### B. Token Type in JWT
- Added `token_type: 'admin' | 'tenant'` to JWT payload
- Helps identify token type during verification

#### C. Auth Controller Updates
- Uses appropriate secret based on user type (admin vs tenant)
- Logs token type for audit purposes

### Environment Variables:
```bash
# Required for production
ADMIN_JWT_SECRET=your-super-secure-admin-secret
TENANT_JWT_SECRET=your-super-secure-tenant-secret

# Legacy (for backward compatibility during migration)
JWT_SECRET=your-legacy-secret
```

### Token Generation:
```javascript
// Admin token (tenant_id = NULL)
const token = jwt.sign(
  { id, email, name, role, tenant_id: null, token_type: 'admin' },
  ADMIN_JWT_SECRET
);

// Tenant token (tenant_id = X)
const token = jwt.sign(
  { id, email, name, role, tenant_id: X, token_type: 'tenant' },
  TENANT_JWT_SECRET
);
```

---

## 📊 4. Tenant Observability & Controls

### Implementation Status: ✅ COMPLETE

### New Service: `src/services/tenantMetricsService.js`

### Features:

#### A. Tenant Metrics
- Clicks (today, period)
- Conversions (today, period, by status)
- Revenue & Payout
- Publisher & Offer counts
- Redis queue depth

#### B. Daily Metrics
- Last N days of metrics
- Trend analysis
- Performance tracking

#### C. Top Offers
- Best performing offers per tenant
- Revenue ranking
- Conversion ranking

### New Endpoints:
- `POST /api/admin/tenants/:id/suspend` - Suspend tenant (blocks all access)
- `POST /api/admin/tenants/:id/resume` - Resume tenant (restores access)
- `GET /api/admin/tenants/:id/metrics` - Get tenant metrics

### Usage:
```javascript
// Suspend tenant
POST /api/admin/tenants/123/suspend
// Immediately blocks:
// - Login attempts
// - Tracking requests
// - API access

// Get metrics
GET /api/admin/tenants/123/metrics?date_from=2026-01-01&date_to=2026-01-31
```

---

## 🧹 5. Redis & Queue Hygiene

### Implementation Status: ✅ COMPLETE

### New Service: `src/config/redisHygiene.js`

### Features:

#### A. TTL Enforcement
- Click data: 30 minutes (1800 seconds)
- Conversion data: 1 hour (3600 seconds)
- Dedupe keys: 5 seconds

#### B. Stream Trimming
- Click stream: Max 10,000 entries
- Prevents unbounded growth
- Uses `XTRIM` with approximate trimming

#### C. Cleanup Tasks
- Removes expired keys
- Sets TTLs on keys without expiration
- Monitors queue depth

### Usage:
```javascript
import redisHygiene from './config/redisHygiene.js';

// Run all hygiene tasks
await redisHygiene.runAllHygieneTasks();

// Get queue stats
const stats = await redisHygiene.getQueueStats();
```

### Scheduled Task (Recommended):
```javascript
// Run every hour
setInterval(async () => {
  await redisHygiene.runAllHygieneTasks();
}, 3600000); // 1 hour
```

---

## 🌐 6. NGINX Configuration

### Implementation Status: 📝 DOCUMENTATION ONLY

### Required Configuration:

#### A. Wildcard DNS
```nginx
# DNS: *.track-myads.com → backend server IP
server {
    listen 80;
    server_name *.track-myads.com;
    
    # Rate limiting per tenant
    limit_req_zone $host zone=tenant_limit:10m rate=100r/s;
    limit_req zone=tenant_limit burst=200;
    
    location / {
        proxy_pass http://backend:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### B. Admin Subdomain Protection
```nginx
server {
    listen 80;
    server_name admin.track-myads.com;
    
    # Stricter rate limiting for admin
    limit_req_zone $binary_remote_addr zone=admin_limit:10m rate=10r/s;
    limit_req zone=admin_limit burst=20;
    
    # IP whitelist (optional)
    # allow 1.2.3.4;
    # deny all;
    
    location / {
        proxy_pass http://backend:5001;
    }
}
```

#### C. Block Unknown Subdomains (Optional)
```nginx
# Reject unknown subdomains at NGINX level
# This requires a list of valid tenant slugs
map $host $is_valid_tenant {
    default 0;
    ~^([^.]+)\.ad-track\.com$ $1;
    # Add valid tenant slugs here or use lua script to check DB
}
```

---

## 🧪 7. Test Matrix

### Implementation Status: 📝 DOCUMENTATION ONLY

### Required Tests:

#### A. Tenant Isolation Tests
```javascript
// Test 1: Tenant A cannot access Tenant B data
// - Login as Tenant A admin
// - Try to access Tenant B's offer
// - Should return 403 Forbidden

// Test 2: Same offer_id across tenants works
// - Create offer_id=1 for Tenant A
// - Create offer_id=1 for Tenant B
// - Both should work independently
```

#### B. Tracking Tests
```javascript
// Test 3: Tracking with tenant subdomain
// GET owner1.track-myads.com/click?offer_id=123&pub_id=456
// - Should work and assign tenant_id=1

// Test 4: Tracking without tenant subdomain
// GET track-myads.com/click?offer_id=123&pub_id=456
// - Should derive tenant from offer/publisher
// - Should work if offer has tenant_id
```

#### C. Admin Panel Tests
```javascript
// Test 5: Admin panel cannot be accessed via tenant domain
// GET owner1.track-myads.com/api/admin/tenants
// - Should return 403 Forbidden

// Test 6: Admin panel works via admin subdomain
// GET admin.track-myads.com/api/admin/tenants
// - Should work for super admin
```

#### D. Suspended Tenant Tests
```javascript
// Test 7: Suspended tenant cannot login
// POST owner1.track-myads.com/api/auth/login
// - Should return 403 Tenant Suspended

// Test 8: Suspended tenant cannot track
// GET owner1.track-myads.com/click?offer_id=123
// - Should return 403 Tenant Suspended
```

### Test File Location:
Create: `src/tests/multi-tenant.test.js`

---

## 🚀 8. Future-Proofing (No Implementation)

### A. Tenant Billing Hooks
- Track usage per tenant
- Generate invoices
- Usage-based pricing

### B. Tenant Sharding Readiness
- Database-per-tenant option
- Read replicas by tenant
- Horizontal scaling

### C. Plan-Based Feature Flags
- Feature flags per tenant
- Subscription tiers
- Usage limits

---

## 📋 Deployment Checklist

### Pre-Deployment:
- [ ] Run migration `001_add_multi_tenant_support.sql`
- [ ] Run migration `002_harden_multi_tenant_production.sql`
- [ ] Set `ADMIN_JWT_SECRET` environment variable
- [ ] Set `TENANT_JWT_SECRET` environment variable
- [ ] Configure wildcard DNS: `*.track-myads.com`
- [ ] Configure NGINX with rate limiting
- [ ] Set up Redis hygiene scheduled task
- [ ] Run test matrix

### Post-Deployment:
- [ ] Monitor tenant metrics
- [ ] Verify tenant isolation
- [ ] Check Redis queue depth
- [ ] Monitor error logs
- [ ] Verify suspended tenant blocking works

---

## 🔐 Security Best Practices

1. **Never trust client-provided tenant_id** - Always verify from subdomain or database
2. **Log all tenant access attempts** - Especially failures and mismatches
3. **Rate limit per tenant** - Prevent abuse
4. **Monitor for suspicious activity** - Unusual tenant access patterns
5. **Regular security audits** - Review tenant isolation regularly

---

## 📊 Monitoring & Alerts

### Key Metrics to Monitor:
- Tenant login failures
- Tenant mismatch attempts
- Suspended tenant access attempts
- Redis queue depth per tenant
- API rate limits per tenant
- Database query performance with tenant_id indexes

### Recommended Alerts:
- Tenant suspended but still receiving traffic
- High rate of tenant mismatch errors
- Redis queue depth exceeding threshold
- Database query performance degradation

---

**End of Production Hardening Guide**
