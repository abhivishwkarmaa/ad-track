# Multi-Tenant Architecture - Explained Simply

## 🎯 The Core Concept

### Question: Do frontend and backend need to be on the same port?

**Answer: NO!** They can be on different ports, different servers, even different continents. What matters is the **Host header**.

---

## 🔑 Key Principle

**Tenant resolution uses the Host header, NOT the port number.**

### How It Works:

1. **Browser Request**:
   ```
   GET https://tenant1.track-myads.com/api/auth/login
   Host: tenant1.track-myads.com  ← This is what matters!
   ```

2. **NGINX/Vite Proxy**:
   ```
   Receives: Host: tenant1.track-myads.com
   Forwards to: http://localhost:5001/api/auth/login
   Preserves: Host: tenant1.track-myads.com  ← Still preserved!
   ```

3. **Backend**:
   ```
   Receives: Host: tenant1.track-myads.com
   Extracts: "tenant1" from Host header
   Queries: WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'tenant1')
   Returns: Tenant 1's data only
   ```

**The port number (`:5001`, `:5173`, `:443`) is completely irrelevant for tenant resolution!**

---

## 📐 Architecture Diagrams

### Development Architecture

```
┌─────────────┐
│  Browser    │
│             │
│ Visits:     │
│ tenant1.   │
│ localhost: │
│ 5173       │
└─────┬───────┘
      │
      │ Host: tenant1.localhost
      ▼
┌─────────────────────────┐
│  Vite Dev Server        │
│  Port: 5173             │
│                         │
│  - Serves React app     │
│  - Proxies /api/*       │
│    → localhost:5001     │
│  - Preserves Host ✅    │
└─────┬───────────────────┘
      │
      │ Proxy /api/*
      │ Host: tenant1.localhost (preserved)
      ▼
┌─────────────────────────┐
│  Fastify Backend        │
│  Port: 5001             │
│                         │
│  Receives:              │
│  Host: tenant1.localhost│
│                         │
│  Extracts: tenant1      │
│  Returns: Tenant 1 data │
└─────────────────────────┘
```

**Key Points**:
- Frontend: `:5173` (Vite)
- Backend: `:5001` (Fastify)
- Different ports ✅
- Host header preserved ✅
- Tenant resolution works ✅

---

### Production Architecture

```
┌─────────────┐
│  Browser    │
│             │
│ Visits:     │
│ tenant1.    │
│ ad-track.   │
│ com         │
└─────┬───────┘
      │
      │ HTTPS :443
      │ Host: tenant1.track-myads.com
      ▼
┌─────────────────────────┐
│  NGINX                  │
│  Port: 443 (HTTPS)     │
│                         │
│  - Serves static files  │
│    (React build)        │
│  - Proxies /api/*       │
│    → localhost:5001     │
│  - Preserves Host ✅    │
└─────┬───────────────────┘
      │
      │ Proxy /api/*
      │ Host: tenant1.track-myads.com (preserved)
      │ HTTP (internal)
      ▼
┌─────────────────────────┐
│  Fastify Backend        │
│  Port: 5001             │
│  (localhost only)       │
│                         │
│  Receives:              │
│  Host: tenant1.ad-track.│
│  com                    │
│                         │
│  Extracts: tenant1      │
│  Returns: Tenant 1 data │
└─────────────────────────┘
```

**Key Points**:
- NGINX: `:443` (public HTTPS)
- Backend: `:5001` (internal HTTP)
- Different ports ✅
- Different protocols ✅
- Host header preserved ✅
- Tenant resolution works ✅

---

## ✅ Why "Same Domain" ≠ "Same Port"

### What "Same Domain" Means:

**Same Domain** = Same Host header value

**Examples**:
- ✅ `tenant1.track-myads.com` (frontend) → `tenant1.track-myads.com/api` (backend via proxy)
  - Same Host header: `tenant1.track-myads.com`
  - Same domain ✅
  - Can be different ports ✅

