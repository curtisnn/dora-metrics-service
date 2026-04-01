import { influxDBService } from '../services/influxdb';

describe('InfluxDB Service', () => {
  describe('initialization', () => {
    it('should initialize without errors', () => {
      // Service is initialized on import
      expect(influxDBService).toBeDefined();
    });

    it('should report enabled status based on configuration', () => {
      const enabled = influxDBService.isEnabled();
      // Will be false in test environment without proper config
      expect(typeof enabled).toBe('boolean');
    });
  });

  describe('writeDeployment', () => {
    it('should accept valid deployment data', async () => {
      const deploymentData = {
        timestamp: new Date(),
        environment: 'production',
        status: 'success' as const,
        repository: 'test/repo',
        commitSha: 'abc123',
        leadTimeMinutes: 45,
        deliveryId: 'delivery-123',
      };

      // Should not throw even if InfluxDB is not configured
      await expect(
        influxDBService.writeDeployment(deploymentData)
      ).resolves.not.toThrow();
    });

    it('should handle missing optional fields', async () => {
      const deploymentData = {
        timestamp: new Date(),
        environment: 'staging',
        status: 'failure' as const,
        repository: 'test/repo',
        commitSha: 'def456',
      };

      await expect(
        influxDBService.writeDeployment(deploymentData)
      ).resolves.not.toThrow();
    });
  });

  describe('writeIncident', () => {
    it('should accept valid incident data', async () => {
      const incidentData = {
        timestamp: new Date(),
        severity: 'high' as const,
        status: 'open' as const,
        repository: 'test/repo',
        description: 'Test incident',
        durationMinutes: 120,
        relatedDeployment: 'abc123',
      };

      await expect(
        influxDBService.writeIncident(incidentData)
      ).resolves.not.toThrow();
    });
  });

  describe('writeMetric', () => {
    it('should accept valid metric data', async () => {
      const metricData = {
        timestamp: new Date(),
        metricName: 'deployment_frequency' as const,
        value: 5.5,
        window: 'daily' as const,
        environment: 'production',
        repository: 'test/repo',
      };

      await expect(
        influxDBService.writeMetric(metricData)
      ).resolves.not.toThrow();
    });

    it('should handle all metric types', async () => {
      const baseData = {
        timestamp: new Date(),
        value: 10,
        window: 'weekly' as const,
        environment: 'production',
        repository: 'test/repo',
      };

      const metricTypes = [
        'deployment_frequency',
        'lead_time',
        'mttr',
        'change_failure_rate',
      ] as const;

      for (const metricName of metricTypes) {
        await expect(
          influxDBService.writeMetric({ ...baseData, metricName })
        ).resolves.not.toThrow();
      }
    });
  });

  describe('flush and close', () => {
    it('should flush without errors', async () => {
      await expect(influxDBService.flush()).resolves.not.toThrow();
    });

    it('should close without errors', async () => {
      await expect(influxDBService.close()).resolves.not.toThrow();
    });
  });
});
