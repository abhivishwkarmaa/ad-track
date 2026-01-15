# Production Deployment Guide

## Architecture Overview

```
Internet
   │
   ▼
NGINX (:443) ← SSL Termination
   │
   ├─→ Static Files (Frontend)
   │   /var/www/ad-track-frontend/dist
   │
   └─→ Proxy /api/* → Backend (:5001)
       Backend receives: Host: tenant1.track-myads.com ✅
```

## Deployment Steps

### Step 1: Build Frontend

```bash
cd Pulpy_Reporting_Portal_frontend
npm install
npm run build
# Output: dist/ folder
```

### Step 2: Deploy Frontend Files

```bash
# Copy built files to NGINX root
sudo mkdir -p /var/www/ad-track-frontend
sudo cp -r dist/* /var/www/ad-track-frontend/
sudo chown -R www-data:www-data /var/www/ad-track-frontend
```

### Step 3: Configure NGINX

```bash
# Copy NGINX config
sudo cp nginx-production.conf /etc/nginx/sites-available/ad-track

# Create symlink
sudo ln -s /etc/nginx/sites-available/ad-track /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload NGINX
sudo systemctl reload nginx
```

### Step 4: Set Up SSL Certificates

```bash
# Using Let's Encrypt (recommended)
sudo certbot --nginx -d "*.track-myads.com" -d "admin.track-myads.com"

# Or use your own wildcard certificate
sudo cp wildcard.crt /etc/ssl/certs/ad-track-wildcard.crt
sudo cp wildcard.key /etc/ssl/private/ad-track-admin.key
sudo chmod 600 /etc/ssl/private/ad-track-*.key
```

### Step 5: Configure Backend

```bash
cd Pulpy_Reporting_Portal_Backend

# Set environment variables
export PORT=5001
export HOST=0.0.0.0
export NODE_ENV=production
export ADMIN_JWT_SECRET="your-super-secure-admin-secret"
export TENANT_JWT_SECRET="your-super-secure-tenant-secret"

# Start backend (use PM2 or systemd)
pm2 start src/server.js --name ad-track-backend
# Or
sudo systemctl start ad-track-backend
```

### Step 6: Configure Firewall

```bash
# Allow HTTPS (443)
sudo ufw allow 443/tcp

# Allow HTTP (80) for Let's Encrypt
sudo ufw allow 80/tcp

# Block direct backend access (port 5001)
sudo ufw deny 5001/tcp

# Enable firewall
sudo ufw enable
```

### Step 7: Configure DNS

**DNS Records** (at your DNS provider):
```
Type: A
Name: *
Value: your-server-ip
TTL: 3600

Type: A
Name: admin
Value: your-server-ip
TTL: 3600
```

**Wildcard DNS**:
- `*.track-myads.com` → your-server-ip
- `admin.track-myads.com` → your-server-ip

## Verification

### 1. Test Frontend

```bash
curl -I https://tenant1.track-myads.com
# Should return 200 OK
```

### 2. Test API Proxy

```bash
curl -H "Host: tenant1.track-myads.com" https://tenant1.track-myads.com/api/health
# Should return: {"status":"ok",...}
```

### 3. Test Tenant Resolution

```bash
# Check backend logs
# Should see: "Tenant resolved: tenant1"
```

### 4. Verify Backend Not Exposed

```bash
# This should fail or be blocked
curl http://your-server-ip:5001/api/health
```

## Monitoring

### Check NGINX Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Check Backend Logs

```bash
# PM2 logs
pm2 logs ad-track-backend

# Or systemd
sudo journalctl -u ad-track-backend -f
```

## Maintenance

### Update Frontend

```bash
cd Pulpy_Reporting_Portal_frontend
git pull
npm install
npm run build
sudo cp -r dist/* /var/www/ad-track-frontend/
```

### Update Backend

```bash
cd Pulpy_Reporting_Portal_Backend
git pull
npm install
pm2 restart ad-track-backend
# Or
sudo systemctl restart ad-track-backend
```

## Troubleshooting

### Issue: 502 Bad Gateway

**Cause**: Backend not running or not accessible

**Solution**:
```bash
# Check backend status
pm2 status
# Or
sudo systemctl status ad-track-backend

# Check backend logs
pm2 logs ad-track-backend
```

### Issue: Tenant Not Found

**Cause**: Host header not preserved

**Solution**:
- Verify NGINX config has `proxy_set_header Host $host;`
- Check backend logs for received Host header
- Verify DNS is configured correctly

### Issue: SSL Certificate Errors

**Cause**: Certificate not configured or expired

**Solution**:
```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Check certificate
sudo certbot certificates
```

---

**End of Production Deployment Guide**
