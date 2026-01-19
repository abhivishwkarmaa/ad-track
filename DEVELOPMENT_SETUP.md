# Development Setup Guide

## Quick Start

### 1. Configure Local Subdomains

**macOS/Linux**: Edit `/etc/hosts`
**Windows**: Edit `C:\Windows\System32\drivers\etc\hosts`

Add these lines:
```
127.0.0.1  localhost
127.0.0.1  tenant1.localhost
127.0.0.1  tenant2.localhost
127.0.0.1  admin.localhost
```

### 2. Start Backend

```bash
cd Pulpy_Reporting_Portal_Backend
npm install
npm start
# Backend runs on http://localhost:5001
```

### 3. Start Frontend

```bash
cd Pulpy_Reporting_Portal_frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

### 4. Access Application

- **Tenant 1**: http://tenant1.localhost:5173
- **Tenant 2**: http://tenant2.localhost:5173
- **Admin Panel**: http://admin.localhost:5173

## How It Works

1. Browser visits `tenant1.localhost:5173`
2. Browser sends `Host: tenant1.localhost` header
3. Vite dev server serves React frontend
4. Frontend makes API call to `/api/auth/login`
5. Vite proxy forwards to `http://localhost:5001/api/auth/login`
6. **Host header is preserved**: Backend receives `Host: tenant1.localhost`
7. Backend extracts `tenant1` from Host header
8. Backend returns tenant-scoped data

## Verification

### Check Host Header Preservation

1. Open browser DevTools → Network tab
2. Make an API call (e.g., login)
3. Check the request - should show `Host: tenant1.localhost`
4. Check backend logs - should show tenant resolution

### Test Tenant Isolation

1. Create test data for tenant1
2. Visit `tenant1.localhost:5173` - should see tenant1 data
3. Visit `tenant2.localhost:5173` - should NOT see tenant1 data
4. Verify data isolation works

## Troubleshooting

### Issue: "Tenant not found" error

**Solution**: 
- Check `/etc/hosts` file has correct entries
- Restart browser after editing hosts file
- Verify you're using `tenant1.localhost:5173` not `localhost:5173`

### Issue: API calls fail

**Solution**:
- Verify backend is running on port 5001
- Check Vite proxy configuration in `vite.config.js`
- Verify `changeOrigin: false` is set

### Issue: CORS errors

**Solution**:
- Should not happen with proxy setup
- If occurs, check backend CORS configuration
- Verify frontend uses relative paths (`/api/*` not `http://localhost:5001/api/*`)

## Environment Variables

### Frontend (.env)

```bash
# Leave empty for relative paths (recommended)
VITE_API_URL=

# Or use for custom backend URL (development only)
# VITE_API_URL=http://localhost:5001
```

### Backend (.env)

```bash
PORT=5001
HOST=0.0.0.0
NODE_ENV=development

# Database
DB_HOST=your-db-host
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Secrets
ADMIN_JWT_SECRET=your-admin-secret
TENANT_JWT_SECRET=your-tenant-secret
JWT_SECRET=your-legacy-secret  # For backward compatibility
```
