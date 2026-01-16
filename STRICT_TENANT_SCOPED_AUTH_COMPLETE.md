# ✅ Strict Tenant-Scoped Authentication - COMPLETE

## 🎯 Status: FULLY IMPLEMENTED ✅

This document describes the refactoring to **strict tenant-scoped authentication** where login is **ALWAYS per-tenant** and tenant identity is resolved **EXCLUSIVELY** from the request Host header (subdomain) **BEFORE** credential validation.

---

## 🧠 Core Invariant (MEMORIZE)

**"Login is not global. Login is always per-tenant."**

✅ **ENFORCED** across entire authentication system

---

## 🔒 Core Principles Implemented

### 1. Tenant Resolution BEFORE Credential Validation
- ✅ Tenant resolved from subdomain (Host header) **FIRST**
- ✅ Credentials validated **AFTER** tenant resolution
- ✅ Tenant mismatch = Invalid credentials (not a post-login error)
- ✅ **NO** token issued if tenant doesn't match

### 2. Strict Tenant Matching
- ✅ Super admin (tenant_id = NULL) can **ONLY** login via `admin` subdomain
- ✅ Tenant admin (tenant_id = X) can **ONLY** login via matching tenant subdomain
- ✅ Tenant admin trying wrong tenant subdomain = REJECT (invalid credentials)
- ✅ Super admin trying tenant subdomain = REJECT (invalid credentials)

### 3. Security Enforcement
- ✅ Tenant mismatch treated as invalid credentials (no information leakage)
- ✅ No token issued on tenant mismatch
- ✅ Users cannot reach dashboard/protected routes with wrong tenant subdomain
- ✅ JWT middleware validates tenant match (defense-in-depth)

---

## 📋 Authentication Flow

### Login Flow (NEW - Strict Tenant-Scoped):

```
1. Request arrives: tenant1.domain.com/api/auth/login
   ↓
2. Tenant Middleware (already resolved)
   → Extract subdomain: "tenant1"
   → Set request.tenantId = 1
   ↓
3. Login Controller - Step 1: Resolve Tenant from Subdomain
   → requestTenantId = getTenantIdFromRequest(request) = 1
   ↓
4. Login Controller - Step 2: Validate Credentials
   → Query: SELECT ... FROM admin_users WHERE email = ?
   → Verify password with bcrypt
   ↓
5. Login Controller - Step 3: Verify Tenant Match
   → Get userTenantId from admin record
   → If userTenantId != requestTenantId → REJECT (invalid credentials)
   → If super admin + not admin subdomain → REJECT (invalid credentials)
   → If tenant admin + not matching tenant subdomain → REJECT (invalid credentials)
   ↓
6. Login Controller - Step 4: Issue Token (ONLY if tenant matches)
   → Generate JWT with tenant_id
   → Return token to client
   ↓
7. Protected Routes - Auth Middleware
   → Verify JWT token
   → Validate JWT tenant_id matches request tenant_id
   → REJECT if mismatch (defense-in-depth)
```

---

## 📝 Files Modified

### 1. `src/controllers/authController.js` - LOGIN METHOD

**Changes:**
- ✅ Tenant resolved from subdomain **BEFORE** credential validation
- ✅ Tenant validation happens **AFTER** password verification but **BEFORE** token issuance
- ✅ Tenant mismatch = Invalid credentials (401 Unauthorized)
- ✅ Super admin can only login via admin subdomain
- ✅ Tenant admin can only login via matching tenant subdomain
- ✅ **NO** token issued on tenant mismatch

**Before:**
```javascript
async login(request, reply) {
  // 1. Validate input
  // 2. Find user
  // 3. Verify password
  // 4. Get tenant_id from user
  // 5. Issue token (without tenant validation)
}
```

