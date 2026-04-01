# DORA Metrics Ingestion Service

Event ingestion service for collecting DORA (DevOps Research and Assessment) metrics via webhooks and API endpoints.

## Features

- ✅ GitHub webhook receiver for deployment events
- ✅ **Metric calculation engine:** Deployment frequency and lead time calculation
- ✅ **InfluxDB integration:** Time-series metrics storage with 90-day retention
- ✅ **Background processing:** Automatic event queue processing every 5 seconds
- ✅ **Idempotency:** Duplicate event handling using delivery IDs
- ✅ **DORA Metrics Dashboard:** Real-time visualization with auto-refresh
- ✅ Custom deployment event API
- ✅ Incident tracking API
- ✅ Request ID tracking for distributed tracing
- ✅ Structured logging with Winston
- ✅ Environment variable validation with Zod
- ✅ Comprehensive error handling
- ✅ Health check endpoint
- ✅ Docker support with multi-stage builds
- ✅ TypeScript with strict mode

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express 4.x
- **Language:** TypeScript 5.x
- **Logging:** Winston
- **Validation:** Zod
- **Container:** Docker

## Prerequisites

- Node.js 20 or higher
- npm or yarn
- Docker and Docker Compose (for containerized deployment)

## Quick Start

### Local Development

1. **Clone and navigate to the project:**
   ```bash
   cd dora-metrics-ingestion
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` and configure required variables:**
   ```bash
   PORT=3000
   NODE_ENV=development
   LOG_LEVEL=info
   WEBHOOK_SECRET=your-secret-here
   API_KEY=your-api-key-here
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

   The server will start at `http://localhost:3000` with hot-reloading enabled.

6. **Build TypeScript:**
   ```bash
   npm run build
   ```

7. **Start production server:**
   ```bash
   npm start
   ```

### Docker Deployment

1. **Set up InfluxDB (one-time setup):**
   ```bash
   ./scripts/setup-influxdb.sh
   ```

   This will:
   - Start InfluxDB container
   - Create the database with 90-day retention
   - Generate and configure API token in `.env`
   - Verify the connection

2. **Build and start with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

3. **Run in detached mode:**
   ```bash
   docker-compose up -d
   ```

4. **View logs:**
   ```bash
   docker-compose logs -f ingestion
   ```

5. **Stop services:**
   ```bash
   docker-compose down
   ```

### Manual Docker Build

```bash
# Build image
docker build -t dora-ingestion:latest .

# Run container
docker run -p 3000:3000 --env-file .env dora-ingestion:latest
```

## API Endpoints

### Health Check

**GET `/health`**

Returns service health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-03-31T22:00:00.000Z",
  "uptime": 1234,
  "environment": "production"
}
```

### GitHub Webhook

**POST `/webhooks/github`**

Receives and validates GitHub webhooks for deployment tracking.

**Supported Event Types:**
- `deployment` - New deployment created
- `deployment_status` - Deployment status updated
- `push` - Code pushed to repository

**Headers:**
- `Content-Type: application/json`
- `X-GitHub-Event: <event-type>` (required)
- `X-GitHub-Delivery: <delivery-id>` (required)
- `X-Hub-Signature-256: <signature>` (required if `WEBHOOK_SECRET` configured)

**Security:**
- Webhook signature verification using HMAC SHA-256
- Validates GitHub webhook signature against configured secret
- Rejects requests with invalid or missing signatures (403 Forbidden)
- Skips verification if `WEBHOOK_SECRET` not configured (development mode)

**Payload:** GitHub webhook payload (varies by event type)

**Response (Success - 202 Accepted):**
```json
{
  "message": "Webhook received and queued",
  "requestId": "uuid-here",
  "eventId": "event-uuid"
}
```

**Response (Invalid Signature - 403 Forbidden):**
```json
{
  "error": {
    "message": "Invalid webhook signature",
    "requestId": "uuid-here"
  }
}
```

**Response (Invalid Payload - 400 Bad Request):**
```json
{
  "error": {
    "message": "Invalid webhook payload",
    "requestId": "uuid-here",
    "details": [...]
  }
}
```

**Webhook Event Logging:**
- All webhook events logged to `logs/webhooks.log`
- Error events logged to `logs/webhooks-error.log`
- Log rotation: 10MB max per file, 5 files retained
- Includes full payload for debugging

### Custom Deployment Event

**POST `/events/deployment`**

Receives custom deployment events.

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "timestamp": "2026-03-31T14:05:00Z",
  "environment": "production",
  "commitSha": "a1b2c3d4",
  "status": "success",
  "duration": 120,
  "repository": "myorg/myapp"
}
```

