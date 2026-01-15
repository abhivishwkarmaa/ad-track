# Multi-Tenant Architecture Clarification

## 🎯 Core Principle: Host Header, Not Port

### The Golden Rule

**Multi-tenancy depends on the Host header, NOT the port number.**

- ✅ **Host header**: `tenant1.track-myads.com` → Tenant resolved from `tenant1`
- ❌ **Port number**: `:5001` or `:5173` → NOT used for tenant resolution

**Key Understanding**:
- Frontend and backend can run on **different ports**
- Frontend and backend can run on **different servers**
- Tenant resolution works because the **Host header** is preserved through proxies
- The browser sends the Host header based on the URL, not the port

---

## 🏗️ Correct Architecture

### Development Setup

```
┌─────────────────────────────────────────────────────────┐
│                    Browser                              │
│  Visits: tenant1.localhost:5173                        │
│  Host Header: tenant1.localhost                         │
└──────────────────┬──────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Vite Dev Server (:5173)                    │
│  - Serves React frontend                                │
│  - Proxies /api/* → http://localhost:5001              │
│  - Preserves Host header                                │
└──────────────────┬──────────────────────────────────────┘
                  │
                  ▼ (proxy /api/*)
┌─────────────────────────────────────────────────────────┐
│            Fastify Backend (:5001)                      │
│  - Receives: Host: tenant1.localhost                    │
│  - Extracts tenant from Host header                     │
│  - Returns tenant-scoped data                          │
└─────────────────────────────────────────────────────────┘
```

### Production Setup

```
┌─────────────────────────────────────────────────────────┐
│                    Browser                              │
│  Visits: https://tenant1.track-myads.com                   │
│  Host Header: tenant1.track-myads.com                      │
└──────────────────┬──────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│              NGINX (:443)                               │
│  - Serves static frontend files                         │
│  - Proxies /api/* → http://localhost:5001              │
│  - Preserves Host header                                │
└──────┬───────────────────────────────┬──────────────────┘
       │                               │
       ▼                               ▼
┌──────────────┐              ┌──────────────────┐
│  Frontend    │              │  Backend          │
│  (Static)    │              │  (:5001)          │
│              │              │  Receives:        │
│              │              │  Host: tenant1... │
└──────────────┘              └──────────────────┘
```

---

## 🔧 Implementation

### 1. Frontend API Configuration

**File**: `Pulpy_Reporting_Portal_frontend/src/services/api.js`

#### ❌ WRONG (Hardcoded Backend URL):
```javascript
const BASE_URL = 'http://localhost:5001'; // ❌ BAD!
```

#### ✅ CORRECT (Relative Paths):
```javascript
// Use relative paths - works in both dev and prod
const BASE_URL = ''; // Empty = same origin

// Or use environment variable that's empty in production
const BASE_URL = import.meta.env.VITE_API_URL || '';

// API calls use relative paths
apiRequest('/api/auth/login', ...)  // ✅ Works everywhere
```

**Why This Works**:
- Development: Vite proxy forwards `/api/*` to backend
- Production: NGINX proxy forwards `/api/*` to backend
- Host header is preserved in both cases
- No hardcoded URLs needed

---

### 2. Vite Proxy Configuration (Development)

**File**: `Pulpy_Reporting_Portal_frontend/vite.config.js`

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow external access
    // CRITICAL: Proxy API requests to backend
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserve Host header
        secure: false,
        // Don't rewrite the path
      },
      // Also proxy tracking endpoints
      '/click': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserve Host header
        secure: false,
      },
      '/postback': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserve Host header
        secure: false,
      },
      '/imp': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserve Host header
        secure: false,
      },
    },
  },
});
```

**Key Points**:
- `changeOrigin: false` - **CRITICAL** - Preserves the original Host header
- Frontend runs on `:5173`
- Backend runs on `:5001`
- Browser sees `tenant1.localhost:5173`
- Backend receives `Host: tenant1.localhost` (preserved through proxy)

---

### 3. Local Subdomain Setup (Development)

### Option A: Using /etc/hosts (Recommended)

**File**: `/etc/hosts` (macOS/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows)

```
127.0.0.1  localhost
127.0.0.1  tenant1.localhost
127.0.0.1  tenant2.localhost
127.0.0.1  admin.localhost
```

**Usage**:
- Browser: `http://tenant1.localhost:5173`
- Vite serves frontend on `:5173`
- API calls to `/api/*` proxied to `:5001`
- Backend receives `Host: tenant1.localhost`

### Option B: Using mkcert (Better for HTTPS)

```bash
# Install mkcert
brew install mkcert  # macOS
# or: apt install mkcert  # Linux

# Create local CA
mkcert -install

# Generate certificates
mkcert tenant1.localhost tenant2.localhost admin.localhost

# Update vite.config.js to use HTTPS
```

---

### 4. NGINX Configuration (Production)

**File**: `/etc/nginx/sites-available/ad-track` (or similar)

