#!/bin/bash

# 🚀 Redis-First Postback Architecture Deployment Script
# Zero-downtime deployment with rollback capability

set -e

echo "🔄 Redis-First Postback Architecture Deployment"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
WORKER_INSTANCES=${WORKER_INSTANCES:-2}
ROLLBACK_TAG="pre-redis-first-$(date +%Y%m%d_%H%M%S)"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

# Pre-deployment checks
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if PM2 is running
    if ! pm2 list &>/dev/null; then
        error "PM2 is not running. Start PM2 first."
        exit 1
    fi

    # Check if Redis is accessible
    if ! redis-cli ping &>/dev/null; then
        error "Redis is not accessible"
        exit 1
    fi

    # Check if MySQL is accessible
    if ! mysql -e "SELECT 1;" &>/dev/null; then
        warn "MySQL connection check failed - ensure DB is accessible"
    fi

    log "Prerequisites check passed ✅"
}

# Create backup tag
create_backup() {
    log "Creating backup tag: $ROLLBACK_TAG"
    git tag "$ROLLBACK_TAG"
    log "Backup created ✅"
}

# Deploy new postback worker
deploy_workers() {
    log "Deploying postback workers (instances: $WORKER_INSTANCES)"

    # Start new workers
    pm2 start ecosystem.config.cjs --only postback-worker

    # Wait for workers to start
    sleep 5

    # Verify workers are running
    RUNNING_WORKERS=$(pm2 list | grep postback-worker | grep online | wc -l)
    if [ "$RUNNING_WORKERS" -lt "$WORKER_INSTANCES" ]; then
        error "Only $RUNNING_WORKERS workers running, expected $WORKER_INSTANCES"
        exit 1
    fi

    log "Workers deployed successfully ✅"
}

# Monitor initial metrics
monitor_initial() {
    log "Monitoring initial metrics..."

    # Wait for metrics to populate
    sleep 10

    # Check metrics endpoint
    if curl -s "http://localhost:5001/metrics/postback" > /dev/null; then
        log "Metrics endpoint accessible ✅"
    else
        warn "Metrics endpoint not accessible - check server logs"
    fi
}

# Health checks
health_check() {
    log "Running health checks..."

    # Check if postback endpoint responds
    if curl -s -X POST "http://localhost:5001/postback?click_id=test&amount=100" > /dev/null; then
        log "Postback endpoint responding ✅"
    else
        warn "Postback endpoint not responding - check server logs"
    fi

    # Check worker logs for errors
    ERROR_COUNT=$(pm2 logs postback-worker --lines 50 2>/dev/null | grep -i error | wc -l)
    if [ "$ERROR_COUNT" -gt 0 ]; then
        warn "Found $ERROR_COUNT errors in worker logs - check manually"
    fi
}

# Rollback function
rollback() {
    error "Deployment failed! Rolling back..."

    # Stop new workers
    pm2 stop postback-worker || true
    pm2 delete postback-worker || true

    # Restore old code
    git checkout "$ROLLBACK_TAG"

    # Restart old processes
    pm2 restart all

    error "Rollback completed. Check system status."
    exit 1
}

# Main deployment
main() {
    log "Starting Redis-First Postback deployment..."

    check_prerequisites
    create_backup

    # Deploy in try-catch style
    if deploy_workers && monitor_initial && health_check; then
        log "🎉 Deployment successful!"
        log ""
        log "Next steps:"
        log "1. Monitor metrics: curl http://localhost:5001/metrics/postback"
        log "2. Check worker logs: pm2 logs postback-worker"
        log "3. Test postback: curl -X POST 'http://localhost:5001/postback?click_id=test'"
        log "4. If issues: ./deploy-redis-first-postback.sh rollback"
        log ""
        log "Rollback tag: $ROLLBACK_TAG"
    else
        rollback
    fi
}

# Rollback command
if [ "$1" = "rollback" ]; then
    log "Manual rollback requested"

    pm2 stop postback-worker 2>/dev/null || true
    pm2 delete postback-worker 2>/dev/null || true

    if [ -n "$ROLLBACK_TAG" ]; then
        git checkout "$ROLLBACK_TAG"
        pm2 restart all
        log "Manual rollback completed"
    else
        error "No rollback tag found. Manual intervention required."
        exit 1
    fi
    exit 0
fi

# Run main deployment
main