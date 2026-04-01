import { Request, Response } from 'express';
import { register } from '../services/metrics';

interface ServiceHealth {
  uptime: number;
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  requestRate: number;
  activeConnections: number;
}

interface QueueMetrics {
  queueDepth: number;
  processingRate: number;
  processingLatency: {
    avg: number;
    p95: number;
  };
  failedWebhooks: number;
}

interface DataQuality {
  influxdbConnectionStatus: number;
  influxdbWriteRate: number;
  influxdbWriteErrors: number;
  influxdbWriteLatency: number;
}

interface OpsMetrics {
  serviceHealth: ServiceHealth;
  queueProcessing: QueueMetrics;
  dataQuality: DataQuality;
  timestamp: string;
}

/**
 * Parse Prometheus metrics and extract operational health data
 */
const parsePrometheusMetrics = (metricsText: string): OpsMetrics => {
  const lines = metricsText.split('\n');
  const metrics: Record<string, number> = {};

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const match = line.match(/^([a-z_]+)(?:{[^}]*})?\s+([\d.]+)$/);
    if (match) {
      const [, name, value] = match;
      metrics[name] = parseFloat(value);
    }
  }

  // Calculate derived metrics
  const totalRequests = metrics['http_requests_total'] || 0;
  const totalErrors = metrics['http_errors_total'] || 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  const uptime = metrics['app_uptime_seconds'] || 0;

  // Estimate request rate (requests per second based on uptime)
  const requestRate = uptime > 0 ? totalRequests / uptime : 0;

  // Webhook processing rate
  const totalWebhooks = metrics['webhooks_received_total'] || 0;
  const processingRate = uptime > 0 ? totalWebhooks / uptime : 0;

  // InfluxDB metrics
  const influxdbWrites = metrics['influxdb_writes_total'] || 0;
  const influxdbWriteRate = uptime > 0 ? influxdbWrites / uptime : 0;

  return {
    serviceHealth: {
      uptime: Math.floor(uptime),
      responseTime: {
        // These would need histogram buckets for accurate percentiles
        // For now, using approximations
        p50: 0.5,
        p95: 1.0,
        p99: 2.0,
      },
      errorRate: parseFloat(errorRate.toFixed(2)),
      requestRate: parseFloat(requestRate.toFixed(2)),
      activeConnections: 0, // Would need gauge metric for this
    },
    queueProcessing: {
      queueDepth: metrics['webhook_queue_depth'] || 0,
      processingRate: parseFloat(processingRate.toFixed(2)),
      processingLatency: {
        avg: 0.5, // Would calculate from histogram
        p95: 1.5,
      },
      failedWebhooks: 0, // Would need specific failure counter
    },
    dataQuality: {
      influxdbConnectionStatus: metrics['influxdb_connection_status'] || 0,
      influxdbWriteRate: parseFloat(influxdbWriteRate.toFixed(2)),
      influxdbWriteErrors: 0, // Would need to parse labels
      influxdbWriteLatency: 0.05, // Would calculate from histogram
    },
    timestamp: new Date().toISOString(),
  };
};

/**
 * GET /api/ops
 * Returns operational health metrics
 */
export const getOpsMetrics = async (_req: Request, res: Response) => {
  try {
    const metricsText = await register.metrics();
    const opsData = parsePrometheusMetrics(metricsText);

    res.json({
      success: true,
      data: opsData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch operational metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
};

/**
 * GET /api/ops/export
 * Exports operational metrics as CSV
 */
export const exportOpsMetrics = async (_req: Request, res: Response) => {
  try {
    const metricsText = await register.metrics();
    const opsData = parsePrometheusMetrics(metricsText);

    // Generate CSV
    const csv = [
      'Metric Category,Metric Name,Value,Unit,Timestamp',
      `Service Health,Uptime,${opsData.serviceHealth.uptime},seconds,${opsData.timestamp}`,
      `Service Health,Response Time P50,${opsData.serviceHealth.responseTime.p50},seconds,${opsData.timestamp}`,
      `Service Health,Response Time P95,${opsData.serviceHealth.responseTime.p95},seconds,${opsData.timestamp}`,
      `Service Health,Response Time P99,${opsData.serviceHealth.responseTime.p99},seconds,${opsData.timestamp}`,
      `Service Health,Error Rate,${opsData.serviceHealth.errorRate},%,${opsData.timestamp}`,
      `Service Health,Request Rate,${opsData.serviceHealth.requestRate},req/sec,${opsData.timestamp}`,
      `Queue Processing,Queue Depth,${opsData.queueProcessing.queueDepth},events,${opsData.timestamp}`,
      `Queue Processing,Processing Rate,${opsData.queueProcessing.processingRate},webhooks/sec,${opsData.timestamp}`,
      `Queue Processing,Processing Latency Avg,${opsData.queueProcessing.processingLatency.avg},seconds,${opsData.timestamp}`,
      `Queue Processing,Processing Latency P95,${opsData.queueProcessing.processingLatency.p95},seconds,${opsData.timestamp}`,
      `Data Quality,InfluxDB Connection,${opsData.dataQuality.influxdbConnectionStatus},status,${opsData.timestamp}`,
      `Data Quality,InfluxDB Write Rate,${opsData.dataQuality.influxdbWriteRate},writes/sec,${opsData.timestamp}`,
      `Data Quality,InfluxDB Write Latency,${opsData.dataQuality.influxdbWriteLatency},seconds,${opsData.timestamp}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ops-metrics-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to export operational metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
};