```nginx
# Upstream backend (internal, not exposed)
upstream backend {
    server localhost:5001;
    keepalive 32;
}

# Wildcard server for tenant subdomains
server {
    listen 443 ssl http2;
    server_name *.track-myads.com;

    # SSL certificates (wildcard or individual)
    ssl_certificate /path/to/wildcard.crt;
    ssl_certificate_key /path/to/wildcard.key;

    # Root for frontend static files
    root /var/www/ad-track-frontend/dist;
    index index.html;

    # CRITICAL: Preserve Host header for tenant resolution
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Serve frontend static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://backend;
        # ✅ Host header preserved automatically via proxy_set_header above
    }

    # Proxy tracking endpoints to backend
    location ~ ^/(click|postback|imp)$ {
        proxy_pass http://backend;
        # ✅ Host header preserved
    }

    # Health check (no proxy needed)
    location /health {
        proxy_pass http://backend;
    }
}

# Admin subdomain (stricter rules)
server {
    listen 443 ssl http2;
    server_name admin.track-myads.com;

    ssl_certificate /path/to/admin.crt;
    ssl_certificate_key /path/to/admin.key;

    root /var/www/ad-track-frontend/dist;
    index index.html;

    # Rate limiting for admin
    limit_req_zone $binary_remote_addr zone=admin_limit:10m rate=10r/s;
    limit_req zone=admin_limit burst=20;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://backend;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name *.track-myads.com admin.track-myads.com;
    return 301 https://$host$request_uri;
}
```

**Key Points**:
- Backend runs on `localhost:5001` (NOT exposed publicly)
- NGINX receives `Host: tenant1.track-myads.com`
- NGINX proxies to backend with `Host` header preserved
- Backend extracts tenant from `Host` header
- Frontend served as static files from NGINX

---

## 🤔 Why This Works

### Q: Why can frontend and backend be on different ports?

**A**: Because tenant resolution uses the **Host header**, not the port.

1. Browser makes request to `tenant1.track-myads.com`
2. Browser sends `Host: tenant1.track-myads.com` header
3. NGINX/Vite proxy forwards request to backend
4. Proxy preserves `Host` header (if configured correctly)
5. Backend receives `Host: tenant1.track-myads.com`
6. Backend extracts `tenant1` from Host header
7. Backend scopes data by tenant_id

**The port number is irrelevant** - it's just the transport mechanism.

---

### Q: Why does "same domain" NOT mean "same server or same port"?

**A**: "Same domain" means the **Host header matches**, not the physical server.

**Examples**:
- ✅ `tenant1.track-myads.com` (frontend) → `tenant1.track-myads.com/api` (backend via proxy)
  - Same Host header = same domain
  - Can be different servers, different ports
  
- ❌ `tenant1.track-myads.com` (frontend) → `api.track-myads.com` (backend)
  - Different Host headers = different domains
  - Tenant resolution would fail

**Key Insight**: 
- The browser's **same-origin policy** cares about protocol + host + port
- But for **tenant resolution**, we only care about the **host** (subdomain)
- Proxies allow us to use different ports while preserving the Host header

---

### Q: How does Host header preservation work?

**A**: HTTP proxies forward the original Host header by default, but some rewrite it.

**Correct Proxy Configuration**:
```nginx
# NGINX - Preserves Host automatically
proxy_pass http://backend;
proxy_set_header Host $host;  # Explicitly preserve

# Vite - Must set changeOrigin: false
proxy: {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: false,  # ✅ Preserves original Host
  }
}
```

**What Happens**:
1. Browser: `GET https://tenant1.track-myads.com/api/auth/login`
2. Browser sends: `Host: tenant1.track-myads.com`
3. NGINX receives: `Host: tenant1.track-myads.com`
4. NGINX proxies to: `http://localhost:5001/api/auth/login`
5. NGINX forwards: `Host: tenant1.track-myads.com` (preserved!)
6. Backend receives: `Host: tenant1.track-myads.com`
7. Backend extracts: `tenant1` from Host header ✅

---

## ❌ Common Mistakes to Avoid

### 1. Hardcoding Backend URL in Frontend

**❌ WRONG**:
```javascript
const BASE_URL = 'http://localhost:5001';  // ❌ Breaks in production!
const BASE_URL = 'https://api.track-myads.com';  // ❌ Wrong Host header!
```

**✅ CORRECT**:
```javascript
const BASE_URL = '';  // ✅ Relative paths
// Or
const BASE_URL = import.meta.env.VITE_API_URL || '';  // ✅ Empty in prod
```

**Why**: 
- Hardcoded URLs break in production
- Different Host header breaks tenant resolution
- Relative paths work everywhere

---

### 2. Calling Backend Directly from Browser in Production

**❌ WRONG**:
```javascript
// Frontend calls backend directly
fetch('https://api.track-myads.com/api/auth/login')  // ❌ Wrong Host!
```

**✅ CORRECT**:
```javascript
// Frontend calls via same domain
fetch('/api/auth/login')  // ✅ Preserves Host header
```

**Why**:
- Direct backend calls use wrong Host header
- Tenant resolution fails
- CORS issues may occur

