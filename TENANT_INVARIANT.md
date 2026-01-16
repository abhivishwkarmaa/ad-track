# 🧠 Tenant Resolution Invariant

## Core Rule (MEMORIZE THIS)

**Tenant is a property of the request host, not of frontend headers or business IDs.**

---

## 📋 What This Means

### ✅ CORRECT
- Tenant resolved from `request.headers.host` subdomain
- Tenant middleware extracts subdomain: `tenant1.domain.com` → `tenant1`
- All components use `request.tenantId` from middleware

### ❌ WRONG (DO NOT DO THIS)
- ❌ Inferring tenant from `x-tenant-slug` header
- ❌ Inferring tenant from `offer.tenant_id`
- ❌ Inferring tenant from `publisher.tenant_id`
- ❌ Inferring tenant from `request.query.tenant_id`
- ❌ Inferring tenant from Origin/Referer headers
- ❌ Frontend passing tenant information
- ❌ Generating tracking URLs without tenant subdomain

---

## 🔒 Enforcement Points

### 1. Middleware Layer (`src/middleware/tenant.js`)
- ✅ Extracts tenant from Host header ONLY
- ✅ Sets `request.tenant` and `request.tenantId`
- ✅ Rejects requests without valid tenant subdomain

### 2. Utility Layer (`src/utils/tenantScope.js`)
- ✅ `getTenantIdFromRequest()` returns `request.tenantId` ONLY
- ✅ NO fallbacks to query params, headers, or business data

### 3. Service Layer
- ✅ All services use `getTenantIdFromRequest(request)`
- ✅ Business data validated AFTER tenant resolution
- ✅ Hard failure on tenant mismatches

### 4. Frontend Layer
- ✅ Uses relative paths (`/api/...`)
- ✅ NO tenant headers
- ✅ NO tenant inference

### 5. URL Generation
- ✅ Backend generates URLs with tenant subdomain
- ✅ Format: `{tenant}.{domain}/click`

---

## 🚨 Common Mistakes to Avoid

1. **Don't** use `request.query.tenant_id` for tenant resolution
2. **Don't** use `request.headers['x-tenant-slug']` for tenant resolution
3. **Don't** use `offer.tenant_id` to infer tenant (only for validation)
4. **Don't** generate tracking URLs on frontend
5. **Don't** pass tenant information from frontend to backend

---

## ✅ Verification

Run these checks to verify compliance:

```bash
# Check for tenant header usage
grep -r "x-tenant" src/

# Check for query param tenant usage
grep -r "query\.tenant" src/

# Check for Origin/Referer tenant inference
grep -r "origin.*tenant\|referer.*tenant" -i src/

# Verify frontend uses relative paths
grep -r "https://\|http://" Pulpy_Reporting_Portal_frontend/src/services/
```

All should return ZERO matches (except for comments/documentation).

---

**Remember**: If you need tenant information, get it from `request.tenantId` which is set by the middleware from the Host header subdomain.