**Response:**
```json
{
  "message": "Deployment event received",
  "requestId": "uuid-here"
}
```

### Incident Event

**POST `/events/incident`**

Receives incident events for MTTR calculation.

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "timestamp": "2026-03-31T15:00:00Z",
  "severity": "high",
  "status": "resolved",
  "relatedDeployment": "a1b2c3d4",
  "description": "API latency spike",
  "resolvedAt": "2026-03-31T15:45:00Z"
}
```

**Response:**
```json
{
  "message": "Incident event received",
  "requestId": "uuid-here"
}
```

## DORA Metrics Dashboard

The service includes a real-time dashboard for visualizing DORA metrics.

### Accessing the Dashboard

**URL:** `http://localhost:3000/dashboard/`

The dashboard displays:
- **Deployment Frequency:** Average deployments per day (7-day rolling average)
- **Lead Time for Changes:** Average lead time in hours (7-day rolling average)
- **30-day Trend Charts:** Time-series visualization of both metrics

### Features

- ✅ Auto-refresh every 30 seconds
- ✅ Responsive design (mobile-friendly)
- ✅ Clean, modern UI with gradient theme
- ✅ Real-time status indicator
- ✅ Chart.js visualizations with smooth animations

### Dashboard API

**GET `/api/dashboard`**

Returns aggregated DORA metrics for dashboard visualization.

**Query Parameters:**
- `days` (optional) - Number of days to query (1-365, default: 30)

**Response:**
```json
{
  "data": {
    "deploymentFrequency": {
      "current": 3.2,
      "trend": [
        { "time": "2026-03-01T00:00:00Z", "value": 3 },
        { "time": "2026-03-02T00:00:00Z", "value": 4 }
      ]
    },
    "leadTime": {
      "current": 2.5,
      "trend": [
        { "time": "2026-03-01T00:00:00Z", "value": 2.3 },
        { "time": "2026-03-02T00:00:00Z", "value": 2.7 }
      ]
    }
  },
  "meta": {
    "days": 30,
    "generatedAt": "2026-03-31T23:00:00Z",
    "requestId": "uuid-here"
  }
}
```

### Testing with Sample Data

Generate test data for dashboard visualization:

```bash
npx tsx scripts/seed-test-data.ts
```

This creates ~90 deployment events across 30 days with realistic patterns:
- 2-5 deployments per day
- Lead times between 30-240 minutes
- 95% success rate
- Multiple repositories and environments

## Monitoring & Observability

The service includes comprehensive monitoring with Prometheus and Grafana for operational visibility.

### Architecture

- **Prometheus:** Collects metrics from the service `/metrics` endpoint every 10 seconds
- **Grafana:** Provides dashboards for visualization and alerting
- **InfluxDB:** Stores DORA metrics data (separate from operational metrics)

### Monitoring Stack

When running with Docker Compose, three monitoring services are available:

1. **Application:** `http://localhost:3000` - DORA metrics ingestion service
2. **Grafana:** `http://localhost:3001` - Monitoring dashboards (admin/admin)
3. **Prometheus:** `http://localhost:9090` - Metrics database

### Health Check Endpoint

**GET `/health`**

