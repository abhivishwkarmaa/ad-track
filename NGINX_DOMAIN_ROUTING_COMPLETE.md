# ✅ NGINX Domain-Level Routing Configuration - COMPLETE

## 🎯 Status: FULLY CONFIGURED ✅

This document describes the **strict domain-level routing** configuration where routing decisions are made **EXCLUSIVELY** at the NGINX level, not in application logic.

---

## 🧠 Core Invariant (MEMORIZE)

**"Root = portfolio, admin = admin, wildcard = tenants."**

✅ **ENFORCED** in NGINX configuration

---

## 🔒 Routing Rules

### 1. Root Domain (Exact Match - Highest Priority)
- **Domain**: `track-myads.com`, `www.track-myads.com`
- **Purpose**: Portfolio website
- **Document Root**: `/var/www/portfolio`
- **Routes to**: Static portfolio website (not tenant application)
- **Priority**: Highest (exact match takes precedence)

### 2. Admin Subdomain (Exact Match - High Priority)
- **Domain**: `admin.track-myads.com`
- **Purpose**: Admin panel (super admin access)
- **Document Root**: `/var/www/ad-track-frontend/dist`
- **Routes to**: Admin frontend + Backend API
- **Priority**: High (exact match takes precedence over wildcard)
- **Backend sees**: `Host: admin.track-myads.com` → Sets `isAdminSubdomain = true`

### 3. Wildcard Subdomains (Wildcard Match - Lower Priority)
- **Domain**: `*.track-myads.com` (matches: `tenant1.track-myads.com`, `tenant2.track-myads.com`, etc.)
- **Purpose**: Multi-tenant application
- **Document Root**: `/var/www/ad-track-frontend/dist`
- **Routes to**: Tenant frontend + Backend API + Tracking endpoints
- **Priority**: Lower (only matches if exact matches fail)
- **Excluded**: `track-myads.com`, `admin.track-myads.com`, `www.track-myads.com`
- **Backend sees**: `Host: tenant1.track-myads.com` → Extracts tenant `tenant1`

---

## 📋 NGINX Server Block Priority

NGINX processes server blocks in **configuration file order**, but **exact matches take precedence**:

```nginx
# Order in config file:
1. Root domain (track-myads.com) - Exact match ✅
2. Admin subdomain (admin.track-myads.com) - Exact match ✅
3. Wildcard (*.track-myads.com) - Matches everything else ✅

# NGINX matching behavior:
- track-myads.com → Matches #1 (root domain) ✅
- admin.track-myads.com → Matches #2 (admin subdomain) ✅
- tenant1.track-myads.com → Matches #3 (wildcard) ✅
- www.track-myads.com → Matches #1 (root domain) ✅
```

**Key Point**: Exact `server_name` matches always take precedence over wildcard patterns.

---

## ✅ Configuration Details