- ❌ `tenant1.track-myads.com` (frontend) → `api.track-myads.com` (backend)
  - Different Host headers: `tenant1.track-myads.com` vs `api.track-myads.com`
  - Different domains ❌
  - Tenant resolution fails ❌

### What "Same Domain" Does NOT Mean:

- ❌ Same port number
- ❌ Same server
- ❌ Same process
- ❌ Same IP address

**It ONLY means the Host header matches!**

---

## 🔧 Implementation Details

### Frontend API Configuration

**File**: `src/services/api.js`

```javascript
// ✅ CORRECT: Empty base URL = relative paths
const BASE_URL = '';

// API calls use relative paths
apiRequest('/api/auth/login', ...)  // ✅ Works in dev and prod
```

**Why This Works**:
- Development: Vite proxy forwards `/api/*` → `localhost:5001`
- Production: NGINX proxy forwards `/api/*` → `localhost:5001`
- Host header preserved in both cases
- No hardcoded URLs needed

---

### Vite Proxy (Development)

**File**: `vite.config.js`

```javascript
proxy: {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: false,  // ✅ CRITICAL: Preserves Host header
  }
}
```

**What `changeOrigin: false` Does**:
- Without it: Host header becomes `localhost:5001` ❌
- With it: Host header stays `tenant1.localhost` ✅

---

### NGINX Proxy (Production)

**File**: `nginx-production.conf`

```nginx
location /api {
    proxy_pass http://backend;
    proxy_set_header Host $host;  # ✅ Preserves Host header
}
```

**What `proxy_set_header Host $host` Does**:
- Forwards original Host header to backend
- Backend receives: `Host: tenant1.track-myads.com` ✅
- Tenant resolution works ✅

---

## ❌ Common Mistakes

### Mistake 1: Hardcoding Backend URL

**❌ WRONG**:
```javascript
const BASE_URL = 'http://localhost:5001';  // Breaks in production!
```

**✅ CORRECT**:
```javascript
const BASE_URL = '';  // Relative paths work everywhere
```

---

### Mistake 2: Breaking Host Header

**❌ WRONG** (Vite):
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: true,  // ❌ Rewrites Host header!
  }
}
```

**✅ CORRECT**:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: false,  // ✅ Preserves Host header
  }
}
```

---

### Mistake 3: Using Different Domains

**❌ WRONG**:
- Frontend: `tenant1.track-myads.com`
- Backend: `api.track-myads.com`
- Result: Different Host headers, tenant resolution fails

**✅ CORRECT**:
- Frontend: `tenant1.track-myads.com`
- Backend: `tenant1.track-myads.com/api` (via proxy)
- Result: Same Host header, tenant resolution works

---

## 🧪 Verification

### Development Test

```bash
# 1. Add to /etc/hosts
127.0.0.1 tenant1.localhost

# 2. Start backend
cd Pulpy_Reporting_Portal_Backend
npm start  # :5001

# 3. Start frontend
cd Pulpy_Reporting_Portal_frontend
npm run dev  # :5173

# 4. Visit: http://tenant1.localhost:5173
# 5. Check backend logs - should see:
#    "Tenant resolved: tenant1" ✅
```

### Production Test

```bash
# 1. Test API endpoint
curl -H "Host: tenant1.track-myads.com" \
     https://tenant1.track-myads.com/api/health

# 2. Check backend logs - should see:
#    "Tenant resolved: tenant1" ✅

# 3. Verify backend not exposed
curl http://your-server-ip:5001/api/health
# Should fail or be blocked ✅
```

---

## 📝 Quick Reference

### Development
- Frontend: `http://tenant1.localhost:5173`
- Backend: `http://localhost:5001`
- Proxy: Vite forwards `/api/*` to backend
- Host preserved: ✅

### Production
- Frontend: `https://tenant1.track-myads.com`
- Backend: `http://localhost:5001` (internal)
- Proxy: NGINX forwards `/api/*` to backend
- Host preserved: ✅

### Key Takeaway
**Port numbers don't matter. Host header does!**

---

**End of Architecture Explanation**
