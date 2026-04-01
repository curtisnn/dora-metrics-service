import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * InfluxDB service for writing DORA metrics
 *
 * Schema:
 * - deployments: raw deployment events with metadata
 * - incidents: incident/failure events
 * - dora_metrics: calculated DORA metrics (deployment frequency, lead time, MTTR, change failure rate)
 */
class InfluxDBService {
  private client: InfluxDB | null = null;
  private writeApi: WriteApi | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const { INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET } = env;

    if (!INFLUXDB_URL || !INFLUXDB_TOKEN || !INFLUXDB_ORG || !INFLUXDB_BUCKET) {
      logger.warn('InfluxDB not configured - metrics storage disabled', {
        configured: {
          url: !!INFLUXDB_URL,
          token: !!INFLUXDB_TOKEN,
          org: !!INFLUXDB_ORG,
          bucket: !!INFLUXDB_BUCKET,
        },
      });
      return;
    }

    try {
      this.client = new InfluxDB({
        url: INFLUXDB_URL,
        token: INFLUXDB_TOKEN,
      });

      this.writeApi = this.client.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET, 'ns');

      // Use gzip compression for better network performance
      this.writeApi.useDefaultTags({ service: 'dora-metrics-ingestion' });

      this.enabled = true;

      logger.info('InfluxDB connection initialized', {
        url: INFLUXDB_URL,
        org: INFLUXDB_ORG,
        bucket: INFLUXDB_BUCKET,
      });
    } catch (error) {
      logger.error('Failed to initialize InfluxDB connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if InfluxDB is enabled and ready
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Write a deployment event to InfluxDB
   *
   * Measurement: deployments
   * Tags: environment, status, repository
   * Fields: commit_sha, lead_time_minutes, delivery_id
   */
  async writeDeployment(data: {
    timestamp: Date;
    environment: string;
    status: 'success' | 'failure' | 'rollback';
    repository: string;
    commitSha: string;
    leadTimeMinutes?: number;
    deliveryId?: string;
  }): Promise<void> {
    if (!this.enabled || !this.writeApi) {
      logger.debug('InfluxDB write skipped - not enabled', { measurement: 'deployments' });
      return;
    }

    const point = new Point('deployments')
      .tag('environment', data.environment)
      .tag('status', data.status)
      .tag('repository', data.repository)
      .stringField('commit_sha', data.commitSha)
      .timestamp(data.timestamp);

    if (data.leadTimeMinutes !== undefined) {
      point.floatField('lead_time_minutes', data.leadTimeMinutes);
    }

    if (data.deliveryId) {
      point.stringField('delivery_id', data.deliveryId);
    }

    this.writeApi.writePoint(point);

    logger.debug('Deployment event written to InfluxDB', {
      measurement: 'deployments',
      environment: data.environment,
      repository: data.repository,
      timestamp: data.timestamp.toISOString(),
    });
  }

  /**
   * Write an incident event to InfluxDB
   *
   * Measurement: incidents
   * Tags: severity, status, repository
   * Fields: description, duration_minutes, related_deployment
   */
  async writeIncident(data: {
    timestamp: Date;
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'open' | 'resolved';
    repository: string;
    description: string;
    durationMinutes?: number;
    relatedDeployment?: string;
  }): Promise<void> {
    if (!this.enabled || !this.writeApi) {
      logger.debug('InfluxDB write skipped - not enabled', { measurement: 'incidents' });
      return;
    }

    const point = new Point('incidents')
      .tag('severity', data.severity)
      .tag('status', data.status)
      .tag('repository', data.repository)
      .stringField('description', data.description)
      .timestamp(data.timestamp);

    if (data.durationMinutes !== undefined) {
      point.floatField('duration_minutes', data.durationMinutes);
    }

    if (data.relatedDeployment) {
      point.stringField('related_deployment', data.relatedDeployment);
    }

    this.writeApi.writePoint(point);

    logger.debug('Incident event written to InfluxDB', {
      measurement: 'incidents',
      severity: data.severity,
      repository: data.repository,
      timestamp: data.timestamp.toISOString(),
    });
  }

  /**
   * Write a calculated DORA metric to InfluxDB
   *
   * Measurement: dora_metrics
   * Tags: metric_name, window, environment, repository
   * Fields: value
   */
  async writeMetric(data: {
    timestamp: Date;
    metricName: 'deployment_frequency' | 'lead_time' | 'mttr' | 'change_failure_rate';
    value: number;
    window: 'daily' | 'weekly' | 'monthly';
    environment: string;
    repository: string;
  }): Promise<void> {
    if (!this.enabled || !this.writeApi) {
      logger.debug('InfluxDB write skipped - not enabled', { measurement: 'dora_metrics' });
      return;
    }

    const point = new Point('dora_metrics')
      .tag('metric_name', data.metricName)
      .tag('window', data.window)
      .tag('environment', data.environment)
      .tag('repository', data.repository)
      .floatField('value', data.value)
      .timestamp(data.timestamp);

    this.writeApi.writePoint(point);

    logger.debug('DORA metric written to InfluxDB', {
      measurement: 'dora_metrics',
      metricName: data.metricName,
      window: data.window,
      environment: data.environment,
      value: data.value,
      timestamp: data.timestamp.toISOString(),
    });
  }

  /**
   * Flush any pending writes and close the connection
   */
  async close(): Promise<void> {
    if (this.writeApi) {
      try {
        await this.writeApi.close();
        logger.info('InfluxDB connection closed');
      } catch (error) {
        logger.error('Error closing InfluxDB connection', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Flush pending writes without closing the connection
   */
  async flush(): Promise<void> {
    if (this.writeApi) {
      try {
        await this.writeApi.flush();
        logger.debug('InfluxDB writes flushed');
      } catch (error) {
        logger.error('Error flushing InfluxDB writes', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}

// Singleton instance
export const influxDBService = new InfluxDBService();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  await influxDBService.close();
});

process.on('SIGINT', async () => {
  await influxDBService.close();
});