### Root Domain Server Block
```nginx
server {
    listen 443 ssl http2;
    server_name track-myads.com www.track-myads.com;  # Exact match
    
    root /var/www/portfolio;  # Portfolio website
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Features:**
- ✅ Serves portfolio website
- ✅ No backend API access
- ✅ No tenant application logic
- ✅ Static files only

---

### Admin Subdomain Server Block
```nginx
server {
    listen 443 ssl http2;
    server_name admin.track-myads.com;  # Exact match - takes precedence
    
    root /var/www/ad-track-frontend/dist;  # Admin frontend
    
    # ✅ CRITICAL: Preserve Host header
    proxy_set_header Host $host;  # admin.track-myads.com
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://backend;  # Backend sees Host: admin.track-myads.com
    }
}
```

**Features:**
- ✅ Serves admin frontend
- ✅ Proxies `/api/*` to backend
- ✅ Host header preserved: `admin.track-myads.com`
- ✅ Backend sets `isAdminSubdomain = true`
- ✅ Stricter rate limiting

---

### Wildcard Subdomain Server Block
```nginx
server {
    listen 443 ssl http2;
    server_name *.track-myads.com;  # Wildcard - matches after exact matches
    
    root /var/www/ad-track-frontend/dist;  # Tenant frontend
    
    # ✅ CRITICAL: Preserve Host header for tenant resolution
    proxy_set_header Host $host;  # tenant1.track-myads.com
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://backend;  # Backend sees Host: tenant1.track-myads.com
    }
    
    location ~ ^/(click|postback|imp)$ {
        proxy_pass http://backend;  # Tracking endpoints with tenant context
    }
}
```

**Features:**
- ✅ Serves tenant frontend (same build as admin, different routing)
- ✅ Proxies `/api/*` to backend
- ✅ Proxies `/click`, `/postback`, `/imp` to backend
- ✅ Host header preserved: `tenant1.track-myads.com`
- ✅ Backend extracts tenant from Host header
- ✅ Per-tenant rate limiting

---

## 🔒 Domain Exclusion Logic

### What Gets Excluded from Wildcard?

The wildcard `*.track-myads.com` **DOES NOT** match:

1. ✅ **Root domain**: `track-myads.com` → Handled by exact match
2. ✅ **WWW**: `www.track-myads.com` → Handled by root domain block
3. ✅ **Admin**: `admin.track-myads.com` → Handled by exact match

**How it works:**
- NGINX checks exact `server_name` matches first
- If exact match found → Use that server block
- If no exact match → Check wildcard patterns
- Wildcard only matches subdomains not matched by exact rules

**Result**: Root and admin domains are **NEVER** handled by wildcard server block.

---

## 📊 Request Flow Examples

### Example 1: Root Domain (Portfolio)
```
Request: GET https://track-myads.com/

NGINX:
1. Check exact matches: track-myads.com ✅ MATCH
2. Use root domain server block
3. Serve: /var/www/portfolio/index.html

Backend: NOT INVOLVED
```

### Example 2: Admin Subdomain (Admin Panel)
```
Request: GET https://admin.track-myads.com/api/admin/offers

NGINX:
1. Check exact matches: admin.track-myads.com ✅ MATCH
2. Use admin subdomain server block
3. Proxy to: http://backend/api/admin/offers
4. Header: Host: admin.track-myads.com

Backend:
1. Tenant middleware sees: admin.track-myads.com
2. Sets: isAdminSubdomain = true
3. Sets: tenant = null (no tenant for admin)
4. Processes request
```

### Example 3: Tenant Subdomain (Tenant Application)
```
Request: GET https://tenant1.track-myads.com/api/admin/offers

NGINX:
1. Check exact matches: No match for tenant1.track-myads.com
2. Check wildcard: *.track-myads.com ✅ MATCH
3. Use wildcard server block
4. Proxy to: http://backend/api/admin/offers
5. Header: Host: tenant1.track-myads.com

Backend:
1. Tenant middleware sees: tenant1.track-myads.com
2. Extracts subdomain: "tenant1"
3. Queries: SELECT * FROM tenants WHERE slug = 'tenant1'
4. Sets: request.tenantId = 1
5. Processes request with tenant_id = 1
```

### Example 4: Tracking Endpoint
```
Request: GET https://tenant1.track-myads.com/click?offer_id=1&pub_id=1

NGINX:
1. Check exact matches: No match
2. Check wildcard: *.track-myads.com ✅ MATCH
3. Route: /click matches location ~ ^/(click|postback|imp)$
4. Proxy to: http://backend/click?offer_id=1&pub_id=1
5. Header: Host: tenant1.track-myads.com

Backend:
1. Tenant middleware extracts: tenant1
2. Resolves: tenantId = 1
3. Tracking service uses: tenantId = 1
4. Records click with tenant_id = 1
```

---

## ✅ Security Features

### 1. Exact Match Precedence
- ✅ Root domain never handled by tenant server
- ✅ Admin subdomain never handled by tenant server
- ✅ All routing decisions at NGINX level

### 2. Host Header Preservation
- ✅ `proxy_set_header Host $host` preserves original Host
- ✅ Backend receives correct subdomain for tenant resolution
- ✅ No application-level routing logic needed

### 3. Rate Limiting
- ✅ Portfolio: 50 req/s per IP
- ✅ Admin: 10 req/s per IP (stricter)
- ✅ Tenant: 100 req/s per tenant (per Host header)

### 4. SSL/TLS
- ✅ Separate certificates for each domain type
- ✅ TLS 1.2+ only
- ✅ Strong cipher suites

---

## 🚀 Deployment Checklist

### DNS Configuration
- [ ] `track-myads.com` → A record → NGINX server IP
- [ ] `www.track-myads.com` → A record → NGINX server IP
- [ ] `admin.track-myads.com` → A record → NGINX server IP
- [ ] `*.track-myads.com` → A record → NGINX server IP (wildcard DNS)

### SSL Certificates
- [ ] Root domain certificate: `track-myads.com` + `www.track-myads.com`
- [ ] Admin subdomain certificate: `admin.track-myads.com`
- [ ] Wildcard certificate: `*.track-myads.com`

### File System
- [ ] Portfolio website: `/var/www/portfolio/`
- [ ] Admin/Tenant frontend: `/var/www/ad-track-frontend/dist/`
- [ ] Certificates: `/etc/ssl/certs/` and `/etc/ssl/private/`

### Backend Configuration
- [ ] Backend running on `localhost:5001`
- [ ] Backend NOT exposed publicly (firewall blocks port 5001)
- [ ] Tenant middleware configured to extract subdomain from Host header

---

## 📝 Testing Scenarios

### Test 1: Root Domain (Portfolio)
```bash
curl -H "Host: track-myads.com" https://track-myads.com/
# Should: Return portfolio website HTML
# Should NOT: Route to tenant application
```

### Test 2: Admin Subdomain
```bash
curl -H "Host: admin.track-myads.com" https://admin.track-myads.com/api/auth/login
# Should: Proxy to backend with Host: admin.track-myads.com
# Backend: Should set isAdminSubdomain = true
```

### Test 3: Tenant Subdomain
```bash
curl -H "Host: tenant1.track-myads.com" https://tenant1.track-myads.com/api/admin/offers
# Should: Proxy to backend with Host: tenant1.track-myads.com
# Backend: Should extract tenant "tenant1" and set tenantId = 1
```

### Test 4: Tracking Endpoint
```bash
curl -H "Host: tenant1.track-myads.com" https://tenant1.track-myads.com/click?offer_id=1&pub_id=1
# Should: Proxy to backend with Host: tenant1.track-myads.com
# Backend: Should resolve tenant and record click with tenant_id = 1
```

---

## 🔒 Architecture Guarantees

### 1. Domain-Level Routing Only
- ✅ All routing decisions made in NGINX
- ✅ No application-level domain checking
- ✅ Backend receives correct Host header

### 2. Exact Match Precedence
- ✅ Root domain always matches root server block
- ✅ Admin subdomain always matches admin server block
- ✅ Wildcard only matches unmatched subdomains

### 3. Host Header Preservation
- ✅ NGINX preserves original Host header
- ✅ Backend extracts tenant from Host header
- ✅ No client headers used for tenant resolution

---

## 📚 Related Documentation

- `STRICT_SUBDOMAIN_REFACTORING_COMPLETE.md` - Subdomain-based tenant resolution
- `STRICT_TENANT_SCOPED_AUTH_COMPLETE.md` - Tenant-scoped authentication
- `nginx-production.conf` - Complete NGINX configuration

---

**Configuration Date**: Final domain routing setup complete
**Status**: ✅ **FULLY CONFIGURED** - Production Ready

---

## 🧠 One-Line Rule (Add to README)

**"Root = portfolio, admin = admin, wildcard = tenants."**