Returns comprehensive service health status including:
- Overall service status (healthy/degraded/unhealthy)
- InfluxDB connection status
- Webhook processing queue depth
- Metric processor status
- Service uptime

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-03-31T22:00:00.000Z",
  "uptime": 1234,
  "environment": "production",
  "checks": {
    "influxdb": {
      "status": "connected",
      "enabled": true
    },
    "queue": {
      "status": "healthy",
      "pending": 5,
      "processed": 120,
      "total": 125,
      "maxSize": 1000
    },
    "processor": {
      "status": "running",
      "intervalMs": 5000,
      "isProcessing": false
    }
  }
}
```

**Status Codes:**
- `200` - Service is healthy or degraded
- `503` - Service is unhealthy

### Metrics Endpoint

**GET `/metrics`**

Prometheus-compatible metrics endpoint exposing operational metrics:

**Application Metrics:**
- `app_uptime_seconds` - Service uptime in seconds
- `http_requests_total` - Total HTTP requests (by method, route, status)
- `http_request_duration_seconds` - HTTP request duration histogram
- `http_errors_total` - Total HTTP errors (by type)

**Webhook Metrics:**
- `webhooks_received_total` - Total webhooks received (by event type, status)
- `webhook_processing_duration_seconds` - Webhook processing duration histogram
- `webhook_queue_depth` - Current webhook queue depth

**InfluxDB Metrics:**
- `influxdb_connection_status` - InfluxDB connection status (1=connected, 0=disconnected)
- `influxdb_writes_total` - Total InfluxDB writes (by measurement, status)
- `influxdb_write_duration_seconds` - InfluxDB write duration histogram

### Grafana Dashboard

Access the pre-configured monitoring dashboard at `http://localhost:3001`

**Login Credentials:**
- Username: `admin`
- Password: `admin`

**Dashboard Panels:**
1. **Service Uptime** - Application uptime in seconds
2. **InfluxDB Connection** - Real-time connection status
3. **Queue Depth** - Current webhook processing queue depth
4. **HTTP Request Rate** - Requests per second by endpoint
5. **HTTP Response Time** - p95 and p99 latency percentiles
6. **Webhook Processing Rate** - Webhooks processed per second
7. **Webhook Processing Duration** - p95 and p99 processing time
8. **InfluxDB Write Rate** - Writes per second by measurement
9. **Error Rate** - Errors per second by type

The dashboard auto-refreshes every 10 seconds and displays the last hour of data by default.

### Prometheus Configuration

The Prometheus configuration is located at `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'dora-metrics-ingestion'
    static_configs:
      - targets: ['ingestion:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

Metrics are retained for 90 days by default.

### Alerting (Future Enhancement)

To add alerting capabilities:

1. Create `alerts.yml` with alert rules:
   ```yaml
   groups:
     - name: dora_metrics_alerts
       rules:
         - alert: HighQueueDepth
           expr: webhook_queue_depth > 100
           for: 5m
           annotations:
             summary: "High webhook queue depth detected"
   ```

2. Uncomment the alerting section in `prometheus.yml`
3. Set up Alertmanager container in `docker-compose.yml`
4. Configure notification channels (email, Slack, PagerDuty)

### Monitoring Best Practices

**For Production Deployments:**

1. **Set up alerting** for critical metrics:
   - Queue depth >100 for 5+ minutes
   - InfluxDB disconnected for 1+ minute
   - Error rate >5% for 5+ minutes
   - Metric processor stopped

2. **Configure retention** based on compliance requirements:
   - Prometheus: Default 90 days (adjustable via `--storage.tsdb.retention.time`)
   - InfluxDB: Default 90 days (configured in `docker-compose.yml`)

3. **Monitor dashboard performance**:
   - Keep query time windows reasonable (<7 days for high-resolution data)
   - Use downsampling for long-term trends

4. **Set up log aggregation** (ELK, Loki, CloudWatch) for:
   - Structured logs from Winston
   - Webhook processing errors
   - InfluxDB write failures

5. **Create runbooks** for common issues:
   - High queue depth → Scale horizontally or investigate processing bottlenecks
   - InfluxDB disconnected → Check network, credentials, and InfluxDB health
   - High error rate → Check webhook signatures, payload validation, and dependencies

### Troubleshooting

**Metrics not appearing in Prometheus:**
```bash
# Check if metrics endpoint is working
curl http://localhost:3000/metrics

# Check Prometheus targets
open http://localhost:9090/targets
```

**Grafana dashboard showing "No Data":**
```bash
# Verify Prometheus is configured in Grafana
# Check datasources at http://localhost:3001/datasources

# Test Prometheus query
curl http://localhost:9090/api/v1/query?query=app_uptime_seconds
```

**High memory usage:**
```bash
# Check queue depth
curl http://localhost:3000/health | jq '.checks.queue'

