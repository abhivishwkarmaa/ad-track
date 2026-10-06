# Production Deployment Guide: Pulpy / Ad-Track Platform

Complete step-by-step production deployment guide for deploying the **Frontend (React + Vite)**, **Backend (Fastify + PM2 Cluster + Workers)**, **MySQL & Redis**, **Nginx Reverse Proxy**, and **Certbot SSL (Wildcard / HTTPS)**.

---

## Architecture Overview

```
                      [ Client / Traffic / Web / Postback ]
                                       │
                                       ▼
                       [ Nginx (Port 80 / 443 SSL) ]
                        ├── *.yourdomain.com (Tenants)
                        ├── admin.yourdomain.com (Admin Portal)
                        └── yourdomain.com (Portfolio / Landing)
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
          Static Assets                                Reverse Proxy
     (/dist - React SPA)                       (http://127.0.0.1:5001)
                 │                                           │
                 ▼                                           ▼
      Pulpy_Reporting_Portal_frontend              Fastify Backend (PM2)
                                                 ┌───────────┴───────────┐
                                                 │   Pulpy API (Cluster) │
                                                 │   click-worker        │
                                                 │   stats-worker        │
                                                 │   reporting-stats     │
                                                 │   conversion-worker   │
                                                 │   redis-cleanup       │
                                                 │   hygiene-worker      │
                                                 └───────────┬───────────┘
                                                             │
                                                    ┌────────┴────────┐
                                                    ▼                 ▼
                                               MySQL 8.0          Redis 7.x
```

---

## 1. Server Prerequisites & System Packages

### 1.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw software-properties-common
```

### 1.2 Install Node.js (v20+ LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Expected: v20.x or higher
npm -v
```

### 1.3 Install PM2 Globally

```bash
sudo npm install -g pm2
sudo pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
```

### 1.4 Install MySQL 8.0 & Redis

```bash
sudo apt install -y mysql-server redis-server

# Enable and start services
sudo systemctl enable mysql && sudo systemctl start mysql
sudo systemctl enable redis-server && sudo systemctl start redis-server

# Verify Redis
redis-cli ping # Output: PONG
```

### 1.5 Install Nginx & Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx && sudo systemctl start nginx
```

### 1.6 Configure UFW Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full' # Opens port 80 & 443
sudo ufw --force enable
sudo ufw status
```

---

## 2. Directory Setup & Project Clone

We use `/var/www/ad-track` to match the production Nginx configuration.

```bash
sudo mkdir -p /var/www/ad-track
sudo chown -R $USER:$USER /var/www/ad-track

# Clone your repository
git clone <YOUR_GIT_REPO_URL> /var/www/ad-track
cd /var/www/ad-track
```

Directory structure should look like:

```
/var/www/ad-track/
├── Pulpy_Reporting_Portal_Backend/
├── Pulpy_Reporting_Portal_frontend/
├── nginx-production-final.conf
├── deploy-restart.sh
```

---

## 3. Database Setup (MySQL)

### 3.1 Create Database and User

Log in to MySQL:

```bash
sudo mysql
```

Run SQL commands:

```sql
CREATE DATABASE IF NOT EXISTS pulpy_reporting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'pulpy_user'@'localhost' IDENTIFIED BY 'StrongPassword123!@#';
GRANT ALL PRIVILEGES ON pulpy_reporting.* TO 'pulpy_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3.2 Import Schema / Migrations

If you have a SQL dump or migration scripts:

```bash
mysql -u pulpy_user -p pulpy_reporting < /path/to/schema.sql
```

---

## 4. Backend Configuration & PM2 Startup

### 4.1 Backend Environment Variables

Create `.env` inside the backend directory:

```bash
cd /var/www/ad-track/Pulpy_Reporting_Portal_Backend
nano .env
```

Paste your production variables:

```env
# Server
PORT=5001
HOST=0.0.0.0
NODE_ENV=production

# Database (MySQL)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pulpy_reporting
DB_USER=pulpy_user
DB_PASSWORD=StrongPassword123!@#

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Security & URLs
JWT_SECRET=super_secret_production_key_change_this_random_string_64chars
JWT_EXPIRES_IN=7d
BASE_URL=https://admin.yourdomain.com
TRACKING_DOMAIN=https://yourdomain.com

# Logging & Rollup
LOG_LEVEL=info
```

### 4.2 Install Backend Dependencies

```bash
cd /var/www/ad-track/Pulpy_Reporting_Portal_Backend
npm install --omit=dev
mkdir -p logs
```

### 4.3 Start All Services with PM2

The backend includes `ecosystem.config.cjs` which starts the API cluster (port 5001) and all 6 asynchronous workers:

```bash
cd /var/www/ad-track/Pulpy_Reporting_Portal_Backend

