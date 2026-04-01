# On-Call Runbook - DORA Metrics Service

## Quick Links

- **DORA Metrics Dashboard:** http://localhost:3000/dashboard
- **Operational Health Dashboard:** http://localhost:3000/dashboard/ops.html
- **Prometheus Metrics:** http://localhost:3000/metrics
- **Health Check:** http://localhost:3000/health

## Service Overview

The DORA Metrics Service ingests deployment events via GitHub webhooks and exposes real-time DevOps performance metrics. It consists of:

- Express.js API server
- InfluxDB for time-series storage (90-day retention)
- Background event processing queue
- Real-time dashboards

## Dashboard Monitoring

### DORA Metrics Dashboard
Monitor key DevOps performance indicators:
- **Deployment Frequency:** Target >1 deploy/day
- **Lead Time for Changes:** Target <24 hours

### Operational Health Dashboard
Monitor system health across three categories:

#### ⚡ Service Health
- **Uptime:** System availability
- **Response Time (P95):** Should be <2 seconds
  - 🟢 Healthy: <2s
  - 🟡 Warning: 2-5s
  - 🔴 Critical: >5s
- **Error Rate:** Should be <1%
  - 🟢 Healthy: <1%
  - 🟡 Warning: 1-5%
  - 🔴 Critical: >5%
- **Request Rate:** Requests per second

#### 📊 Queue Processing
- **Queue Depth:** Pending webhook events
  - 🟢 Healthy: <10 events
  - 🟡 Warning: 10-50 events
  - 🔴 Critical: >50 events
- **Processing Rate:** Webhooks processed per second
- **Processing Latency (P95):** Should be <2 seconds
  - 🟢 Healthy: <2s
  - 🟡 Warning: 2-5s
  - 🔴 Critical: >5s
- **Failed Webhooks:** Total webhook processing failures

#### 💾 Data Quality
- **InfluxDB Status:** Connection state
  - 🟢 Connected
  - 🔴 Disconnected
- **Write Rate:** InfluxDB writes per second
- **Write Latency:** Should be <200ms
  - 🟢 Healthy: <200ms
  - 🟡 Warning: 200-500ms
  - 🔴 Critical: >500ms
- **Write Errors:** Total InfluxDB write failures

## Common Incidents

### 1. High Error Rate

**Symptoms:**
- Error rate >5% on Operational Health Dashboard
- HTTP 4xx/5xx errors in logs

**Investigation:**
1. Check the Operational Health Dashboard error rate metric
2. Review recent application logs:
   ```bash
   docker logs dora-metrics-service --tail 100
   ```
3. Check for GitHub webhook signature validation failures
4. Verify API key configuration

**Resolution:**
- If webhook signature failures: Verify `WEBHOOK_SECRET` environment variable
- If database errors: Check InfluxDB connection status
- Restart the service if needed:
  ```bash
  docker-compose restart dora-metrics-service
  ```

### 2. InfluxDB Connection Failure

**Symptoms:**
- InfluxDB Status shows "Disconnected" on Operational Health Dashboard
- influxdb_connection_status metric = 0
- Write errors increasing

**Investigation:**
1. Check InfluxDB container status:
   ```bash
   docker ps | grep influxdb
   ```
2. Check InfluxDB logs:
   ```bash
   docker logs influxdb --tail 50
   ```
3. Verify InfluxDB is accessible:
   ```bash
   curl http://localhost:8086/health
   ```

**Resolution:**
- Restart InfluxDB:
  ```bash
  docker-compose restart influxdb
  ```
- Verify connection in service logs
- If data corruption: Restore from backup

### 3. Queue Backlog Building Up

**Symptoms:**
- Queue depth >50 events on Operational Health Dashboard
- Processing latency increasing
- Events taking longer than 5 seconds to process

**Investigation:**
1. Check the Queue Processing section on Operational Health Dashboard
2. Review queue depth trend
3. Check system resource usage:
   ```bash
   docker stats
   ```
4. Review recent webhook processing logs