# Clear processed events
docker-compose restart ingestion
```

## GitHub Webhook Setup

### Option 1: GitHub App (Recommended)

1. **Create a GitHub App:**
   - Go to GitHub Settings → Developer settings → GitHub Apps → New GitHub App
   - Set **Webhook URL** to `https://your-domain.com/webhooks/github`
   - Generate a **Webhook secret** and save it
   - Subscribe to events: `deployment`, `deployment_status`, `push`
   - Save the webhook secret to your `.env` file:
     ```bash
     WEBHOOK_SECRET=your-generated-secret-here
     ```

2. **Install the App:**
   - Install the GitHub App on your organization or repositories
   - Grant necessary permissions (Contents: Read, Deployments: Read)

### Option 2: Repository Webhook

1. **Navigate to Repository Settings:**
   - Go to your repository → Settings → Webhooks → Add webhook

2. **Configure Webhook:**
   - **Payload URL:** `https://your-domain.com/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** Generate a secure random string (use `openssl rand -hex 32`)
   - **Events:** Select individual events:
     - ✅ Deployments
     - ✅ Deployment statuses
     - ✅ Pushes
   - **Active:** ✅ Enabled

3. **Save Webhook Secret:**
   ```bash
   # Add to .env
   WEBHOOK_SECRET=your-webhook-secret-here
   ```

### Testing Webhooks Locally

Use a tool like [ngrok](https://ngrok.com/) or [smee.io](https://smee.io/) to expose your local server:

```bash
# With ngrok
ngrok http 3000

# Update GitHub webhook URL to ngrok URL
# Example: https://abc123.ngrok.io/webhooks/github
```

### Verifying Webhook Delivery

1. **Check GitHub Delivery Status:**
   - Repository Settings → Webhooks → Recent Deliveries
   - View request/response for each delivery
   - Check for 2xx status codes

2. **Check Application Logs:**
   ```bash
   # Console logs
   npm run dev

   # Webhook event logs
   tail -f logs/webhooks.log

   # Error logs
   tail -f logs/webhooks-error.log
   ```

3. **Test with Sample Payload:**
   ```bash
   # Generate signature
   PAYLOAD='{"deployment":{"id":1,"sha":"abc","ref":"main","environment":"production","created_at":"2026-03-31T10:00:00Z","updated_at":"2026-03-31T10:00:00Z","creator":{"login":"test"}},"repository":{"id":1,"name":"repo","full_name":"org/repo"}}'
   SECRET="your-webhook-secret"
   SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p | tr -d '\n')

   # Send test webhook
   curl -X POST http://localhost:3000/webhooks/github \
     -H "Content-Type: application/json" \
     -H "X-GitHub-Event: deployment" \
     -H "X-GitHub-Delivery: test-$(date +%s)" \
     -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
     -d "$PAYLOAD"
   ```

## InfluxDB Setup

### Database Schema

The service writes three measurements to InfluxDB:

#### 1. `deployments` Measurement

Stores raw deployment events with metadata.

**Tags:**
- `environment` - Deployment environment (production, staging, development)
- `status` - Deployment status (success, failure, rollback)
- `repository` - Repository name (org/repo)

**Fields:**
- `commit_sha` (string) - Git commit SHA
- `lead_time_minutes` (float) - Time from commit to deployment
- `delivery_id` (string) - GitHub delivery ID for idempotency

**Timestamp:** Deployment time

**Example:**
```
deployments,environment=production,status=success,repository=myorg/myapp commit_sha="abc123",lead_time_minutes=45.5,delivery_id="gh-123" 1711900800000000000
```

#### 2. `incidents` Measurement

Stores incident and failure events for MTTR calculation.

**Tags:**
- `severity` - Incident severity (critical, high, medium, low)
- `status` - Incident status (open, resolved)
- `repository` - Repository name

**Fields:**
- `description` (string) - Incident description
- `duration_minutes` (float) - Time to resolve (MTTR)
- `related_deployment` (string) - Related deployment SHA

**Timestamp:** Incident start time

**Example:**
```
incidents,severity=high,status=resolved,repository=myorg/myapp description="API latency spike",duration_minutes=120,related_deployment="abc123" 1711900800000000000
```

#### 3. `dora_metrics` Measurement

Stores calculated DORA metrics for reporting and visualization.

**Tags:**
- `metric_name` - Metric type (deployment_frequency, lead_time, mttr, change_failure_rate)
- `window` - Time window (daily, weekly, monthly)
- `environment` - Deployment environment
- `repository` - Repository name

**Fields:**
- `value` (float) - Calculated metric value

**Timestamp:** Calculation time

**Example:**
```
dora_metrics,metric_name=deployment_frequency,window=daily,environment=production,repository=myorg/myapp value=5.5 1711900800000000000
```

### Data Retention

- **Primary bucket:** 90 days detailed metrics
- **Aggregated data:** 1 year (future enhancement)

### Setup Instructions

1. **Automated Setup (Recommended):**
   ```bash
   ./scripts/setup-influxdb.sh
   ```

2. **Manual Setup:**

   a. Start InfluxDB:
   ```bash
   docker-compose up -d influxdb
   ```

   b. Access InfluxDB UI:
   - Open http://localhost:8086
   - Login with credentials from docker-compose.yml
     - Username: `admin`
     - Password: `adminpassword`
     - Organization: `dora-metrics`
     - Bucket: `metrics`

   c. Generate API Token:
   - Go to Data → Tokens
   - Generate All Access Token
   - Copy token to `.env`:
     ```bash
     INFLUXDB_TOKEN=your-token-here
     ```

3. **Verify Connection:**
   ```bash
   npm run dev
   ```

   Check logs for: `InfluxDB connection initialized`

### Querying Data

**Using InfluxDB CLI:**
```bash
docker-compose exec influxdb influx query \
  'from(bucket:"metrics")
   |> range(start: -1h)
   |> filter(fn: (r) => r._measurement == "deployments")'
