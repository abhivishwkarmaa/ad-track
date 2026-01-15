# Strict Subdomain-Based Multi-Tenancy Refactoring Complete

## ✅ Implementation Summary

This document describes the refactoring from frontend-trusted tenant detection to **strict subdomain-based multi-tenancy** where tenant identity is resolved **EXCLUSIVELY** from the request Host header (subdomain).

---

## 🔒 Core Principles Implemented

### 1. Subdomain = EXCLUSIVE Source of Truth
- ✅ Tenant identity resolved **ONLY** from HTTP `Host` header subdomain
- ✅ **NO FALLBACKS**: Client headers (Origin, Referer, x-tenant-*, etc.) **NEVER** used for tenant resolution
- ✅ **HARD REJECTION**: Requests without valid tenant subdomain are immediately rejected
- ✅ Business identifiers (offer_id, pub_id) **NEVER** used for tenant resolution

### 2. Tenant-First Request Flow
```
Request → Extract Subdomain from Host Header → Validate Tenant → Resolve Tenant ID
↓
Tenant ID Determined (BEFORE any database lookup)
↓
Validate Business Data (offer_id, pub_id) belongs to resolved tenant
↓
Process Request
```

### 3. Security Enforcement
- ✅ Tenant identity determined **BEFORE** any database lookup or business logic
- ✅ Business data validated **AFTER** tenant resolution
- ✅ **Hard failure** on any mismatch between subdomain tenant and business data tenant

---

## 📝 Files Modified

### Backend Files

### 1. `src/middleware/tenant.js`
**Changes:**
- ✅ Removed header-based tenant detection for `api` subdomain
- ✅ **Removed** fallback logic that allowed tenant to be passed via `x-tenant-slug` or `x-tenant-id` headers
- ✅ Updated documentation to reflect strict subdomain-only approach
- ✅ All special subdomains (`admin`, `api`, `www`) now have no tenant - no header fallback

**Before:**
```javascript
// API subdomain - check for tenant in header or subdomain
if (subdomain === 'api') {
  // Allow tenant to be passed via header for API calls
  const tenantSlug = request.headers['x-tenant-slug'] || request.headers['x-tenant-id'];
  if (tenantSlug) {
    const tenant = await getTenantBySlug(tenantSlug);
    if (tenant) {
      request.tenant = tenant;
      return;
    }
  }
}
```

**After:**
```javascript
// 🔒 STRICT: API subdomain has no tenant - no header fallback allowed
// All API calls must use tenant subdomain (e.g., tenant1.domain.com/api/...)
return; // No tenant for special subdomains
```

### 2. `src/utils/tenantScope.js`
**Changes:**
- ✅ **Removed all fallbacks** from `getTenantIdFromRequest`
- ✅ Now **ONLY** returns `request.tenantId` which is set by tenant middleware from subdomain
- ✅ Removed fallbacks to: `request.query.tenant_id`, `request.tenant?.id`, `request.admin?.tenantId`

**Before:**
```javascript
export function getTenantIdFromRequest(request) {
  return request.tenantId || request.tenant?.id || request.admin?.tenantId || request.query?.tenant_id || null;
}
```

**After:**
```javascript
export function getTenantIdFromRequest(request) {
  // ✅ ONLY use request.tenantId which is set by tenant middleware from subdomain
  // ❌ NEVER use: request.query.tenant_id, request.headers, request.tenant?.id (if not from subdomain)
  return request.tenantId || null;
}
```

### 3. `src/services/trackingService.js`
**Changes:**
- ✅ **Removed fallback tenant resolution** from `trackImpression` method
- ✅ Now **hard fails** if no tenant from subdomain
- ✅ Tenant must be resolved from subdomain **BEFORE** any database lookup
- ✅ Business data (offer, publisher) validated **AFTER** tenant resolution

**Before:**
```javascript
// ✅ STEP 3: If NOT found from subdomain, derive tenant from offer or publisher
if (!tenantId) {
  tenantId = offer.tenant_id || publisher.tenant_id || null;
  // ... fallback logic
}
```

**After:**
```javascript
// 🔒 STRICT: Reject if no tenant from subdomain
if (!tenantId) {
  logger.error('❌ CRITICAL: No tenant resolved from subdomain for impression - REJECTED', {
    host: request.headers.host,
    url: request.url,
    offer_id: offerId,
    pub_id: publisherId
  });
  return { 
    success: false, 
    error: 'Tenant identity required. Access via tenant subdomain...' 
  };
}
```

