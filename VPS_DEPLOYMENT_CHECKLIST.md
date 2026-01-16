# 🚨 VPS DEPLOYMENT CHECKLIST - Host Header Fix

## ⚠️ CRITICAL: Backend Still Receiving `Host: backend`

If backend logs show `host: 'backend'`, follow these steps:

---

## ✅ STEP 1: Verify NGINX Config File on VPS

**Check which config file is actually being used:**

```bash
# SSH into VPS
ssh user@your-vps-ip

# Check main NGINX config location
sudo nginx -T | grep "include"

# Check which config files exist
ls -la /etc/nginx/sites-enabled/
ls -la /etc/nginx/conf.d/
ls -la /etc/nginx/nginx.conf

# Find our config
sudo find /etc/nginx -name "*track-myads*" -o -name "*nginx-production*"
```

**Expected**: Should find the config file we're editing

**If not found**: Config file might be in different location or named differently

---

## ✅ STEP 2: Verify Config is Active

**Check if our config is actually loaded:**

```bash
# Check active server blocks
sudo nginx -T | grep -A 5 "server_name.*track-myads"

# Should see:
# server_name *.track-myads.com;
# server_name admin.track-myads.com;
```

**If not found**: Config file not included in main NGINX config

---

## ✅ STEP 3: Update Config on VPS

**Option A: If using Git (Recommended)**

```bash
# On VPS
cd /path/to/project
git pull origin v3

# Copy config to NGINX location
sudo cp nginx-production.conf /etc/nginx/sites-available/track-myads
sudo ln -sf /etc/nginx/sites-available/track-myads /etc/nginx/sites-enabled/

# Or if using conf.d
sudo cp nginx-production.conf /etc/nginx/conf.d/track-myads.conf
```

**Option B: Manual Copy**

```bash
# Copy config file
sudo nano /etc/nginx/sites-available/track-myads
# Paste our nginx-production.conf content
# Save and exit

# Enable it
sudo ln -sf /etc/nginx/sites-available/track-myads /etc/nginx/sites-enabled/
```

---

## ✅ STEP 4: Test Config Syntax

```bash
# Test syntax
sudo nginx -t

# Should see:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**If error**: Fix syntax errors before proceeding

---

## ✅ STEP 5: Reload NGINX

```bash
# Graceful reload (recommended)
sudo nginx -s reload

# Or restart (if reload doesn't work)
sudo systemctl restart nginx

# Verify NGINX is running
sudo systemctl status nginx
```

---

## ✅ STEP 6: Verify Headers from VPS

**Test directly from VPS:**

```bash
# Test API endpoint
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1/api/health

# Check backend logs
# Should see: host: 'abhi.track-myads.com' ✅
```

**If still shows `host: 'backend'`**: Config not applied or wrong file

---

## ✅ STEP 7: Check for Conflicting Configs

**Check if other configs are overriding:**

```bash
# Check all proxy_set_header directives
sudo nginx -T | grep "proxy_set_header Host"

# Should see our explicit settings
# If multiple, check which one is last (wins)
```

---

## ✅ STEP 8: Verify from Browser

1. Open: `http://abhi.track-myads.com/login`
2. Open DevTools → Network tab
3. Check request headers
4. Should see: `Host: abhi.track-myads.com` ✅

---

## 🔍 Debug Commands

### Check Active Config:

```bash
# See full active config
sudo nginx -T > /tmp/nginx-full-config.txt
grep -A 30 "location /api" /tmp/nginx-full-config.txt
```

### Check NGINX Logs:

```bash
# Error log
sudo tail -f /var/log/nginx/error.log

# Access log
sudo tail -f /var/log/nginx/access.log
```

### Test Backend Directly (Bypass NGINX):

```bash
# Test if backend works without NGINX
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1:5001/api/health

# If this works, issue is in NGINX config
# If this fails, issue is in backend
```

---

## 🚨 Common Issues

### Issue 1: Config File Not Included

**Symptom**: Changes not taking effect

**Fix**:
```bash
# Check main nginx.conf
sudo cat /etc/nginx/nginx.conf | grep include

# Should include sites-enabled or conf.d
# If not, add:
# include /etc/nginx/sites-enabled/*;
```

### Issue 2: Multiple Config Files

**Symptom**: Headers set in one file, overridden in another

**Fix**:
```bash
# List all config files
sudo ls -la /etc/nginx/sites-enabled/
sudo ls -la /etc/nginx/conf.d/

# Remove or disable conflicting ones
sudo rm /etc/nginx/sites-enabled/old-config
```

### Issue 3: NGINX Cache

**Symptom**: Old behavior persists after reload

**Fix**:
```bash
# Hard restart
sudo systemctl restart nginx

# Or kill and restart
sudo pkill nginx
sudo nginx
```

---

## ✅ Success Criteria

After following all steps, backend logs should show:

```
==== DEBUG HOST HEADERS ====
{
  host: 'abhi.track-myads.com', ✅
  xForwardedHost: 'abhi.track-myads.com', ✅
  hostname: 'abhi.track-myads.com', ✅
}
============================
Tenant resolved: abhi (ID: 1) ✅
```

---

## 📝 Quick Reference

```bash
# 1. Find config
sudo nginx -T | grep "server_name.*track-myads"

# 2. Test syntax
sudo nginx -t

# 3. Reload
sudo nginx -s reload

# 4. Test
curl -v -H "Host: abhi.track-myads.com" http://127.0.0.1/api/health

# 5. Check logs
# Backend should show correct host ✅
```

---

**If still not working after all steps, the issue is likely:**
1. Wrong config file being used
2. Config not included in main nginx.conf
3. Multiple configs conflicting
4. NGINX not reloaded properly