```

**Using Flux Query Language:**
```flux
from(bucket: "metrics")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "dora_metrics")
  |> filter(fn: (r) => r.metric_name == "deployment_frequency")
  |> filter(fn: (r) => r.environment == "production")
```

## Metric Calculation

### Overview

The service includes a **MetricCalculationService** that processes webhook events from the queue and calculates DORA metrics in real-time.

### Features

- **Deployment Frequency:** Counts successful deployments per time window (daily/weekly/monthly)
- **Lead Time for Changes:** Calculates time from commit to deployment
- **Idempotency:** Handles duplicate events using GitHub delivery IDs
- **Data Validation:** Rejects invalid timestamps and negative lead times
- **Caching:** Stores commit timestamps for lead time calculation (5000 commits max)
- **Background Processing:** Runs every 5 seconds to process queued events

### How It Works

1. **Push Events:** When GitHub sends a `push` event, commit timestamps are extracted and cached
2. **Deployment Events:** When a `deployment_status` event with state `success` is received:
   - Looks up the commit timestamp from cache
   - Calculates lead time (deployment time - commit time)
   - Writes deployment record to InfluxDB `deployments` measurement
   - Writes deployment frequency metric to `dora_metrics` measurement
   - Writes lead time metric to `dora_metrics` measurement (if commit timestamp available)

### Event Processing Flow

```
GitHub Webhook → Queue → MetricProcessor → MetricCalculation → InfluxDB
                   ↓
              (5s interval)
                   ↓
         Process all pending events
```

### Validation Rules

- **Timestamps:** Must be within 1 year of current time (past or future)
- **Lead Time:** Must be positive (deployment after commit)
- **Duplicate Events:** Skipped based on GitHub delivery ID
- **Deployment States:** Only `success` states generate metrics

### Monitoring

Check the service logs for metric calculation activity:

```bash
# Successful metric calculation
"Lead time calculated" - commitSha, leadTimeMinutes, timestamps

# Deployment metrics written
"Deployment metrics written" - repository, environment, commitSha

# Queue processing summary
"Queue processing completed" - processed count, errors, queue stats
```

### Cache Statistics

Get cache statistics for monitoring:

```typescript
import { metricCalculationService } from './services/metricCalculation';

const stats = metricCalculationService.getStats();
// Returns:
// {
//   processedDeliveryIds: number,    // Duplicate tracking cache size
//   commitTimestamps: number,         // Commit cache size
//   maxProcessedIds: 10000,
//   maxCommitCache: 5000
// }
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm test -- --coverage

