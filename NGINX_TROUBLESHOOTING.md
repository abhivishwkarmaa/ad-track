# 🔧 NGINX Troubleshooting Guide - Host Header Issue

## 🚨 Current Issue

Backend still receiving `Host: backend` instead of `Host: abhi.track-myads.com`

## 🔍 Diagnostic Steps

### 1. Verify NGINX Config File Location

On VPS, check which config file is actually being used:

```bash
# Check main NGINX config
sudo nginx -T | grep "include"

# Check which config files are loaded
ls -la /etc/nginx/sites-enabled/
ls -la /etc/nginx/conf.d/

# Check if our config is being used
sudo nginx -T | grep "server_name.*track-myads"
```

### 2. Verify Config Syntax

```bash
# Test config syntax
sudo nginx -t

# If syntax error, fix it
# If OK, reload
sudo nginx -s reload
```

### 3. Check Active NGINX Config

```bash
# See actual config being used
sudo nginx -T | grep -A 20 "location /api"
```

### 4. Test Headers Directly

```bash
# Test from VPS itself
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1/api/health

# Check what headers backend receives
# Should see: Host: abhi.track-myads.com
```

### 5. Check NGINX Error Logs

```bash
# Check for errors
sudo tail -f /var/log/nginx/error.log

# Check access logs
sudo tail -f /var/log/nginx/access.log
```

## 🔧 Possible Issues & Fixes

### Issue 1: Wrong Config File Being Used

**Symptom**: Changes not taking effect

**Fix**:
```bash
# Find actual config file
sudo nginx -T | grep "server_name.*track-myads"

# Update the correct file
# Or create symlink if using sites-available/sites-enabled
sudo ln -s /path/to/nginx-production.conf /etc/nginx/sites-enabled/track-myads
```

### Issue 2: Config Not Reloaded

**Symptom**: Old behavior persists

**Fix**:
```bash
# Test config
sudo nginx -t

# Reload (graceful)
sudo nginx -s reload

# Or restart (hard)
sudo systemctl restart nginx
```

### Issue 3: Multiple Config Files Conflict

**Symptom**: Headers set in one file, overridden in another

**Fix**:
```bash
# Check all config files
sudo nginx -T | grep "proxy_set_header Host"

# Should only see our explicit settings
# If multiple, remove conflicting ones
```

### Issue 4: Upstream Name Interference

**Symptom**: Host always shows "backend"

**Fix**: Ensure headers are set BEFORE proxy_pass:
```nginx
location /api {
    # Headers FIRST
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    
    # Then proxy_pass
    proxy_pass http://backend;
}
```

## ✅ Verification Commands

### On VPS:

```bash
# 1. Check config syntax
sudo nginx -t

# 2. Reload NGINX
sudo nginx -s reload

# 3. Test from VPS
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1/api/health

# 4. Check backend logs
# Should see: host: 'abhi.track-myads.com' ✅
```

### From Browser:

1. Open: `http://abhi.track-myads.com/login`
2. Open DevTools → Network
3. Check request headers
4. Should see: `Host: abhi.track-myads.com` ✅

## 🎯 Expected Behavior After Fix

**Backend Logs Should Show:**
```
==== DEBUG HOST HEADERS ====
{
  host: 'abhi.track-myads.com', ✅
  xForwardedHost: 'abhi.track-myads.com', ✅
  hostname: 'abhi.track-myads.com', ✅
  ...
}
============================
Tenant resolved: abhi (ID: 1) ✅
```

## 🚨 If Still Not Working

1. **Check if different NGINX config is active**
2. **Verify config file path on VPS**
3. **Check for NGINX includes that might override**
4. **Test with direct curl to backend (bypass NGINX)**
5. **Check if PM2/process manager is caching old config**