# Start all processes using the ecosystem configuration
pm2 start ecosystem.config.cjs --env production

# Check processes status
pm2 status

# Save PM2 state and configure systemd startup on server reboot
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
```

Test that the backend is responding locally:

```bash
curl -I http://127.0.0.1:5001/health
```

---

## 5. Frontend Build

### 5.1 Install & Build Frontend

```bash
cd /var/www/ad-track/Pulpy_Reporting_Portal_frontend
npm install
npm run build
```

This generates the production bundle inside:
`/var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist`

---

---

## 6. SSL Certificate Setup (Fixing the "Not Secure" Subdomain Error Forever)

> [!CAUTION]
> ### Why subdomains show "Not Secure" (Common Developer Mistakes)
>
> 1. **Running standard `sudo certbot --nginx`:** This ONLY secures `yourdomain.com` and `www.yourdomain.com`. It **CANNOT** issue a wildcard certificate. When a browser visits `tenant1.yourdomain.com`, Nginx serves the root certificate, causing browser mismatch: `SSL_ERROR_BAD_CERT_DOMAIN` ("Not Secure").
> 2. **Missing Wildcard DNS Record (`*`):** If your DNS provider does not have an `A` record for `*`, subdomains either don't resolve or route unpredictably.
> 3. **Using `cert.pem` instead of `fullchain.pem` in Nginx:** Without the full chain, intermediate certificate authorities fail, causing mobile/desktop browsers to flag the connection as untrusted.
> 4. **Cloudflare "Flexible" SSL:** If Cloudflare proxy is enabled with "Flexible" mode, requests to the origin are unencrypted or cause infinite redirect loops. Mode MUST be set to **Full** or **Full (Strict)**.

---

### Step 6.0: Add Wildcard DNS Records (Mandatory)

Before running Certbot or Nginx, go to your DNS manager (Cloudflare / GoDaddy / Namecheap / Route53) and verify two `A` records:

| Type  | Name  | Content / Target     | Proxy Status (Cloudflare) |
| ----- | ----- | -------------------- | ------------------------- |
| `A` | `@` | `<YOUR_SERVER_IP>` | DNS Only (or Proxied)     |
| `A` | `*` | `<YOUR_SERVER_IP>` | DNS Only (or Proxied)     |

> ⚠️ **Note on `*` record:** This wildcard `A` record ensures that *any* subdomain (`pulpy.yourdomain.com`, `admin.yourdomain.com`, `xyz.yourdomain.com`) automatically points to your VPS IP without creating records manually for every new tenant.

---

### Step 6.1: Issue a TRUE Wildcard Certificate (DNS-01 Challenge)

Let's Encrypt requires a **DNS-01 ACME challenge** for wildcard domains (`*.yourdomain.com`). Standard HTTP-01 challenge will fail.

Run the following command on your VPS:

```bash
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  --server https://acme-v02.api.letsencrypt.org/directory \
  -d "yourdomain.com" \
  -d "*.yourdomain.com"
```

#### What happens next:

1. Certbot will ask for your email and prompt:
   ```text
   Please deploy a DNS TXT record under the name:
   _acme-challenge.yourdomain.com
   with the following value:
   dGhpc19pc19hX3NhbXBsZV90b2tlbl9mb3JfZGVtbw==
   ```
2. **DO NOT press Enter yet!**
3. Open your DNS provider dashboard (e.g., Cloudflare, GoDaddy, Namecheap).
4. Add a new DNS record:
   - **Type:** `TXT`
   - **Name:** `_acme-challenge` (or `_acme-challenge.yourdomain.com`)
   - **Content / Value:** Paste the token string provided by Certbot.
   - **TTL:** Auto (or 1 minute / 60 seconds).
5. If Certbot asks for a second TXT record (for the root domain vs wildcard domain), add both TXT entries under the same `_acme-challenge` host.
6. Verify DNS propagation in a separate terminal:
   ```bash
   dig +short TXT _acme-challenge.yourdomain.com
   # or
   nslookup -type=TXT _acme-challenge.yourdomain.com
   ```
7. Once the record shows your token, go back to the Certbot terminal and press **Enter**.
8. Success! You will see:
   ```text
   Successfully received certificate.
   Certificate is saved at: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
   Key is saved at:         /etc/letsencrypt/live/yourdomain.com/privkey.pem
   ```

---

### Step 6.2: Verify the Certificate Covers Subdomains (SAN Check)

Run this command to inspect your certificate:

```bash
sudo certbot certificates
```

Look at the output:

```text
  Certificate Name: yourdomain.com
    Domains: yourdomain.com *.yourdomain.com   <--- BOTH MUST BE LISTED!
    Expiry Date: ...
    Certificate Path: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