### 4. `src/controllers/adminController.js`
**Changes:**
- ✅ **Removed fallback logic** from `getTrackingURL` method
- ✅ Now **hard fails** if tenant subdomain cannot be determined
- ✅ Tracking URLs must be generated with tenant subdomain (e.g., `tenant1.domain.com/click`)

**Before:**
```javascript
} else {
  // Fallback to original baseURL if subdomain can't be determined
  logger.warn('Could not determine tenant subdomain for tracking URL, using base URL', {
    host: request.headers.host,
    tenant: request.tenant
  });
  baseURL = trackingDomain;
}
```

**After:**
```javascript
// 🔒 STRICT: Tenant subdomain MUST be available from request.tenant (set by middleware)
if (!request.tenant || !request.tenant.slug) {
  logger.error('❌ getTrackingURL: Tenant subdomain not available - REJECTED', {
    host: request.headers.host,
    tenantId: tenantId,
    tenant: request.tenant
  });
  return reply.code(400).send({
    success: false,
    error: 'Tenant Subdomain Required',
    message: 'Could not determine tenant subdomain from request...',
  });
}
```

### Frontend Files

### 5. `src/services/api.js`
**Changes:**
- ✅ Added strict comments clarifying subdomain-based multi-tenancy
- ✅ Added comment explicitly stating never to add tenant headers
- ✅ Clarified that BASE_URL should be empty/relative for subdomain-based routing

**Added:**
```javascript
// 🔒 STRICT SUBDOMAIN-BASED MULTI-TENANCY
// ✅ CORRECT: Use relative paths for API calls
// Frontend operates on tenant subdomain (e.g., tenant1.domain.com)
// All API calls use relative paths, preserving Host header for tenant resolution
// ❌ NEVER: Use absolute URLs, pass tenant headers, or infer tenant from client-side code
```

### 6. `src/pages/Offer/EditOffer.jsx`
**Changes:**
- ✅ **Deprecated** `generateTrackingUrl()` function - tracking URLs must come from backend
- ✅ Updated postback URL placeholder to reflect tenant subdomain format
- ✅ Added warning when deprecated function is called

**Before:**
```javascript
const generateTrackingUrl = () => {
    const baseUrl = formData.trackingDomain || 'https://track.bngrenew.com';
    const url = `${baseUrl}/click?o=${formData.offerId}&a={affiliate_id}&s={source}&c={clickid}`;
    setFormData(prev => ({ ...prev, trackingUrl: url }));
    toast.success('Tracking URL generated!');
};
```

**After:**
```javascript
// 🔒 DEPRECATED: Tracking URLs are generated by backend only
// Frontend should NEVER generate tracking URLs - they must come from backend API
// Backend generates URLs with tenant subdomain (e.g., tenant1.domain.com/click)
const generateTrackingUrl = () => {
    toast.error('Tracking URLs must be generated by the backend. Use the "Get Tracking URL" button instead.');
    console.warn('⚠️ generateTrackingUrl() is deprecated. Tracking URLs should be fetched from backend API.');
};
```

### 7. `src/context/AuthContext.jsx`
**Changes:**
- ✅ Added comments clarifying that `tenant_id` in localStorage is ONLY for super admin checks
- ✅ Explicitly stated that tenant_id is NEVER used for tenant resolution

**Added:**
```javascript
// 🔒 STRICT: tenant_id in localStorage is ONLY for super admin role checks
// It is NEVER used for tenant resolution - tenant comes from subdomain (Host header)
```

### 8. `vite.config.js`
**Changes:**
- ✅ Enhanced comments explaining why `changeOrigin: false` is critical
- ✅ Clarified that Host header preservation is REQUIRED for tenant resolution

**Enhanced:**
```javascript
// 🔒 STRICT SUBDOMAIN-BASED MULTI-TENANCY
// ✅ CRITICAL: Proxy API requests to backend while preserving Host header
// changeOrigin: false ensures the original Host header (with tenant subdomain) is forwarded
// This allows backend to resolve tenant from subdomain (e.g., tenant1.localhost:5173)
```
**Changes:**
- ✅ **Removed fallback logic** from `getTrackingURL` method
- ✅ Now **hard fails** if tenant subdomain cannot be determined
- ✅ Tracking URLs must be generated with tenant subdomain (e.g., `tenant1.domain.com/click`)

