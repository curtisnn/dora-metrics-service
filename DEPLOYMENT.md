# DORA Metrics Service - Deployment Guide

## Overview

This document provides comprehensive deployment procedures for the DORA Metrics Ingestion Service. It covers manual deployment (current state) and automated CI/CD deployment (Phase 2 target).

**Service Details:**
- **Name:** DORA Metrics Ingestion Service
- **Type:** Node.js/Express API + Real-time Dashboard
- **Port:** 3000
- **Runtime:** Node.js 20+
- **Container:** Docker
- **Database:** InfluxDB 2.x

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Deployment Procedures](#deployment-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Deployment Windows](#deployment-windows)
6. [Health Verification](#health-verification)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Emergency Contacts](#emergency-contacts)

---

## Pre-Deployment Checklist

Use this checklist for every deployment to ensure all critical steps are completed.

### Development Phase
- [ ] All tests passing locally (`npm test`)
- [ ] Test coverage >65% (target: >80%)
- [ ] Code builds successfully (`npm run build`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Environment variables validated against `.env.example`
- [ ] GitHub webhook signature verification working (if `WEBHOOK_SECRET` set)
- [ ] InfluxDB connection tested locally

### Pre-Production Phase
- [ ] All changes peer-reviewed and approved
- [ ] Integration tests passing (if test DB available)
- [ ] Documentation updated (README, API docs, this file)
- [ ] Database migrations tested (if applicable)
- [ ] Rollback plan documented and tested
- [ ] Deployment window scheduled (see [Deployment Windows](#deployment-windows))
- [ ] Stakeholders notified (ops team, on-call engineer)

### Production Phase
- [ ] Backup current production state (Docker image, database, config)
- [ ] Staging deployment successful (if staging environment exists)
- [ ] Health checks verified after deployment
- [ ] Dashboard metrics displaying correctly
- [ ] Webhook processing confirmed (test event sent)
- [ ] Logs reviewed for errors
- [ ] Performance metrics stable (CPU, memory, response times)

---

## Environment Configuration

### Required Environment Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port (default: 3000) |
| `NODE_ENV` | Yes | `production` | Environment mode |
| `LOG_LEVEL` | No | `info` | Logging level (error/warn/info/debug) |
| `WEBHOOK_SECRET` | Recommended | `abc123...` | GitHub webhook HMAC secret |
| `API_KEY` | Recommended | `xyz789...` | API key for custom endpoints (future) |
| `INFLUXDB_URL` | Yes | `http://influxdb:8086` | InfluxDB connection URL |
| `INFLUXDB_TOKEN` | Yes | `token...` | InfluxDB authentication token |
| `INFLUXDB_ORG` | Yes | `dora-metrics` | InfluxDB organization name |
| `INFLUXDB_BUCKET` | Yes | `metrics` | InfluxDB bucket name |

### Environment Setup by Target

#### Local Development
```bash
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
INFLUXDB_URL=http://localhost:8086
```

#### Staging
```bash
NODE_ENV=staging
LOG_LEVEL=info
PORT=3000
WEBHOOK_SECRET=<staging-secret>
INFLUXDB_URL=http://influxdb-staging:8086
INFLUXDB_TOKEN=<staging-token>
INFLUXDB_ORG=dora-metrics-staging
INFLUXDB_BUCKET=metrics-staging
```

#### Production
```bash
NODE_ENV=production
LOG_LEVEL=warn
PORT=3000
WEBHOOK_SECRET=<production-secret>
API_KEY=<production-api-key>
INFLUXDB_URL=http://influxdb-prod:8086
INFLUXDB_TOKEN=<production-token>
INFLUXDB_ORG=dora-metrics
INFLUXDB_BUCKET=metrics
```

### Secrets Management

**Current (Manual):**
- Store secrets in `.env` file (never commit to git)
- Use separate `.env` files per environment
- Rotate secrets quarterly or after team changes

**Future (Automated CI/CD):**
- Store secrets in GitHub Actions Secrets
- Use secret management service (AWS Secrets Manager, HashiCorp Vault)
- Implement automatic secret rotation

---

## Deployment Procedures

### Method 1: Manual Docker Deployment (Current)

**Use for:** Production deployments until CI/CD pipeline is ready

#### Step 1: Pre-Deployment Backup

```bash
# Backup current Docker image
docker tag dora-ingestion:latest dora-ingestion:backup-$(date +%Y%m%d-%H%M%S)

# Backup InfluxDB data (if needed)
docker exec influxdb influx backup /tmp/backup-$(date +%Y%m%d-%H%M%S)

# Save current environment config
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
```

#### Step 2: Pull Latest Code

```bash
cd /path/to/dora-metrics-ingestion
git fetch origin
git checkout main
git pull origin main

# Verify correct commit
git log -1 --oneline
```

#### Step 3: Build Docker Image

```bash
# Build with version tag
VERSION=$(git rev-parse --short HEAD)
docker build -t dora-ingestion:${VERSION} -t dora-ingestion:latest .

# Verify image built successfully
docker images | grep dora-ingestion
```

#### Step 4: Update Environment Configuration

```bash
# Review environment variables
cat .env.example
cat .env

# Update .env if needed (DO NOT commit)
vim .env
```

#### Step 5: Stop Current Service

```bash
# Stop service gracefully
docker-compose down

# Verify service stopped
docker ps | grep dora-ingestion
```

#### Step 6: Deploy New Version

```bash
# Start services with new image
docker-compose up -d

# Verify containers started
docker-compose ps

# Expected output:
# NAME                COMMAND                  SERVICE             STATUS              PORTS
# dora-ingestion      "docker-entrypoint.s…"   ingestion           Up 5 seconds        0.0.0.0:3000->3000/tcp
# influxdb            "docker-entrypoint.s…"   influxdb            Up 10 minutes       0.0.0.0:8086->8086/tcp
```

#### Step 7: Verify Deployment

See [Health Verification](#health-verification) section below.

#### Step 8: Monitor Initial Traffic

```bash
# Watch logs for 5 minutes
docker-compose logs -f --tail=100 ingestion

# Look for:
# ✅ "Server started" log entry
# ✅ "InfluxDB connection initialized"
# ✅ No error logs
# ✅ Webhook events processing successfully
```

#### Step 9: Post-Deployment Validation

```bash
# Send test webhook event
curl -X POST http://localhost:3000/events/deployment \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "environment": "production",
    "commitSha": "test-'$(date +%s)'",
    "status": "success",
    "repository": "test/deployment-verification"
  }'

# Check dashboard shows test event
open http://localhost:3000/dashboard/

# Verify metrics in InfluxDB
docker-compose exec influxdb influx query \
  'from(bucket:"metrics") |> range(start: -1h) |> filter(fn: (r) => r._measurement == "deployments") |> limit(n:5)'
```

---

### Method 2: Automated CI/CD Deployment (Future - Phase 2)

**Target completion:** Week 1-2 of Phase 2

#### GitHub Actions Workflow

**Staging Deployment (Automatic on merge to `main`):**
1. CI runs tests and builds Docker image
2. Image pushed to container registry
3. Deploy to staging environment
4. Run smoke tests
5. Notify team of deployment

**Production Deployment (Manual approval required):**
1. Review staging deployment results
2. Approve production deployment in GitHub Actions
3. Image promoted from staging
4. Deploy to production with health checks
5. Automatic rollback on health check failure
6. Notify team of deployment

#### Automated Health Checks

```yaml
# Health check criteria (post-deployment)
- HTTP 200 response from /health endpoint
- InfluxDB connectivity verified
- No error logs in last 5 minutes
- Memory usage <80%
- CPU usage <70%
- Webhook processing queue <10 items
```

---

## Rollback Procedures

### When to Rollback

**Immediate rollback required if:**
- ❌ Health check endpoint returns 5xx errors for >2 minutes
- ❌ InfluxDB connection failures
- ❌ Webhook processing errors >20%
- ❌ Memory usage >95% (potential memory leak)
- ❌ Dashboard not loading
- ❌ Critical bug discovered in production

**Consider rollback if:**
- ⚠️ Increased error rate (>5% vs baseline)
- ⚠️ Performance degradation (>2x response time)
- ⚠️ Unexpected behavior in metrics calculation

### Rollback Procedure (Docker)

#### Option A: Quick Rollback (Recommended for emergencies)

```bash
# Stop current service
docker-compose down

# Restore backup image
docker tag dora-ingestion:backup-YYYYMMDD-HHMMSS dora-ingestion:latest

# Restore environment config if needed
cp .env.backup-YYYYMMDD-HHMMSS .env

# Restart service
docker-compose up -d

# Verify health
curl http://localhost:3000/health
```

**Time to rollback:** ~2 minutes

#### Option B: Git-Based Rollback (For controlled rollback)

```bash
# Stop service
docker-compose down

# Revert to previous commit
git log --oneline -10  # Find previous working commit
git checkout <previous-commit-sha>

# Rebuild image
docker build -t dora-ingestion:latest .

# Restore environment config if changed
cp .env.backup-YYYYMMDD-HHMMSS .env

# Restart service
docker-compose up -d

# Verify health
curl http://localhost:3000/health
```

**Time to rollback:** ~5 minutes

### Post-Rollback Actions

1. **Verify service health** (see [Health Verification](#health-verification))
2. **Check metrics processing** (send test webhook)
3. **Review logs** to confirm issue resolved
4. **Notify stakeholders** of rollback
5. **Document root cause** in incident report
6. **Create issue** to track bug fix
7. **Update deployment checklist** if new checks needed

### Rollback Testing

**Test rollback procedure quarterly:**
- Deploy to staging
- Deliberately deploy "broken" version
- Execute rollback procedure
- Measure time to recovery
- Update documentation based on findings

---

## Deployment Windows

### Standard Deployment Window

**Preferred deployment times:**
- **Weekdays:** Tuesday - Thursday, 10:00 AM - 4:00 PM local time
- **Avoid:** Monday (start of week), Friday (reduced support coverage)
- **Avoid:** Weekends and holidays (reduced support coverage)

### Deployment Freeze Periods

**No deployments during:**
- 🔒 **Company-wide freeze:** Last week of each quarter (compliance/reporting)
- 🔒 **Holiday freeze:** December 20 - January 2
- 🔒 **Major events:** During company all-hands, board meetings, major launches
- 🔒 **Incident response:** During active incidents (P0/P1)

### Emergency Deployments

**Criteria for emergency deployment outside window:**
- Critical security vulnerability (CVE with severity High/Critical)
- Service outage or degradation affecting users
- Data loss or corruption risk
- Legal/compliance requirement

**Emergency deployment approval required from:**
- On-call engineer
- Engineering manager or CTO
- CEO (if significant business impact)

### Deployment Notifications

**Before deployment:**
- [ ] Post in `#engineering` Slack channel (24 hours ahead)
- [ ] Add to deployment calendar
- [ ] Notify on-call engineer

**After deployment:**
- [ ] Post completion status in `#engineering`
- [ ] Update deployment log
- [ ] Document any issues encountered

---

## Health Verification

### Automated Health Checks

```bash
#!/bin/bash
# health-check.sh - Run after every deployment

echo "=== DORA Metrics Service Health Check ==="

# 1. Service responding
echo "1. Checking service health endpoint..."
HEALTH=$(curl -s http://localhost:3000/health)
STATUS=$(echo $HEALTH | jq -r '.status')
if [ "$STATUS" != "healthy" ]; then
  echo "❌ FAILED: Service health check failed"
  echo "$HEALTH"
  exit 1
fi
echo "✅ PASSED: Service is healthy"

# 2. Dashboard accessible
echo "2. Checking dashboard..."
DASHBOARD=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard/)
if [ "$DASHBOARD" != "200" ]; then
  echo "❌ FAILED: Dashboard not accessible (HTTP $DASHBOARD)"
  exit 1
fi
echo "✅ PASSED: Dashboard accessible"

# 3. API responding
echo "3. Checking API endpoint..."
API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboard)
if [ "$API" != "200" ]; then
  echo "❌ FAILED: API not responding (HTTP $API)"
  exit 1
fi
echo "✅ PASSED: API responding"

# 4. Container running
echo "4. Checking Docker container status..."
CONTAINER=$(docker-compose ps ingestion | grep "Up")
if [ -z "$CONTAINER" ]; then
  echo "❌ FAILED: Container not running"
  exit 1
fi
echo "✅ PASSED: Container running"

# 5. No recent errors in logs
echo "5. Checking logs for errors..."
ERRORS=$(docker-compose logs --tail=100 ingestion | grep -i error | wc -l)
if [ "$ERRORS" -gt 5 ]; then
  echo "⚠️  WARNING: $ERRORS errors found in recent logs"
  docker-compose logs --tail=20 ingestion | grep -i error
else
  echo "✅ PASSED: No significant errors in logs"
fi

# 6. InfluxDB connectivity
echo "6. Checking InfluxDB connectivity..."
INFLUX=$(docker-compose exec -T influxdb influx ping 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "❌ FAILED: InfluxDB not responding"
  exit 1
fi
echo "✅ PASSED: InfluxDB responding"

echo ""
echo "=== Health Check Complete ==="
echo "All critical checks passed ✅"
```

### Manual Verification Steps

After deployment, manually verify:

1. **Service Health:**
   ```bash
   curl http://localhost:3000/health | jq
   ```
   Expected: `{"status": "healthy", ...}`

2. **Dashboard Loading:**
   - Open `http://localhost:3000/dashboard/` in browser
   - Verify metrics displayed
   - Verify auto-refresh working (30s interval)
   - Verify charts rendering

3. **Webhook Processing:**
   ```bash
   # Send test deployment event
   curl -X POST http://localhost:3000/events/deployment \
     -H "Content-Type: application/json" \
     -d '{
       "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
       "environment": "production",
       "commitSha": "test-'$(date +%s)'",
       "status": "success",
       "repository": "test/health-check"
     }'

   # Expected: {"message": "Deployment event received", "requestId": "..."}
   ```

4. **Logs Review:**
   ```bash
   docker-compose logs -f --tail=50 ingestion
   ```
   Look for:
   - ✅ "Server started" with correct port
   - ✅ "InfluxDB connection initialized"
   - ✅ Webhook events processing
   - ❌ No error/warn logs

5. **Resource Usage:**
   ```bash
   docker stats --no-stream ingestion
   ```
   Expected:
   - CPU: <50% (idle), <80% (under load)
   - Memory: <500MB (typical), <1GB (peak)

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Service Won't Start

**Symptoms:**
- Container starts then immediately exits
- `docker-compose ps` shows "Exit 1"

**Diagnosis:**
```bash
# Check logs
docker-compose logs ingestion

# Common causes:
# - Missing environment variables
# - Port 3000 already in use
# - Invalid configuration
```

**Solutions:**
```bash
# Validate environment variables
npm run validate-env  # (if validation script exists)
cat .env

# Check port availability
lsof -i :3000
# If port in use: kill process or change PORT in .env

# Rebuild with fresh dependencies
docker-compose build --no-cache
docker-compose up -d
```

---

#### Issue 2: InfluxDB Connection Failed

**Symptoms:**
- Logs show "InfluxDB connection failed"
- Metrics not being recorded
- Dashboard shows no data

**Diagnosis:**
```bash
# Check InfluxDB container
docker-compose ps influxdb

# Test InfluxDB connectivity
docker-compose exec influxdb influx ping

# Verify token validity
docker-compose exec influxdb influx auth list
```

**Solutions:**
```bash
# Restart InfluxDB
docker-compose restart influxdb

# Regenerate token if invalid
./scripts/setup-influxdb.sh

# Update .env with new token
vim .env
docker-compose restart ingestion
```

---

#### Issue 3: Webhook Signature Verification Failing

**Symptoms:**
- GitHub webhooks return 403 Forbidden
- Logs show "Invalid webhook signature"

**Diagnosis:**
```bash
# Check webhook secret configured
grep WEBHOOK_SECRET .env

# Check GitHub webhook configuration
# Go to: Repository → Settings → Webhooks → Recent Deliveries
# Verify secret matches
```

**Solutions:**
```bash
# Option 1: Update webhook secret
# 1. Generate new secret: openssl rand -hex 32
# 2. Update GitHub webhook settings
# 3. Update .env file
# 4. Restart service

# Option 2: Disable verification (development only)
# Remove WEBHOOK_SECRET from .env
# Restart service
```

---

#### Issue 4: High Memory Usage / Memory Leak

**Symptoms:**
- Container using >1GB memory
- Memory usage increasing over time
- Service becoming slow or unresponsive

**Diagnosis:**
```bash
# Monitor memory usage
docker stats ingestion

# Check event queue size (if exposed via health endpoint)
curl http://localhost:3000/health | jq '.queueSize'

# Review logs for stuck events
docker-compose logs --tail=500 ingestion | grep -i "queue"
```

**Solutions:**
```bash
# Immediate: Restart service
docker-compose restart ingestion

# Long-term: Investigate root cause
# - Check for event processing bottlenecks
# - Review commit cache size (max 5000)
# - Check for InfluxDB write failures causing queue buildup
# - Profile memory usage in development

# If issue persists: Scale vertically
# Edit docker-compose.yml to increase memory limit
```

---

#### Issue 5: Dashboard Not Showing Metrics

**Symptoms:**
- Dashboard loads but shows "No data available"
- Charts are empty

**Diagnosis:**
```bash
# Check if metrics exist in InfluxDB
docker-compose exec influxdb influx query \
  'from(bucket:"metrics") |> range(start: -7d) |> filter(fn: (r) => r._measurement == "dora_metrics") |> limit(n:5)'

# Check API endpoint
curl http://localhost:3000/api/dashboard?days=7 | jq

# Check for API errors
docker-compose logs ingestion | grep "/api/dashboard"
```

**Solutions:**
```bash
# If no metrics in InfluxDB: Generate test data
npx tsx scripts/seed-test-data.ts

# If API returns empty: Check query syntax
# Review src/services/influxdb.ts query logic

# If API errors: Check InfluxDB token permissions
# Token needs read access to "metrics" bucket
```

---

#### Issue 6: Deployment Metrics Not Calculating

**Symptoms:**
- Webhooks received successfully (202 response)
- But deployment frequency/lead time not updating

**Diagnosis:**
```bash
# Check event queue processing
docker-compose logs ingestion | grep "Queue processing"

# Check for metric calculation errors
docker-compose logs ingestion | grep -i "metric"

# Verify webhook events in queue
# (If health endpoint exposes queue stats)
curl http://localhost:3000/health | jq
```

**Solutions:**
```bash
# Common cause: Missing commit timestamp (for lead time)
# Ensure push events are being sent before deployment events
# GitHub webhook must include "push" events

# Check metric calculation service
# Review logs for:
# - "Lead time calculated"
# - "Deployment metrics written"

# If processing stalled: Restart service
docker-compose restart ingestion
```

---

#### Issue 7: Docker Build Failing

**Symptoms:**
- `docker build` command fails
- Errors during npm install or TypeScript compilation

**Diagnosis:**
```bash
# Try local build first
npm install
npm run build

# Check for TypeScript errors
npx tsc --noEmit

# Check Node.js version
node --version  # Should be 20+
```

**Solutions:**
```bash
# Clean build
rm -rf node_modules dist
npm install
npm run build

# Build Docker with verbose output
docker build --progress=plain -t dora-ingestion:latest .

# If npm install fails: Check package-lock.json
# May need: npm install --legacy-peer-deps
```

---

### Debugging Checklist

When troubleshooting any issue:

- [ ] Check service health endpoint: `curl localhost:3000/health`
- [ ] Review recent logs: `docker-compose logs --tail=100 ingestion`
- [ ] Check all containers running: `docker-compose ps`
- [ ] Verify environment variables: `cat .env`
- [ ] Check resource usage: `docker stats`
- [ ] Test InfluxDB connectivity: `docker-compose exec influxdb influx ping`
- [ ] Send test event: `curl -X POST localhost:3000/events/deployment ...`
- [ ] Check GitHub webhook delivery status (if using webhooks)
- [ ] Review deployment checklist for missed steps

---

## Emergency Contacts

### On-Call Rotation

| Role | Primary | Secondary |
|------|---------|-----------|
| **Engineering** | On-call engineer | CTO |
| **DevOps** | DevOps lead | Infrastructure team |
| **Product** | Product manager | CEO |

### Escalation Path

1. **Incident detected** → On-call engineer
2. **Cannot resolve in 30 min** → CTO
3. **Business impact** → CEO
4. **External vendor issue** (InfluxDB, GitHub) → DevOps lead

### Communication Channels

- **Slack:** `#engineering` (deployments), `#incidents` (outages)
- **PagerDuty:** (if configured) For P0/P1 incidents
- **Email:** engineering@company.com (non-urgent)

---

## Deployment Log

Keep a log of all deployments:

| Date | Version/Commit | Environment | Deployed By | Status | Notes |
|------|----------------|-------------|-------------|--------|-------|
| 2026-03-31 | `abc1234` | Production | CTO | ✅ Success | Initial production deployment |
| | | | | | |

**Location:** Update this section or maintain a separate `CHANGELOG.md` file.

---

## Future Improvements (Phase 2+)

Planned enhancements to deployment process:

- [ ] **CI/CD Pipeline** (Week 1-2): GitHub Actions automated deployment
- [ ] **Automated Rollback** (Week 5-6): Health check-based automatic rollback
- [ ] **Blue/Green Deployment** (Phase 3): Zero-downtime deployments
- [ ] **Canary Deployments** (Phase 3): Gradual rollout to subset of traffic
- [ ] **Deployment Monitoring** (Week 3-4): Real-time metrics during deployment
- [ ] **Secret Management** (Week 1-2): Integration with vault/secrets manager
- [ ] **Multi-Environment** (Phase 3): Automated dev/staging/prod pipeline

---

## Document Maintenance

**Last Updated:** 2026-03-31
**Owner:** CTO
**Review Schedule:** Quarterly or after major incidents
**Feedback:** Submit issues or PRs to improve this document

---

## Appendix A: Deployment Script

```bash
#!/bin/bash
# deploy.sh - Automated deployment script (manual method)
# Usage: ./deploy.sh [environment]

set -e  # Exit on error

ENVIRONMENT=${1:-production}
VERSION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== DORA Metrics Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Version: $VERSION"
echo "Timestamp: $TIMESTAMP"
echo ""

# Pre-deployment backup
echo "Step 1/7: Creating backup..."
docker tag dora-ingestion:latest dora-ingestion:backup-$TIMESTAMP || true
cp .env .env.backup-$TIMESTAMP

# Build new image
echo "Step 2/7: Building Docker image..."
docker build -t dora-ingestion:$VERSION -t dora-ingestion:latest .

# Stop current service
echo "Step 3/7: Stopping current service..."
docker-compose down

# Start new service
echo "Step 4/7: Starting new service..."
docker-compose up -d

# Wait for service to be ready
echo "Step 5/7: Waiting for service to be ready..."
sleep 10

# Health check
echo "Step 6/7: Running health checks..."
for i in {1..5}; do
  if curl -s http://localhost:3000/health | grep -q "healthy"; then
    echo "✅ Health check passed"
    break
  fi
  echo "Attempt $i/5 failed, retrying in 5s..."
  sleep 5
done

# Verify deployment
echo "Step 7/7: Verifying deployment..."
docker-compose ps
docker-compose logs --tail=20 ingestion

echo ""
echo "=== Deployment Complete ==="
echo "Version deployed: $VERSION"
echo "Backup available: dora-ingestion:backup-$TIMESTAMP"
echo ""
echo "Next steps:"
echo "1. Monitor logs: docker-compose logs -f ingestion"
echo "2. Test dashboard: open http://localhost:3000/dashboard/"
echo "3. Send test event: curl -X POST http://localhost:3000/events/deployment ..."
```

---

## Appendix B: Rollback Script

```bash
#!/bin/bash
# rollback.sh - Emergency rollback script
# Usage: ./rollback.sh [backup-timestamp]

set -e

if [ -z "$1" ]; then
  echo "Available backups:"
  docker images | grep backup
  echo ""
  echo "Usage: ./rollback.sh <backup-timestamp>"
  echo "Example: ./rollback.sh backup-20260331-140530"
  exit 1
fi

BACKUP_TAG=$1

echo "=== EMERGENCY ROLLBACK ==="
echo "Rolling back to: $BACKUP_TAG"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Stop current service
echo "Step 1/4: Stopping current service..."
docker-compose down

# Restore backup image
echo "Step 2/4: Restoring backup image..."
docker tag dora-ingestion:$BACKUP_TAG dora-ingestion:latest

# Restore environment config
if [ -f ".env.$BACKUP_TAG" ]; then
  echo "Step 3/4: Restoring environment config..."
  cp .env.$BACKUP_TAG .env
else
  echo "Step 3/4: Skipping environment restore (backup not found)"
fi

# Start service
echo "Step 4/4: Starting service..."
docker-compose up -d

# Wait and verify
sleep 10
curl -s http://localhost:3000/health | jq

echo ""
echo "=== Rollback Complete ==="
echo "Service restored to: $BACKUP_TAG"
echo "Verify health: curl http://localhost:3000/health"
```

Save these scripts in the `scripts/` directory and make them executable:
```bash
chmod +x scripts/deploy.sh scripts/rollback.sh
```
