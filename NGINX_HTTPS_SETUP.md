# Nginx HTTPS Production Setup - Complete Guide

## File Path
```
/etc/nginx/sites-available/track-myads
```

## Step 1: Backup Current Config
```bash
sudo cp /etc/nginx/sites-available/track-myads /etc/nginx/sites-available/track-myads.backup
```

## Step 2: Copy New Config
```bash
sudo cp nginx-production-https.conf /etc/nginx/sites-available/track-myads
```

## Step 3: Verify Certificate Paths
```bash
# Check if Let's Encrypt certificates exist
sudo ls -la /etc/letsencrypt/live/track-myads.com/

# Expected files:
# - fullchain.pem
# - privkey.pem
# - chain.pem
```

**If certificates are in different location, update paths in config:**
```bash
sudo nano /etc/nginx/sites-available/track-myads
# Update ssl_certificate paths to match your certificate location
```

## Step 4: Test Nginx Configuration
```bash
sudo nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

## Step 5: Reload Nginx
```bash
sudo systemctl reload nginx
```

## Step 6: Verify Nginx Status
```bash
sudo systemctl status nginx
```

## Step 7: Test HTTPS Endpoints

### Test Root Domain
```bash
curl -I https://track-myads.com
```

### Test Admin Subdomain
```bash
curl -I https://admin.track-myads.com
```

### Test Tenant Subdomain
```bash
curl -I https://ravi.track-myads.com
curl -I https://abhi.track-myads.com
```

### Test HTTP Redirect
```bash
curl -I http://track-myads.com
# Should return: HTTP/1.1 301 Moved Permanently
# Location: https://track-myads.com/
```

### Test API Endpoint
```bash
curl -H "Host: ravi.track-myads.com" https://ravi.track-myads.com/api/health
```

### Test Tracking Endpoint
```bash
curl -H "Host: ravi.track-myads.com" "https://ravi.track-myads.com/click?offer_id=1&pub_id=1"
```

## Step 8: Verify SSL Certificate
```bash
# Check certificate details
openssl s_client -connect track-myads.com:443 -servername track-myads.com < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject

# Check certificate for subdomain
openssl s_client -connect ravi.track-myads.com:443 -servername ravi.track-myads.com < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject
```

## Step 9: Check Nginx Logs
```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

## Troubleshooting

### Issue: 403 Forbidden
```bash
# Check file permissions
sudo ls -la /var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist
sudo chown -R www-data:www-data /var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist
sudo chmod -R 755 /var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist
```

### Issue: SSL Certificate Not Found
```bash
# List all Let's Encrypt certificates
sudo certbot certificates

# If certificate doesn't exist, obtain it:
sudo certbot certonly --nginx -d "*.track-myads.com" -d "track-myads.com" -d "admin.track-myads.com"
```

### Issue: Wildcard Subdomain Not Working
```bash
# Verify DNS records
dig ravi.track-myads.com
dig abhi.track-myads.com

# Check Nginx is listening on 443
sudo netstat -tlnp | grep :443
```

### Issue: Backend Not Responding
```bash
# Test backend directly
curl http://127.0.0.1:5001/health

# Check if Node.js app is running
pm2 list
# or
ps aux | grep node
```

## Certificate Renewal Setup

### Auto-renewal (Let's Encrypt)
```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot auto-renewal is usually set up automatically
# Check cron job:
sudo crontab -l | grep certbot
```

### Manual Renewal
```bash
sudo certbot renew
sudo systemctl reload nginx
```

## Firewall Configuration
```bash
# Allow HTTPS
sudo ufw allow 443/tcp

# Allow HTTP (for redirects and Let's Encrypt)
sudo ufw allow 80/tcp

# Block direct backend access
sudo ufw deny 5001/tcp
```

## Final Verification Checklist

- [ ] Nginx config syntax is valid (`nginx -t`)
- [ ] Nginx reloaded successfully
- [ ] HTTPS works on root domain
- [ ] HTTPS works on admin subdomain
- [ ] HTTPS works on tenant subdomains
- [ ] HTTP redirects to HTTPS
- [ ] SSL certificate is valid
- [ ] Backend API responds correctly
- [ ] Tracking endpoints work
- [ ] No 403 errors
- [ ] Host headers preserved correctly

## Quick Reference Commands

```bash
# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Restart Nginx (if reload fails)
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# View logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Test endpoints
curl -I https://track-myads.com
curl -I https://ravi.track-myads.com
curl -I https://abhi.track-myads.com
```