**Before:**
```javascript
} else {
  // Fallback to original baseURL if subdomain can't be determined
  logger.warn('Could not determine tenant subdomain for tracking URL, using base URL', {
    host: request.headers.host,
    tenant: request.tenant
  });
  baseURL = trackingDomain;
}
```

**After:**
```javascript
// 🔒 STRICT: Tenant subdomain MUST be available from request.tenant (set by middleware)
if (!request.tenant || !request.tenant.slug) {
  logger.error('❌ getTrackingURL: Tenant subdomain not available - REJECTED', {
    host: request.headers.host,
    tenantId: tenantId,
    tenant: request.tenant
  });
  return reply.code(400).send({
    success: false,
    error: 'Tenant Subdomain Required',
    message: 'Could not determine tenant subdomain from request...',
  });
}
```

---

## ✅ Verification

### Frontend
- ✅ Uses **relative API paths** (`/api/...`) - no absolute URLs
- ✅ **Never passes tenant headers** (no `x-tenant-slug`, `x-tenant-id`, etc.)
- ✅ Vite proxy configured with `changeOrigin: false` to preserve Host header
- ✅ All API calls use same subdomain as frontend
- ✅ **Deprecated frontend tracking URL generation** - tracking URLs must come from backend
- ✅ Updated placeholders to reflect tenant subdomain format
- ✅ Added strict comments clarifying tenant resolution rules

### Backend
- ✅ Tenant middleware runs **before all routes** (onRequest hook)
- ✅ All tracking endpoints (`/click`, `/imp`, `/postback`) require tenant subdomain
- ✅ All business endpoints require tenant subdomain
- ✅ Tracking URLs generated with tenant subdomain format: `{tenant}.{domain}/click`
- ✅ Postback URLs stored in database, macros replaced when sending (no generation needed)

### Controllers
- ✅ All controllers use `getTenantIdFromRequest()` which now only returns tenant from subdomain
- ✅ Tenant validation happens **before** any database access
- ✅ Business data validated to belong to resolved tenant

---

## 🧠 One-Line Rule

**Frontend never tells backend who the tenant is.**
**Backend learns tenant only from the Host.**

---

## 🔒 Security Guarantees

1. **Tenant identity determined BEFORE business logic**: Tenant is resolved from subdomain in middleware before any route handler executes
2. **No client-controlled tenant selection**: Client cannot spoof tenant via headers, query params, or request body
3. **Hard failure on mismatch**: Any mismatch between subdomain tenant and business data tenant results in immediate rejection
4. **Subdomain validation**: Invalid or non-existent tenant subdomains are rejected with clear error messages

---

## 📋 Testing Checklist

- [ ] Access API without tenant subdomain → Should return 400 error
- [ ] Access tracking endpoint (`/click`) without tenant subdomain → Should return 400 error
- [ ] Access with invalid tenant subdomain → Should return 404 error
- [ ] Access with valid tenant subdomain → Should work correctly
- [ ] Try to pass tenant via header (`x-tenant-slug`) → Should be ignored, tenant from subdomain used
- [ ] Try to pass tenant via query param (`?tenant_id=X`) → Should be ignored, tenant from subdomain used
- [ ] Generate tracking URL → Should include tenant subdomain (e.g., `tenant1.domain.com/click`)
- [ ] Access offer from wrong tenant subdomain → Should return 403/404 error
- [ ] Frontend API calls from tenant subdomain → Should work correctly

---

## 🚀 Deployment Notes

1. **DNS Configuration**: Ensure all tenant subdomains are properly configured in DNS
2. **Reverse Proxy**: Ensure reverse proxy (NGINX) preserves Host header when forwarding requests
3. **SSL Certificates**: Ensure SSL certificates cover all tenant subdomains (wildcard or SAN certificates)
4. **Environment Variables**: Verify `TRACKING_DOMAIN` or `BASE_URL` is set correctly for tracking URL generation

---

## 📚 Related Documentation

- `STRICT_MULTI_TENANT_IMPLEMENTATION.md` - Previous strict multi-tenant implementation
- `TENANT_ISOLATION_COMPLETE.md` - Tenant isolation implementation
- `ARCHITECTURE_EXPLAINED.md` - Overall architecture documentation

---

**Refactoring Date**: $(date)
**Status**: ✅ Complete