**After:**
```javascript
async login(request, reply) {
  // 1. Validate input
  // 2. ✅ Resolve tenant from subdomain FIRST
  // 3. Find user
  // 4. Verify password
  // 5. ✅ Verify user tenant matches request tenant
  // 6. ✅ REJECT if mismatch (invalid credentials)
  // 7. Issue token ONLY if tenant matches
}
```

**Key Security Features:**
- Tenant mismatch returns `401 Unauthorized` with "Invalid email or password"
- **No information leakage** - attacker can't discover which tenant user belongs to
- Token never issued on tenant mismatch
- Super admin + tenant subdomain = REJECT
- Tenant admin + wrong tenant subdomain = REJECT

---

### 2. `src/controllers/authController.js` - REGISTER METHOD

**Changes:**
- ✅ Resolves tenant from subdomain before registration
- ✅ Assigns `tenant_id` to new user based on subdomain
- ✅ Super admin registration only via admin subdomain
- ✅ Tenant admin registration assigns tenant_id from subdomain

**Key Features:**
- Registration via `tenant1.domain.com` → user gets `tenant_id = 1`
- Registration via `admin.domain.com` → user gets `tenant_id = NULL` (super admin)

---

### 3. `src/middleware/auth.js` - AUTHENTICATE ADMIN

**Changes:**
- ✅ Enhanced tenant validation (defense-in-depth)
- ✅ **NO** fallback if tenant admin accessing without tenant subdomain
- ✅ **HARD REJECTION** if JWT tenant_id doesn't match request tenant_id
- ✅ Super admin can only access via admin subdomain

**Key Enhancements:**
- Removed fallback: `if (!requestTenantId) { request.tenantId = tenantId; }`
- Now **REJECTS** tenant admin accessing without tenant subdomain
- Stricter tenant mismatch detection with better logging

**Before:**
```javascript
// If no tenant in request but admin has tenant, use admin's tenant
if (!requestTenantId) {
  request.tenantId = tenantId; // ❌ Fallback allowed
}
```

**After:**
```javascript
// 🔒 STRICT: Tenant admin MUST have matching tenant subdomain
if (!requestTenantId) {
  // Tenant admin trying to access without tenant subdomain = REJECT
  return reply.code(403).send({ ... });
}
```

---

## ✅ Verification Checklist

### Login Validation:
- [x] Tenant resolved from subdomain BEFORE credential validation
- [x] Credentials validated AFTER tenant resolution
- [x] Tenant mismatch = Invalid credentials (401)
- [x] No token issued on tenant mismatch
- [x] Super admin can only login via admin subdomain
- [x] Tenant admin can only login via matching tenant subdomain

### Registration Validation:
- [x] Tenant resolved from subdomain
- [x] User assigned tenant_id based on subdomain
- [x] Super admin registration only via admin subdomain

### Auth Middleware:
- [x] JWT tenant_id must match request tenant_id
- [x] Tenant admin cannot access without tenant subdomain
- [x] Super admin cannot access via tenant subdomain

---

## 🔒 Security Guarantees

### 1. Tenant Mismatch = Invalid Credentials
- ✅ Tenant mismatch returns same error as wrong password
- ✅ No information leakage about which tenant user belongs to
- ✅ Prevents tenant enumeration attacks

### 2. No Token Without Tenant Match
- ✅ Token only issued if tenant matches
- ✅ User cannot login and then be rejected later
- ✅ Token contains correct tenant_id from login time

### 3. Subdomain Enforcement
- ✅ Super admin: Only via `admin` subdomain
- ✅ Tenant admin: Only via matching tenant subdomain
- ✅ Hard failure on incorrect subdomain

### 4. Defense-in-Depth
- ✅ Login validates tenant match
- ✅ Auth middleware validates tenant match again
- ✅ Both layers reject on mismatch

---

## 📊 Login Scenarios

### ✅ Valid Logins:

1. **Super Admin via Admin Subdomain:**
   - Subdomain: `admin.domain.com`
   - User: `tenant_id = NULL`
   - Result: ✅ **ALLOWED** - Token issued with admin secret

