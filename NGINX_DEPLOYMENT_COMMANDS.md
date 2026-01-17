# Nginx Final Configuration - Deployment Commands

## 🚀 Quick Deployment

### Step 1: Backup Current Config
```bash
sudo cp /etc/nginx/sites-available/track-myads /etc/nginx/sites-available/track-myads.backup.$(date +%Y%m%d_%H%M%S)
```

### Step 2: Copy Final Config
```bash
sudo cp nginx-production-final.conf /etc/nginx/sites-available/track-myads
```

### Step 3: Test Configuration
```bash
sudo nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Step 4: Reload Nginx (NOT restart)
```bash
sudo systemctl reload nginx
```

### Step 5: Verify Status
```bash
sudo systemctl status nginx
```

---

## ✅ Validation Commands

### Test Root Domain
```bash
curl -I https://track-myads.com
# Expected: HTTP/2 200
```

### Test Admin Subdomain
```bash
curl -I https://admin.track-myads.com
# Expected: HTTP/2 200
```

### Test Tenant Subdomains
```bash
curl -I https://ravi.track-myads.com
curl -I https://abhi.track-myads.com
# Expected: HTTP/2 200
```

### Test HTTP Redirect
```bash
curl -I http://track-myads.com
curl -I http://ravi.track-myads.com
# Expected: HTTP/1.1 301 Moved Permanently
# Location: https://...
```

### Test API Endpoints
```bash
curl -H "Host: ravi.track-myads.com" https://ravi.track-myads.com/api/health
# Expected: {"status":"ok"} or similar
```

### Test Tracking Endpoints
```bash
curl -I -H "Host: ravi.track-myads.com" "https://ravi.track-myads.com/click?offer_id=1&pub_id=1"
# Expected: HTTP/2 302 (redirect)
```

### Test Backend Protection
```bash
curl http://127.0.0.1:5001
# Expected: Connection closed / empty response (backend protected ✅)
```

---

## 🔍 Verify Configuration

### Check Server Block Order
```bash
sudo nginx -T | grep -A 2 "server_name"
# Should show:
# 1. track-myads.com www.track-myads.com (root)
# 2. admin.track-myads.com (admin)
# 3. *.track-myads.com (wildcard)
```

### Check SSL Stapling Settings
```bash
sudo nginx -T | grep -A 1 "ssl_stapling"
# Root domain: ssl_stapling on;
# Admin/Tenant: ssl_stapling off;
```

### Check HSTS Headers
```bash
sudo nginx -T | grep "Strict-Transport-Security"
# Root domain: includeSubDomains
# Admin/Tenant: NO includeSubDomains
```

---

## 📋 Configuration Summary

### Root Domain (track-myads.com)
- ✅ SSL stapling: ON
- ✅ HSTS: includeSubDomains (cert matches)
- ✅ ssl_trusted_certificate: Present

### Admin Subdomain (admin.track-myads.com)
- ✅ SSL stapling: OFF
- ✅ HSTS: NO includeSubDomains
- ✅ ssl_trusted_certificate: Removed
- ✅ Proxy headers: $http_host preserved

### Tenant Subdomains (*.track-myads.com)
- ✅ SSL stapling: OFF
- ✅ HSTS: NO includeSubDomains
- ✅ ssl_trusted_certificate: Removed
- ✅ Proxy headers: $http_host preserved

---

## 🎯 Expected Results

- ✅ All domains return HTTP/2 200
- ✅ No 403 errors
- ✅ No redirect loops
- ✅ Backend protected (port 5001)
- ✅ Host headers preserved
- ⚠️ Browser cert warnings on subdomains (expected, acceptable)
