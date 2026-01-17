# VPS Server Startup Guide

## 🚀 Quick Start Commands

### Step 1: Navigate to Backend Directory
```bash
cd /path/to/Pulpy_Reporting_Portal_Backend
# or
cd ~/Multi-Pulpy\ Final/Pulpy_Reporting_Portal_Backend
```

### Step 2: Install Dependencies (if not already installed)
```bash
npm install
```

### Step 3: Set Up Environment Variables
```bash
# Create .env file if it doesn't exist
nano .env
```

**Required Environment Variables:**
```env
# Database
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_database_name

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Server
PORT=5001
HOST=0.0.0.0
NODE_ENV=production

# JWT Secrets
ADMIN_JWT_SECRET=your-super-secure-admin-secret-key
TENANT_JWT_SECRET=your-super-secure-tenant-secret-key
```

### Step 4: Install PM2 (if not installed)
```bash
npm install -g pm2
```

### Step 5: Start All Services with PM2
```bash
# Start all services (API server + workers)
pm2 start ecosystem.config.cjs

# This will start:
# - Pulpy (API server in cluster mode)
# - click-worker (processes Redis Stream clicks)
# - stats-worker (flushes Redis stats to MySQL)
```

### Step 6: Save PM2 Configuration
```bash
# Save PM2 process list so it restarts on server reboot
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions it prints
```

---

## 📋 Alternative: Start Services Individually

### Option A: Start All Services Together
```bash
pm2 start ecosystem.config.cjs
```

### Option B: Start Services Separately
```bash
# Start API server only
pm2 start ecosystem.config.cjs --only Pulpy

# Start click worker only
pm2 start ecosystem.config.cjs --only click-worker

# Start stats worker only
pm2 start ecosystem.config.cjs --only stats-worker
```

---

## 🔍 Monitoring & Management

### View All Running Processes
```bash
pm2 list
```

### View Logs
```bash
# View all logs
pm2 logs

# View specific service logs
pm2 logs Pulpy              # API server logs
pm2 logs click-worker       # Click worker logs
pm2 logs stats-worker       # Stats worker logs

# View last 100 lines
pm2 logs --lines 100

# Follow logs in real-time
pm2 logs --follow
```

### Monitor Resources
```bash
# Real-time monitoring dashboard
pm2 monit
```

### Restart Services
```bash
# Restart all services
pm2 restart ecosystem.config.cjs

# Restart specific service
pm2 restart Pulpy
pm2 restart click-worker
pm2 restart stats-worker
```

### Stop Services
```bash
# Stop all services
pm2 stop ecosystem.config.cjs

# Stop specific service
pm2 stop Pulpy
pm2 stop click-worker
```

### Delete Services from PM2
```bash
# Delete all services
pm2 delete ecosystem.config.cjs

# Delete specific service
pm2 delete Pulpy
```

---

## 🛠️ Manual Startup (Without PM2)

If you prefer to run services manually (not recommended for production):

### Terminal 1: API Server
```bash
cd Pulpy_Reporting_Portal_Backend
NODE_ENV=production PORT=5001 node src/server.js
```

### Terminal 2: Click Worker
```bash
cd Pulpy_Reporting_Portal_Backend
NODE_ENV=production node click-worker.js
```

### Terminal 3: Stats Worker
```bash
cd Pulpy_Reporting_Portal_Backend
NODE_ENV=production node stats-worker.js
```

---

## ✅ Verification Steps

### 1. Check if Services are Running
```bash
pm2 list
```

**Expected Output:**
```
┌─────┬─────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id  │ name        │ mode        │ ↺       │ status  │ cpu      │
├─────┼─────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0   │ Pulpy       │ cluster     │ 0       │ online  │ 0%       │
│ 1   │ click-worker│ fork        │ 0       │ online  │ 0%       │
│ 2   │ stats-worker│ fork        │ 0       │ online  │ 0%       │
└─────┴─────────────┴─────────────┴─────────┴─────────┴──────────┘
```

### 2. Check API Server Health
```bash
curl http://localhost:5001/health
```

**Expected Response:**
```json
{"status":"ok"}
```