2. **Tenant Admin via Matching Tenant Subdomain:**
   - Subdomain: `tenant1.domain.com`
   - User: `tenant_id = 1`
   - Result: ✅ **ALLOWED** - Token issued with tenant secret

### ❌ Invalid Logins (All return "Invalid email or password"):

1. **Super Admin via Tenant Subdomain:**
   - Subdomain: `tenant1.domain.com`
   - User: `tenant_id = NULL`
   - Result: ❌ **REJECTED** - "Invalid email or password"

2. **Tenant Admin via Wrong Tenant Subdomain:**
   - Subdomain: `tenant2.domain.com`
   - User: `tenant_id = 1`
   - Result: ❌ **REJECTED** - "Invalid email or password"

3. **Tenant Admin via Admin Subdomain:**
   - Subdomain: `admin.domain.com`
   - User: `tenant_id = 1`
   - Result: ❌ **REJECTED** - "Invalid email or password"

---

## 🧠 One-Line Rule

**"Login is not global. Login is always per-tenant."**

✅ **ENFORCED** - No global login. Every login is tenant-scoped.

---

## 📝 Code Examples

### Login Flow:
```javascript
// ✅ STEP 1: Resolve tenant from subdomain FIRST
const requestTenantId = getTenantIdFromRequest(request);

// ✅ STEP 2: Validate credentials
const admin = await findUser(email);
const isValid = await bcrypt.compare(password, admin.password_hash);

// ✅ STEP 3: Verify tenant match BEFORE issuing token
if (admin.tenant_id !== requestTenantId) {
  return reply.code(401).send({
    error: 'Unauthorized',
    message: 'Invalid email or password', // No information leakage
  });
}

// ✅ STEP 4: Issue token ONLY if tenant matches
const token = jwt.sign({ ...admin, tenant_id: admin.tenant_id }, jwtSecret);
```

---

## ✅ Testing Scenarios

### Test Case 1: Valid Tenant Login
```
POST tenant1.domain.com/api/auth/login
Body: { email: "user@example.com", password: "pass123" }
User: tenant_id = 1

Result: ✅ 200 OK - Token issued
```

### Test Case 2: Wrong Tenant Subdomain
```
POST tenant2.domain.com/api/auth/login
Body: { email: "user@example.com", password: "pass123" }
User: tenant_id = 1

Result: ❌ 401 Unauthorized - "Invalid email or password"
```

### Test Case 3: Super Admin via Tenant Subdomain
```
POST tenant1.domain.com/api/auth/login
Body: { email: "superadmin@example.com", password: "pass123" }
User: tenant_id = NULL

Result: ❌ 401 Unauthorized - "Invalid email or password"
```

### Test Case 4: Tenant Admin via Admin Subdomain
```
POST admin.domain.com/api/auth/login
Body: { email: "tenantadmin@example.com", password: "pass123" }
User: tenant_id = 1

Result: ❌ 401 Unauthorized - "Invalid email or password"
```

---

## 🔒 Security Benefits

1. **Prevents Cross-Tenant Access**: Users cannot login to wrong tenant subdomain
2. **No Information Leakage**: Tenant mismatch returns same error as wrong password
3. **Early Rejection**: Tenant mismatch detected at login, not after token issuance
4. **Subdomain Enforcement**: Super admin and tenant admin strictly separated
5. **Defense-in-Depth**: Both login and auth middleware validate tenant

---

## 📚 Related Documentation

- `STRICT_SUBDOMAIN_REFACTORING_COMPLETE.md` - Subdomain-based multi-tenancy
- `FINAL_STRICT_TENANT_VERIFICATION.md` - Comprehensive tenant verification
- `TENANT_INVARIANT.md` - Core tenant rules

---

**Implementation Date**: Final auth refactoring complete
**Status**: ✅ **FULLY COMPLIANT** - Production Ready

---

## 🧠 One-Line Rule (Add to README)

**"Login is not global. Login is always per-tenant."**
