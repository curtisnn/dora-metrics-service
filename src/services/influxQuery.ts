import { InfluxDB } from '@influxdata/influxdb-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * InfluxDB query service for reading DORA metrics
 */
class InfluxQueryService {
  private client: InfluxDB | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const { INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG } = env;

    if (!INFLUXDB_URL || !INFLUXDB_TOKEN || !INFLUXDB_ORG) {
      logger.warn('InfluxDB query not configured - metrics queries disabled', {
        configured: {
          url: !!INFLUXDB_URL,
          token: !!INFLUXDB_TOKEN,
          org: !!INFLUXDB_ORG,
        },
      });
      return;
    }

    try {
      this.client = new InfluxDB({
        url: INFLUXDB_URL,
        token: INFLUXDB_TOKEN,
      });

      this.enabled = true;

      logger.info('InfluxDB query client initialized', {
        url: INFLUXDB_URL,
        org: INFLUXDB_ORG,
      });
    } catch (error) {
      logger.error('Failed to initialize InfluxDB query client', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if InfluxDB queries are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Query deployment frequency for the last N days
   */
  async getDeploymentFrequency(days: number = 30): Promise<Array<{ time: string; value: number }>> {
    if (!this.enabled || !this.client || !env.INFLUXDB_ORG || !env.INFLUXDB_BUCKET) {
      logger.debug('InfluxDB query skipped - not enabled');
      return [];
    }

    const query = `
      from(bucket: "${env.INFLUXDB_BUCKET}")
        |> range(start: -${days}d)
        |> filter(fn: (r) => r._measurement == "deployments")
        |> filter(fn: (r) => r.status == "success")
        |> aggregateWindow(every: 1d, fn: count, createEmpty: true)
        |> fill(value: 0)
    `;

    try {
      const queryApi = this.client.getQueryApi(env.INFLUXDB_ORG);
      const result: Array<{ time: string; value: number }> = [];

      return new Promise((resolve, reject) => {
        queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push({
              time: record._time,
              value: record._value || 0,
            });
          },
          error: (error) => {
            logger.error('Error querying deployment frequency', { error: error.message });
            reject(error);
          },
          complete: () => {
            logger.debug('Deployment frequency query completed', { records: result.length });
            resolve(result);
          },
        });
      });
    } catch (error) {
      logger.error('Failed to query deployment frequency', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Query lead time for changes for the last N days
   */
  async getLeadTime(days: number = 30): Promise<Array<{ time: string; value: number }>> {
    if (!this.enabled || !this.client || !env.INFLUXDB_ORG || !env.INFLUXDB_BUCKET) {
      logger.debug('InfluxDB query skipped - not enabled');
      return [];
    }

    const query = `
      from(bucket: "${env.INFLUXDB_BUCKET}")
        |> range(start: -${days}d)
        |> filter(fn: (r) => r._measurement == "deployments")
        |> filter(fn: (r) => r._field == "lead_time_minutes")
        |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
    `;

    try {
      const queryApi = this.client.getQueryApi(env.INFLUXDB_ORG);
      const result: Array<{ time: string; value: number }> = [];

      return new Promise((resolve, reject) => {
        queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push({
              time: record._time,
              value: record._value || 0,
            });
          },
          error: (error) => {
            logger.error('Error querying lead time', { error: error.message });
            reject(error);
          },
          complete: () => {
            logger.debug('Lead time query completed', { records: result.length });
            resolve(result);
          },
        });
      });
    } catch (error) {
      logger.error('Failed to query lead time', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get summary statistics for dashboard
   */
  async getDashboardStats(days: number = 30): Promise<{
    deploymentFrequency: {
      current: number;
      trend: Array<{ time: string; value: number }>;
    };
    leadTime: {
      current: number; // in hours
      trend: Array<{ time: string; value: number }>;
    };
  }> {
    const [deploymentTrend, leadTimeTrend] = await Promise.all([
      this.getDeploymentFrequency(days),
      this.getLeadTime(days),
    ]);

    // Calculate current values (average of last 7 days)
    const recentDeployments = deploymentTrend.slice(-7);
    const recentLeadTimes = leadTimeTrend.slice(-7);

    const currentDeploymentFrequency =
      recentDeployments.length > 0
        ? recentDeployments.reduce((sum, d) => sum + d.value, 0) / recentDeployments.length
        : 0;

    const currentLeadTime =
      recentLeadTimes.length > 0
        ? recentLeadTimes.reduce((sum, d) => sum + d.value, 0) / recentLeadTimes.length / 60 // Convert to hours
        : 0;

    return {
      deploymentFrequency: {
        current: Math.round(currentDeploymentFrequency * 10) / 10, // Round to 1 decimal
        trend: deploymentTrend,
      },
      leadTime: {
        current: Math.round(currentLeadTime * 10) / 10, // Round to 1 decimal (hours)
        trend: leadTimeTrend.map((d) => ({
          time: d.time,
          value: Math.round((d.value / 60) * 10) / 10, // Convert minutes to hours
        })),
      },
    };
  }
}

// Singleton instance
export const influxQueryService = new InfluxQueryService();
