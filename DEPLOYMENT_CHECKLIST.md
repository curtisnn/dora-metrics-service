# Deployment Checklist

**Service:** DORA Metrics Ingestion Service
**Date:** _____________
**Deployed By:** _____________
**Version/Commit:** _____________
**Environment:** ☐ Development  ☐ Staging  ☐ Production

---

## Pre-Deployment

### Development Phase
- [ ] All tests passing locally (`npm test`)
- [ ] Test coverage ≥65% (target: ≥80%)
- [ ] Code builds successfully (`npm run build`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Environment variables validated against `.env.example`
- [ ] GitHub webhook signature verification working (if `WEBHOOK_SECRET` set)
- [ ] InfluxDB connection tested locally

### Pre-Production Phase
- [ ] All changes peer-reviewed and approved
- [ ] Integration tests passing (if test DB available)
- [ ] Documentation updated (README, API docs, DEPLOYMENT.md)
- [ ] Database migrations tested (if applicable)
- [ ] Rollback plan documented and tested
- [ ] Deployment window scheduled and approved
- [ ] Stakeholders notified:
  - [ ] Ops team
  - [ ] On-call engineer
  - [ ] Engineering team (#engineering Slack channel)
- [ ] Emergency contacts confirmed and available

### Production Readiness
- [ ] Backup current production state:
  - [ ] Docker image tagged with backup timestamp
  - [ ] `.env` file backed up
  - [ ] InfluxDB data backed up (if needed)
- [ ] Staging deployment successful (if staging environment exists)
- [ ] Rollback procedure tested in staging
- [ ] Deployment announcement posted in #engineering

---

## During Deployment

### Deployment Execution
- [ ] Pull latest code from main branch
- [ ] Verify correct commit SHA: _______________
- [ ] Build Docker image with version tag
- [ ] Verify image built successfully
- [ ] Review and update `.env` configuration (if needed)
- [ ] Stop current service gracefully
- [ ] Deploy new version
- [ ] Verify containers started successfully

### Initial Verification
- [ ] Wait 30 seconds for service initialization
- [ ] Run automated health checks (`./scripts/health-check.sh`)
- [ ] Service health endpoint returns 200
- [ ] Dashboard accessible at `/dashboard/`
- [ ] API endpoint responding at `/api/dashboard`
- [ ] InfluxDB connection verified
- [ ] No error logs in startup logs

---

## Post-Deployment

### Health Verification
- [ ] Send test deployment event
- [ ] Verify test event appears in dashboard
- [ ] Check metrics calculation working
- [ ] Review logs for warnings/errors
- [ ] Monitor resource usage (CPU, memory)
- [ ] Webhook processing confirmed (if webhooks configured)

### Performance Checks
- [ ] Response time <500ms for health endpoint
- [ ] Memory usage <500MB (typical workload)
- [ ] CPU usage <50% (idle), <80% (under load)
- [ ] No memory leaks detected (stable over 10 minutes)
- [ ] Dashboard auto-refresh working (30s interval)

### Monitoring Setup
- [ ] Watch logs for 10 minutes: `docker-compose logs -f ingestion`
- [ ] No error/warn logs during observation period
- [ ] Webhook events processing successfully
- [ ] Metrics being written to InfluxDB
- [ ] Event queue processing normally

---

## Communication

### Deployment Notifications
- [ ] Post deployment completion in #engineering
- [ ] Update deployment log in DEPLOYMENT.md
- [ ] Document any issues encountered
- [ ] Share rollback timestamp with team

### If Issues Detected
- [ ] Document the issue clearly
- [ ] Notify on-call engineer immediately
- [ ] Decide: Fix forward or rollback?
- [ ] If rollback needed:
  - [ ] Execute rollback procedure
  - [ ] Verify service restored
  - [ ] Post incident report
  - [ ] Create issue to track bug fix

---

## Rollback Procedure (if needed)

### Quick Rollback
- [ ] Stop current service: `docker-compose down`
- [ ] Restore backup image: `docker tag dora-ingestion:backup-YYYYMMDD-HHMMSS dora-ingestion:latest`
- [ ] Restore environment config (if changed): `cp .env.backup-YYYYMMDD-HHMMSS .env`
- [ ] Restart service: `docker-compose up -d`
- [ ] Verify health: `curl http://localhost:3000/health`
- [ ] Notify team of rollback
- [ ] Document root cause

---

## Final Verification

### 24-Hour Post-Deployment
- [ ] No critical errors in logs
- [ ] Service uptime stable
- [ ] Metrics collection rate normal
- [ ] Dashboard showing expected data
- [ ] No performance degradation
- [ ] No customer complaints or issues

### Documentation
- [ ] Deployment logged in DEPLOYMENT.md
- [ ] Incident report filed (if issues occurred)
- [ ] Lessons learned documented
- [ ] Update checklist based on any new findings

---

## Sign-Off

**Deployment Status:** ☐ Successful  ☐ Successful with issues  ☐ Failed - Rolled back

**Deployed By:** _____________
**Signature:** _____________
**Date/Time:** _____________

**Reviewed By (if production):** _____________
**Signature:** _____________
**Date/Time:** _____________

---

## Notes

_Use this space to document any issues, deviations from standard procedure, or observations:_

```
[Add notes here]
```

---

## Time Log

| Phase | Start Time | End Time | Duration |
|-------|------------|----------|----------|
| Pre-deployment checks | | | |
| Deployment execution | | | |
| Health verification | | | |
| Post-deployment monitoring | | | |
| **Total** | | | |

**Target deployment time:** <10 minutes (excluding monitoring)
**Actual deployment time:** _____ minutes

---

## Appendix: Quick Command Reference

```bash
# Health check
curl http://localhost:3000/health | jq

# Send test event
curl -X POST http://localhost:3000/events/deployment \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "environment": "production",
    "commitSha": "test-'$(date +%s)'",
    "status": "success",
    "repository": "test/deployment-verification"
  }'

# View logs
docker-compose logs -f --tail=100 ingestion

# Check containers
docker-compose ps

# Check resource usage
docker stats --no-stream ingestion

# Run health check script
./scripts/health-check.sh

# Emergency rollback
./scripts/rollback.sh backup-YYYYMMDD-HHMMSS
```