If you see `*.yourdomain.com` listed under `Domains:`, **every single subdomain will now show Secure 🔒 (Green Padlock)**!

---

### Step 6.3: Generate Diffie-Hellman Parameters

```bash
sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
```

---

### Step 6.4: Cloudflare SSL Settings (If using Cloudflare)

If you manage your DNS via Cloudflare and orange-cloud proxy is active:

1. Go to **SSL/TLS** -> **Overview**.
2. Select encryption mode: **Full** or **Full (Strict)**. *(Never use "Flexible", it triggers HTTPS redirect loops and mixed-content insecure warnings)*.
3. Under **SSL/TLS** -> **Edge Certificates**, turn **Always Use HTTPS** to **ON**.

---

## 7. Nginx Configuration

### 7.1 Create Nginx Virtual Host

```bash
sudo nano /etc/nginx/sites-available/ad-track.conf
```

Paste the following configuration (replace `yourdomain.com` with your actual domain):

```nginx
# ---------------- RATE LIMIT ZONES ----------------
limit_req_zone $binary_remote_addr zone=portfolio_limit:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=admin_limit:10m rate=10r/s;
limit_req_zone $host               zone=tenant_api_limit:10m rate=50r/s;
limit_req_zone $host               zone=tenant_tracking_limit:20m rate=1000r/s;

# ---------------- BACKEND UPSTREAM ----------------
upstream backend {
    server 127.0.0.1:5001;
    keepalive 32;
}

# ============================================================
# HTTP → HTTPS REDIRECTS (Preserving exact hostnames)
# ============================================================
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://yourdomain.com$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name *.yourdomain.com;
    return 301 https://$host$request_uri;
}

# ============================================================
# ROOT DOMAIN — LANDING / PORTFOLIO
# ============================================================
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist;
    index index.html;

    limit_req zone=portfolio_limit burst=100 nodelay;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        proxy_set_header Host              $http_host;
        proxy_set_header X-Forwarded-Host  $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}

# ============================================================
# ADMIN SUBDOMAIN — admin.yourdomain.com
# ============================================================
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name admin.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist;
    index index.html;

    limit_req zone=admin_limit burst=20 nodelay;

    # SPA shell: Don't cache index.html
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }

    # Vite hashed assets: Safe to cache for 1 year
    location ^~ /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        proxy_set_header Host              $http_host;
        proxy_set_header X-Forwarded-Host  $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}

# ============================================================
# TENANT SUBDOMAINS — *.yourdomain.com
# ============================================================
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name *.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/ad-track/Pulpy_Reporting_Portal_frontend/dist;
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }

    location ^~ /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        limit_req zone=tenant_api_limit burst=100 nodelay;

        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        proxy_set_header Host              $http_host;
        proxy_set_header X-Forwarded-Host  $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Tracking endpoints (Clicks, Impressions, Postbacks)
    location ~ ^/(click|imp|postback)$ {
        limit_req zone=tenant_tracking_limit burst=3000 nodelay;

        proxy_set_header Host              $http_host;
        proxy_set_header X-Forwarded-Host  $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    location /health {
        proxy_pass http://backend;
        access_log off;
    }
}
```

### 7.2 Enable and Test Nginx

```bash
# Enable config by linking to sites-enabled
sudo ln -sf /etc/nginx/sites-available/ad-track.conf /etc/nginx/sites-enabled/

# Remove default nginx site if present
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx syntax
sudo nginx -t

# If output says "syntax is ok" and "test is successful", reload Nginx:
sudo systemctl reload nginx
```

---

## 8. Automated Re-deployment (CI/CD / One-Click Script)

Use the built-in [deploy-restart.sh](file:///var/www/ad-track/deploy-restart.sh) whenever you pull new code:

```bash
cd /var/www/ad-track
git pull origin main
chmod +x deploy-restart.sh
./deploy-restart.sh
```

What `deploy-restart.sh` does:

1. Builds the latest frontend assets (`npm run build`).
2. Reloads backend processes and workers gracefully with PM2 (`pm2 restart ecosystem.config.cjs --update-env`).
3. Zero downtime deployment.

---

## 9. Monitoring & Maintenance Commands

### Check Process Status

```bash
pm2 status
pm2 logs Pulpy --lines 50
pm2 logs click-worker --lines 50
```

### Test SSL Certificate Renewal

```bash
sudo certbot renew --dry-run
```

### Check Nginx Access & Error Logs

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```