**Resolution:**
- Scale up processing if needed (currently single-threaded)
- Check for slow InfluxDB writes causing bottleneck
- Investigate specific event types causing delays
- Consider implementing webhook retry with exponential backoff

### 4. Dashboard Not Loading

**Symptoms:**
- Dashboard shows "Failed to fetch metrics"
- API endpoints returning errors

**Investigation:**
1. Check service health endpoint:
   ```bash
   curl http://localhost:3000/health
   ```
2. Check if service is running:
   ```bash
   docker ps | grep dora-metrics-service
   ```
3. Review application logs for errors

**Resolution:**
- Restart the service:
  ```bash
  docker-compose restart dora-metrics-service
  ```
- Verify all environment variables are set correctly
- Check for port conflicts

### 5. No Metrics Data

**Symptoms:**
- Dashboard loads but shows no data
- DORA metrics showing 0 or N/A

**Investigation:**
1. Check if webhooks are being received:
   ```bash
   curl http://localhost:3000/metrics | grep webhooks_received_total
   ```
2. Verify GitHub webhook configuration points to correct endpoint
3. Check webhook delivery history in GitHub repository settings
4. Review InfluxDB for stored metrics:
   ```bash
   docker exec -it influxdb influx -database dora_metrics -execute 'SHOW MEASUREMENTS'
   ```

**Resolution:**
- Redeliver recent webhooks from GitHub UI
- Verify webhook secret matches configuration
- Seed test data for development:
  ```bash
  npm run seed
  ```

## Health Check Procedures

### Quick Health Check (Every 4 hours)
1. Visit Operational Health Dashboard
2. Verify all status indicators are green (🟢)
3. Check uptime is continuous
4. Confirm queue depth <10

### Daily Health Check
1. Review both dashboards for anomalies
2. Export operational metrics for daily record
3. Check InfluxDB storage utilization
4. Review application logs for warnings

### Weekly Health Review
1. Analyze DORA metrics trends
2. Review error patterns in logs
3. Check for any degradation in response times
4. Verify data retention policies are working (90 days)
5. Test alert mechanisms if configured

## Escalation

### Priority Levels

**P0 - Critical:**
- Service completely down
- InfluxDB disconnected for >15 minutes
- Error rate >10%
- Data loss detected

**P1 - High:**
- Queue depth >100
- Response time >5 seconds
- Error rate 5-10%
- Intermittent InfluxDB connection

**P2 - Medium:**
- Queue depth 50-100
- Response time 2-5 seconds
- Error rate 1-5%
- Individual webhook failures

**P3 - Low:**
- Minor performance degradation
- Non-critical warnings in logs

### Contact Information
- Primary: On-call engineer (PagerDuty/Slack)
- Secondary: Development team lead
- Escalation: Engineering manager

## Maintenance Windows

### Routine Maintenance
- Database backups: Daily at 02:00 UTC
- Log rotation: Weekly
- Metric cleanup: Automatic (90-day retention)

### Deployment
- Use blue-green deployment strategy
- Monitor dashboards for 15 minutes post-deployment
- Rollback procedure available via `./scripts/rollback.sh`

## Useful Commands

```bash
# View service logs
docker logs dora-metrics-service -f

# Check all service status
docker-compose ps

# Restart all services
docker-compose restart

# Export current operational metrics
curl -o ops-metrics.csv http://localhost:3000/api/ops/export

# View Prometheus metrics
curl http://localhost:3000/metrics

# Health check
curl http://localhost:3000/health

# Seed test data
npm run seed

# Run tests
npm test

# Check InfluxDB measurements
docker exec -it influxdb influx -database dora_metrics -execute 'SHOW MEASUREMENTS'

# Query recent deployments
docker exec -it influxdb influx -database dora_metrics -execute 'SELECT * FROM deployments ORDER BY time DESC LIMIT 10'
```

## Additional Resources

- [Deployment Documentation](./DEPLOYMENT.md)
- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)
- [README](./README.md)
- GitHub Repository: https://github.com/curtisnn/dora-metrics-service
