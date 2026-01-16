# 🚨 CRITICAL: VPS NGINX Config Must Be Updated

## ⚠️ Current Status

Backend is still receiving `Host: backend` instead of `Host: abhi.track-myads.com`

**This means**: NGINX config on VPS is **NOT updated** or **NOT reloaded**

---

## ✅ IMMEDIATE ACTION REQUIRED ON VPS

### Step 1: Verify Current Config on VPS

```bash
# SSH into VPS
ssh user@your-vps-ip

# Check what config is actually active
sudo nginx -T | grep -A 15 "location /api" | head -20

# Should see our updated config with $forwarded_host
# If you see old config, it's not updated
```

### Step 2: Update Config File on VPS

**Option A: If using Git (Recommended)**

```bash
# Pull latest code
cd /path/to/project
git pull origin v3

# Find where NGINX config should be
# Usually one of these:
# /etc/nginx/sites-available/
# /etc/nginx/conf.d/
# /etc/nginx/nginx.conf (if included)

# Copy updated config
sudo cp nginx-production.conf /etc/nginx/sites-available/track-myads
# Or
sudo cp nginx-production.conf /etc/nginx/conf.d/track-myads.conf
```

**Option B: Manual Edit**

```bash
# Find the active config file
sudo nginx -T | grep "server_name.*track-myads" -B 5

# Edit that file
sudo nano /path/to/active/config/file

# Replace location /api blocks with our updated version
# Key change: Use $http_host instead of $host
```

### Step 3: Test Config Syntax

```bash
# Test syntax
sudo nginx -t

# Must see:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**If error**: Fix syntax errors before proceeding

### Step 4: Reload NGINX

```bash
# Graceful reload
sudo nginx -s reload

# Or hard restart
sudo systemctl restart nginx

# Verify it's running
sudo systemctl status nginx
```

### Step 5: Verify Fix

```bash
# Test from VPS
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1/api/health

# Check backend logs
# Should now see:
# host: 'abhi.track-myads.com' ✅
# xForwardedHost: 'abhi.track-myads.com' ✅
```

---

## 🔑 Key Change in Config

**Before (Not Working):**
```nginx
proxy_set_header Host $host;  # ❌ Gets processed/rewritten
```

**After (Fixed):**
```nginx
set $forwarded_host $http_host;  # ✅ Original Host from browser
if ($forwarded_host = "") {
    set $forwarded_host $host;
}
proxy_set_header Host $forwarded_host;  # ✅ Use original
```

**Why This Works:**
- `$http_host` = Exact Host header from HTTP request (browser)
- `$host` = Processed version (might be rewritten by NGINX)
- Using `$http_host` ensures we get the original domain

---

## 🚨 If Still Not Working

### Check 1: Verify Config is Active

```bash
# See full active config
sudo nginx -T > /tmp/nginx-full.txt
grep -A 20 "location /api" /tmp/nginx-full.txt

# Should see: set $forwarded_host $http_host;
# If not, config not updated
```

### Check 2: Multiple Config Files

```bash
# Check all config files
sudo find /etc/nginx -name "*.conf" -exec grep -l "track-myads" {} \;

# If multiple, check which one is loaded
sudo nginx -T | grep "server_name.*track-myads"
```

### Check 3: NGINX Includes

```bash
# Check main nginx.conf
sudo cat /etc/nginx/nginx.conf | grep include

# Should include sites-enabled or conf.d
# If not, add it or update the correct file
```

### Check 4: Test Backend Directly

```bash
# Bypass NGINX - test backend directly
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1:5001/api/health

# If this works, issue is in NGINX
# If this fails, issue is in backend
```

---

## ✅ Success Indicators

After fix, backend logs should show:

```
==== DEBUG HOST HEADERS ====
{
  host: 'abhi.track-myads.com', ✅
  xForwardedHost: 'abhi.track-myads.com', ✅
  hostname: 'abhi.track-myads.com', ✅
}
============================
Tenant resolved: abhi (ID: 1) ✅
[LOGIN] Login successful ✅
```

---

## 📝 Quick Command Reference

```bash
# 1. Check active config
sudo nginx -T | grep -A 15 "location /api"

# 2. Update config (if using git)
git pull origin v3
sudo cp nginx-production.conf /etc/nginx/sites-available/track-myads

# 3. Test syntax
sudo nginx -t

# 4. Reload
sudo nginx -s reload

# 5. Test
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1/api/health
```

---

**CRITICAL**: The config file on VPS **MUST** be updated and NGINX **MUST** be reloaded for this to work!