---

### 3. Breaking Host Header During Proxying

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

**Why**:
- `changeOrigin: true` rewrites Host to target URL
- Backend receives `Host: localhost:5001` instead of `tenant1.localhost`
- Tenant resolution fails

---

### 4. Not Setting Host Header in NGINX

**❌ WRONG**:
```nginx
location /api {
    proxy_pass http://backend;
    # ❌ Missing proxy_set_header Host
}
```

**✅ CORRECT**:
```nginx
location /api {
    proxy_pass http://backend;
    proxy_set_header Host $host;  # ✅ Preserve Host
}
```

**Why**:
- Without explicit Host header, NGINX may use upstream name
- Backend receives wrong Host header
- Tenant resolution fails

---

### 5. Using Different Domains for Frontend and Backend

**❌ WRONG**:
- Frontend: `tenant1.track-myads.com`
- Backend: `api.track-myads.com`
- Result: Different Host headers, tenant resolution fails

**✅ CORRECT**:
- Frontend: `tenant1.track-myads.com`
- Backend: `tenant1.track-myads.com/api` (via proxy)
- Result: Same Host header, tenant resolution works

---

## 🔍 Verification Steps

### Development Verification

1. **Check Host Header Preservation**:
```bash
# Start backend with logging
# Make request from frontend
# Check backend logs for Host header

# Should see:
# Host: tenant1.localhost  ✅
# NOT: Host: localhost:5001  ❌
```

2. **Test Tenant Resolution**:
```bash
# Visit: http://tenant1.localhost:5173
# Login or make API call
# Check backend logs for tenant resolution
# Should see: "Tenant resolved: tenant1"
```

3. **Test Different Tenants**:
```bash
# Visit: http://tenant1.localhost:5173 → Should see Tenant 1 data
# Visit: http://tenant2.localhost:5173 → Should see Tenant 2 data
# Verify data isolation
```

### Production Verification

1. **Check NGINX Proxy**:
```bash
# Test API endpoint
curl -H "Host: tenant1.track-myads.com" https://tenant1.track-myads.com/api/health

# Backend should receive: Host: tenant1.track-myads.com
```

2. **Verify Backend Not Exposed**:
```bash
# Backend should NOT be accessible directly
curl http://your-server-ip:5001/api/health
# Should fail or be blocked by firewall ✅
```

3. **Test Tenant Isolation**:
```bash
# As Tenant 1 admin
curl -H "Authorization: Bearer $TENANT1_TOKEN" \
     https://tenant1.track-myads.com/api/admin/publishers
# Should only see Tenant 1 publishers ✅

# As Tenant 2 admin  
curl -H "Authorization: Bearer $TENANT2_TOKEN" \
     https://tenant2.track-myads.com/api/admin/publishers
# Should only see Tenant 2 publishers ✅
```

---

## 📝 Quick Reference

### Development Setup

1. **Add to /etc/hosts**:
```
127.0.0.1 tenant1.localhost
127.0.0.1 tenant2.localhost
127.0.0.1 admin.localhost
```

2. **Update vite.config.js** (see section 2 above)

3. **Update api.js** (use relative paths)

4. **Start servers**:
```bash
# Terminal 1: Backend
cd Pulpy_Reporting_Portal_Backend
npm start  # Runs on :5001

# Terminal 2: Frontend
cd Pulpy_Reporting_Portal_frontend
npm run dev  # Runs on :5173
```

5. **Access**:
- Frontend: `http://tenant1.localhost:5173`
- API calls automatically proxied to `:5001`
- Host header preserved ✅

### Production Setup

1. **Build frontend**:
```bash
cd Pulpy_Reporting_Portal_frontend
npm run build
# Output: dist/ folder
```

2. **Deploy frontend**:
```bash
# Copy dist/ to NGINX root
cp -r dist/* /var/www/ad-track-frontend/
```

3. **Configure NGINX** (see section 4 above)

4. **Start backend**:
```bash
cd Pulpy_Reporting_Portal_Backend
npm start  # Runs on localhost:5001
```

5. **Access**:
- Frontend: `https://tenant1.track-myads.com`
- API: `https://tenant1.track-myads.com/api/*`
- Backend: Internal only (localhost:5001)

---

## 🎯 Summary

### Key Takeaways

1. ✅ **Frontend and backend can be on different ports** - Port doesn't matter for tenant resolution
2. ✅ **Tenant resolution uses Host header** - Not port, not IP, not URL path
3. ✅ **Proxies preserve Host header** - If configured correctly (`changeOrigin: false` in Vite, `proxy_set_header Host` in NGINX)
4. ✅ **Same domain = same Host header** - Not same server or same port
5. ✅ **Use relative paths in frontend** - Never hardcode backend URLs

### Architecture Principle

```
Browser → Frontend (:5173) → Proxy → Backend (:5001)
         (tenant1.localhost)         (Host: tenant1.localhost ✅)
```

The Host header flows through the entire chain, allowing tenant resolution to work regardless of ports or servers.

---

**End of Architecture Clarification**
