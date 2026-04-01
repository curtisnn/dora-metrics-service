import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry which registers the metrics
export const register = new Registry();

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// HTTP request counter
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HTTP error counter
export const httpErrorCounter = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [register],
});

// Webhook processing metrics
export const webhookProcessingDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Duration of webhook processing in seconds',
  labelNames: ['event_type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const webhookCounter = new Counter({
  name: 'webhooks_received_total',
  help: 'Total number of webhooks received',
  labelNames: ['event_type', 'status'],
  registers: [register],
});

// Queue depth gauge
export const queueDepth = new Gauge({
  name: 'webhook_queue_depth',
  help: 'Current depth of webhook processing queue',
  registers: [register],
});

// InfluxDB metrics
export const influxdbWriteCounter = new Counter({
  name: 'influxdb_writes_total',
  help: 'Total number of writes to InfluxDB',
  labelNames: ['measurement', 'status'],
  registers: [register],
});

export const influxdbWriteDuration = new Histogram({
  name: 'influxdb_write_duration_seconds',
  help: 'Duration of InfluxDB write operations in seconds',
  labelNames: ['measurement'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const influxdbConnectionStatus = new Gauge({
  name: 'influxdb_connection_status',
  help: 'InfluxDB connection status (1 = connected, 0 = disconnected)',
  registers: [register],
});

// Application uptime
export const appUptime = new Gauge({
  name: 'app_uptime_seconds',
  help: 'Application uptime in seconds',
  registers: [register],
});

const startTime = Date.now();

// Update uptime every 10 seconds
setInterval(() => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  appUptime.set(uptimeSeconds);
}, 10000);

// Initialize uptime
appUptime.set(0);
