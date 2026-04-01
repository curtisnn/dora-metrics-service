import { Request, Response } from 'express';
import { env } from '../config/env';
import { HealthStatus } from '../types';
import { influxDBService } from '../services/influxdb';
import { eventQueue } from '../services/eventQueue';
import { metricProcessor } from '../services/metricProcessor';

const startTime = Date.now();
const version = '1.0.0';

export const healthCheck = (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Check InfluxDB connectivity
  const influxdbEnabled = influxDBService.isEnabled();

  // Get queue stats
  const queueStats = eventQueue.getStats();

  // Get processor status
  const processorStatus = metricProcessor.getStatus();

  // Determine overall health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const issues: string[] = [];

  if (!influxdbEnabled) {
    status = 'degraded';
    issues.push('InfluxDB not connected');
  }

  if (queueStats.pending > 100) {
    status = 'degraded';
    issues.push('High queue depth');
  }

  if (!processorStatus.running) {
    status = 'unhealthy';
    issues.push('Metric processor not running');
  }

  const health: HealthStatus = {
    status,
    version,
    timestamp: new Date().toISOString(),
    uptime,
    environment: env.NODE_ENV,
    checks: {
      influxdb: {
        status: influxdbEnabled ? 'connected' : 'disconnected',
        enabled: influxdbEnabled,
      },
      queue: {
        status: queueStats.pending < 100 ? 'healthy' : 'degraded',
        pending: queueStats.pending,
        processed: queueStats.processed,
        total: queueStats.total,
        maxSize: queueStats.maxSize,
      },
      processor: {
        status: processorStatus.running ? 'running' : 'stopped',
        intervalMs: processorStatus.intervalMs,
        isProcessing: processorStatus.isProcessing,
      },
    },
    issues: issues.length > 0 ? issues : undefined,
  };

  // Return 200 for healthy/degraded, 503 for unhealthy
  const statusCode = status === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
};