# Run specific test file
npm test githubWebhook.test.ts

# Run tests in silent mode (less verbose)
npm test -- --silent
```

### Test Structure

```
src/__tests__/
├── fixtures/
│   └── webhooks.ts          # Mock GitHub webhook payloads
├── eventQueue.test.ts       # Event queue unit tests
├── githubWebhook.test.ts    # Webhook endpoint integration tests
├── healthController.test.ts # Health check tests
└── influxdb.test.ts         # InfluxDB service tests
```

### Test Coverage

**Current Coverage:**
- **Overall:** ~65% statement coverage
- **Target:** >80% coverage on core logic

**Coverage by Component:**
- ✅ Webhook handling: 96.96%
- ✅ Event queue: 93.02%
- ✅ Health endpoint: 100%
- ✅ Routes: 100%
- ⚠️  InfluxDB service: 43.33% (requires test database)
- ⚠️  Error handler: 31.81% (error scenarios)

**Generate coverage report:**
```bash
npm test -- --coverage
# Opens coverage report in: coverage/lcov-report/index.html
```

### Test Categories

#### Unit Tests
- **Event Queue:** Enqueue, dequeue, mark processed, cleanup
- **Webhook Parsing:** Payload validation, signature verification
- **InfluxDB Service:** Write operations (mocked when DB unavailable)

#### Integration Tests
- **GitHub Webhooks:** Full request → validation → queue flow
- **Health Check:** Full HTTP request/response cycle
- **Error Handling:** Invalid payloads, missing headers, signature failures

### Test Fixtures

Webhook fixtures are available in `src/__tests__/fixtures/webhooks.ts`:
- `validDeploymentPayload` - Valid deployment event
- `validDeploymentStatusPayload` - Deployment status update
- `validPushPayload` - Git push event
- `stagingDeploymentPayload` - Staging environment deployment
- `failedDeploymentStatusPayload` - Failed deployment
- `multipleCcommitsPushPayload` - Multi-commit push
- `malformedDeploymentPayload` - Invalid payload (missing fields)
- `unsupportedEventPayload` - Unsupported GitHub event

### Integration Testing with Test InfluxDB

For full integration tests with a real InfluxDB instance:

1. **Start test InfluxDB:**
   ```bash
   docker-compose -f docker-compose.test.yml up -d
   ```

   This starts an ephemeral InfluxDB instance on port 8087 with:
   - Organization: `test-org`
   - Bucket: `test-metrics`
   - Token: `test-token-12345`
   - Data stored in tmpfs (deleted on stop)

2. **Configure test environment:**
   ```bash
   export INFLUXDB_URL=http://localhost:8087
   export INFLUXDB_TOKEN=test-token-12345
   export INFLUXDB_ORG=test-org
   export INFLUXDB_BUCKET=test-metrics
   ```

3. **Run integration tests:**
   ```bash
   npm test
   ```

4. **Clean up test database:**
   ```bash
   docker-compose -f docker-compose.test.yml down
   ```

### CI/CD Test Execution

**Test suite requirements for CI:**
- ✅ All tests pass
- ✅ Coverage >80% on core logic
- ✅ Test suite completes in <30 seconds
- ✅ No test leaks or hanging handles

**GitHub Actions example:**
```yaml
- name: Run tests
  run: npm test -- --coverage --ci

- name: Check coverage threshold
  run: |
    npm test -- --coverage --coverageThreshold='{"global":{"statements":80}}'
```

### Manual Testing

**Test health endpoint:**
```bash
curl http://localhost:3000/health
```

**Test deployment event:**
```bash
curl -X POST http://localhost:3000/events/deployment \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-03-31T14:05:00Z",
    "environment": "production",
    "commitSha": "abc123",
    "status": "success",
    "repository": "test/repo"
  }'
```

**Test webhook with signature:**
```bash
# Generate valid signature
PAYLOAD='{"deployment":{"id":1,"sha":"abc","ref":"main","environment":"production","created_at":"2026-03-31T10:00:00Z","updated_at":"2026-03-31T10:00:00Z","creator":{"login":"test"}},"repository":{"id":1,"name":"repo","full_name":"org/repo"}}'
SECRET="your-webhook-secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p | tr -d '\n')