### 3. Check Logs for Errors
```bash
pm2 logs --lines 50
```

Look for:
- ✅ `✅ Redis stream and consumer group ready`
- ✅ `👷 Redis Stream Worker Started`
- ✅ `✅ Click backfill worker started`
- ✅ `Server listening on port 5001`

### 4. Test Click Endpoint
```bash
# Replace with your actual tenant subdomain
curl -H "Host: tenant1.yourdomain.com" \
  "http://localhost:5001/click?offer_id=1&pub_id=1"
```

---

## 🔧 Troubleshooting

### Problem: PM2 not found
```bash
# Install PM2 globally
npm install -g pm2

# Or use npx
npx pm2 start ecosystem.config.cjs
```

### Problem: Port 5001 already in use
```bash
# Find process using port 5001
sudo lsof -i :5001

# Kill the process
sudo kill -9 <PID>

# Or change port in .env
PORT=5002
```

### Problem: Redis connection failed
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Start Redis if not running
sudo systemctl start redis
sudo systemctl enable redis
```

### Problem: Database connection failed
```bash
# Check MySQL/MariaDB status
sudo systemctl status mysql
# or
sudo systemctl status mariadb

# Start database if not running
sudo systemctl start mysql
```

### Problem: Worker not processing clicks
```bash
# Check click-worker logs
pm2 logs click-worker --lines 100

# Look for:
# - Stream connection errors
# - Database connection errors
# - Consumer group creation errors
```

### Problem: Services crash on startup
```bash
# Check error logs
pm2 logs --err --lines 100

# Common issues:
# - Missing .env file
# - Wrong database credentials
# - Redis not accessible
# - Port already in use
```

---

## 🔄 Updating Code on VPS

### Step 1: Pull Latest Code
```bash
cd Pulpy_Reporting_Portal_Backend
git pull origin v6  # or your branch name
```

### Step 2: Install New Dependencies (if any)
```bash
npm install
```

### Step 3: Run Database Migrations (if any)
```bash
# Check for new migrations
ls src/db/migrations/

# Run migrations manually if needed
mysql -u your_user -p your_database < src/db/migrations/004_add_unique_click_composite_key.sql
```

### Step 4: Restart Services
```bash
pm2 restart ecosystem.config.cjs
```

### Step 5: Verify Services Restarted Successfully
```bash
pm2 list
pm2 logs --lines 50
```

---

## 📊 Production Checklist

Before going live, ensure:

- [ ] `.env` file is configured with production values
- [ ] Database is accessible and migrations are applied
- [ ] Redis is running and accessible
- [ ] PM2 is installed and configured
- [ ] PM2 startup script is configured (`pm2 startup`)
- [ ] All services are running (`pm2 list`)
- [ ] Logs directory exists (`mkdir -p logs`)
- [ ] Firewall allows port 5001 (if needed)
- [ ] NGINX is configured to proxy to port 5001
- [ ] SSL certificates are configured (if using HTTPS)
- [ ] Health endpoint is accessible (`/health`)

---

## 🚨 Emergency Commands

### Stop All Services Immediately
```bash
pm2 stop all
```

### Restart All Services
```bash
pm2 restart all
```

### Clear All Logs
```bash
pm2 flush
```

### Reset PM2 (if corrupted)
```bash
pm2 kill
pm2 start ecosystem.config.cjs
pm2 save
```

---

## 📝 Notes

- **PM2 Cluster Mode**: The API server runs in cluster mode (uses all CPU cores)
- **Workers**: Click worker and stats worker run as single instances
- **Auto-Restart**: PM2 automatically restarts crashed services
- **Logs**: All logs are stored in `logs/` directory
- **Memory Limits**: 
  - API server: 1GB max (auto-restarts if exceeded)
  - Click worker: 500MB max
  - Stats worker: 300MB max

---

## 🆘 Need Help?

Check logs first:
```bash
pm2 logs --lines 200
```

Common log locations:
- API server: `logs/api-server-out.log`, `logs/api-server-error.log`
- Click worker: `logs/click-worker-out.log`, `logs/click-worker-error.log`
- Stats worker: `logs/stats-worker-out.log`, `logs/stats-worker-error.log`