curl -X POST http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: deployment" \
  -H "X-GitHub-Delivery: test-$(date +%s)" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

## Project Structure

```
.
├── src/
│   ├── __tests__/
│   │   ├── githubWebhook.test.ts
│   │   └── influxdb.test.ts
│   ├── config/
│   │   ├── env.ts           # Environment variable validation
│   │   └── logger.ts        # Winston logging configuration
│   ├── controllers/
│   │   ├── healthController.ts
│   │   └── webhookController.ts
│   ├── middleware/
│   │   ├── errorHandler.ts  # Error handling middleware
│   │   ├── githubWebhook.ts # GitHub webhook verification
│   │   └── requestId.ts     # Request ID middleware
│   ├── routes/
│   │   ├── healthRoutes.ts
│   │   └── webhookRoutes.ts
│   ├── services/
│   │   ├── eventQueue.ts    # In-memory event queue
│   │   └── influxdb.ts      # InfluxDB client and writers
│   ├── types/
│   │   └── index.ts         # TypeScript type definitions
│   ├── app.ts               # Express app configuration
│   └── index.ts             # Server entry point
├── scripts/
│   └── setup-influxdb.sh    # InfluxDB initialization script
├── dist/                    # Compiled JavaScript (generated)
├── logs/                    # Application logs (generated)
├── Dockerfile
├── docker-compose.yml
├── tsconfig.json
├── package.json
└── README.md
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment (development/production/test) |
| `LOG_LEVEL` | No | `info` | Log level (error/warn/info/debug) |
| `WEBHOOK_SECRET` | No | - | GitHub webhook secret for signature verification |
| `API_KEY` | No | - | API key for authenticated endpoints |
| `INFLUXDB_URL` | No | `http://localhost:8086` | InfluxDB connection URL |
| `INFLUXDB_TOKEN` | No | - | InfluxDB authentication token (required for metrics storage) |
| `INFLUXDB_ORG` | No | `dora-metrics` | InfluxDB organization |
| `INFLUXDB_BUCKET` | No | `metrics` | InfluxDB bucket name |

## Logging

Logs include:
- **Timestamp:** ISO 8601 format
- **Level:** error, warn, info, debug
- **Request ID:** UUID for tracing requests across services
- **Structured metadata:** JSON format with contextual information

**Log format (development):**
```
2026-03-31 14:05:23 info [abc-123-def]: Server started {"port":3000,"environment":"development"}
```

**Log format (production):**
```json
{
  "timestamp": "2026-03-31 14:05:23",
  "level": "info",
  "message": "Server started",
  "requestId": "abc-123-def",
  "port": 3000,
  "environment": "production",
  "service": "dora-ingestion"
}
```

## Error Handling

All errors include:
- Request ID for tracing
- Appropriate HTTP status codes
- Structured error messages
- Stack traces in development mode

**Error response format:**
```json
{
  "error": {
    "message": "Validation failed",
    "requestId": "uuid-here",
    "details": [...]
  }
}
```

## Deployment

For production deployment procedures, rollback instructions, and troubleshooting guides, see:

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Comprehensive deployment guide
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist template

**Quick deployment scripts:**
```bash
# Deploy new version
./scripts/deploy.sh production

# Run health checks
./scripts/health-check.sh

# Emergency rollback
./scripts/rollback.sh backup-20260331-140530
```

## Next Steps

- [x] Integrate with InfluxDB for metric storage
- [x] Set up InfluxDB and storage schema
- [x] Implement event processing from queue
- [x] Add metric calculation service
- [x] Add DORA metrics dashboard with visualization
- [x] Implement GitHub webhook signature verification
- [x] Add in-memory event queue
- [x] Add webhook event file logging
- [x] Add comprehensive test suite for webhooks
- [x] Document deployment process (DEPLOYMENT.md)
- [ ] Add API key authentication middleware for custom endpoints
- [ ] Set up CI/CD pipeline
- [ ] Add monitoring and alerting

## Architecture Reference

See [Architecture Design Document](/GHX/issues/GHX-6#document-design) for full system architecture and integration details.

## License

MIT
