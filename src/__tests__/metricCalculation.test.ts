import { metricCalculationService } from '../services/metricCalculation';
import { eventQueue } from '../services/eventQueue';
import { influxDBService } from '../services/influxdb';

// Mock dependencies
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../services/influxdb', () => ({
  influxDBService: {
    writeDeployment: jest.fn().mockResolvedValue(undefined),
    writeMetric: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(true),
  },
}));

describe('MetricCalculationService', () => {
  beforeEach(() => {
    // Clear queue and caches before each test
    eventQueue.clear();
    metricCalculationService.clearCaches();
    jest.clearAllMocks();
  });

  describe('processQueue', () => {
    it('should process push events and store commit timestamps', async () => {
      // Arrange
      const pushPayload = {
        ref: 'refs/heads/main',
        commits: [
          {
            id: 'abc123',
            message: 'Test commit',
            timestamp: '2026-03-31T12:00:00Z',
            author: { name: 'Test User', email: 'test@example.com' },
          },
        ],
        repository: {
          id: 1,
          name: 'test-repo',
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('push', 'delivery-1', pushPayload);

      // Act
      await metricCalculationService.processQueue();

      // Assert
      const stats = metricCalculationService.getStats();
      expect(stats.commitTimestamps).toBe(1);
      expect(stats.processedDeliveryIds).toBe(1);
    });

    it('should process deployment_status events and write metrics', async () => {
      // Arrange
      const pushPayload = {
        commits: [
          {
            id: 'abc123',
            timestamp: '2026-03-31T12:00:00Z',
          },
        ],
        repository: { full_name: 'owner/test-repo' },
      };

      const deploymentStatusPayload = {
        deployment_status: {
          id: 1,
          state: 'success',
          created_at: '2026-03-31T12:30:00Z',
        },
        deployment: {
          id: 1,
          sha: 'abc123',
          environment: 'production',
        },
        repository: {
          id: 1,
          name: 'test-repo',
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('push', 'delivery-1', pushPayload);
      eventQueue.enqueue('deployment_status', 'delivery-2', deploymentStatusPayload);

      // Mock InfluxDB service
      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');
      const mockWriteMetric = jest.spyOn(influxDBService, 'writeMetric');
      const mockFlush = jest.spyOn(influxDBService, 'flush');

      // Act
      await metricCalculationService.processQueue();

      // Assert
      expect(mockWriteDeployment).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        environment: 'production',
        status: 'success',
        repository: 'owner/test-repo',
        commitSha: 'abc123',
        leadTimeMinutes: 30,
        deliveryId: 'delivery-2',
      });

      expect(mockWriteMetric).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        metricName: 'deployment_frequency',
        value: 1,
        window: 'daily',
        environment: 'production',
        repository: 'owner/test-repo',
      });

      expect(mockWriteMetric).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        metricName: 'lead_time',
        value: 30,
        window: 'daily',
        environment: 'production',
        repository: 'owner/test-repo',
      });

      expect(mockFlush).toHaveBeenCalled();
    });

    it('should handle deployment without commit timestamp', async () => {
      // Arrange
      const deploymentStatusPayload = {
        deployment_status: {
          state: 'success',
          created_at: '2026-03-31T12:30:00Z',
        },
        deployment: {
          sha: 'xyz789',
          environment: 'staging',
        },
        repository: {
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('deployment_status', 'delivery-1', deploymentStatusPayload);

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');
      const mockWriteMetric = jest.spyOn(influxDBService, 'writeMetric');

      // Act
      await metricCalculationService.processQueue();

      // Assert
      expect(mockWriteDeployment).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        environment: 'staging',
        status: 'success',
        repository: 'owner/test-repo',
        commitSha: 'xyz789',
        leadTimeMinutes: undefined,
        deliveryId: 'delivery-1',
      });

      // Should write deployment frequency but not lead time
      expect(mockWriteMetric).toHaveBeenCalledWith(
        expect.objectContaining({ metricName: 'deployment_frequency' })
      );

      expect(mockWriteMetric).not.toHaveBeenCalledWith(
        expect.objectContaining({ metricName: 'lead_time' })
      );
    });

    it('should skip duplicate events', async () => {
      // Arrange
      const payload = {
        deployment_status: {
          state: 'success',
          created_at: '2026-03-31T12:30:00Z',
        },
        deployment: {
          sha: 'abc123',
          environment: 'production',
        },
        repository: {
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('deployment_status', 'delivery-1', payload);
      eventQueue.enqueue('deployment_status', 'delivery-1', payload);

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');

      // Act
      await metricCalculationService.processQueue();

      // Assert - should only write once
      expect(mockWriteDeployment).toHaveBeenCalledTimes(1);
    });

    it('should skip non-success deployment states', async () => {
      // Arrange
      const payload = {
        deployment_status: {
          state: 'failure',
          created_at: '2026-03-31T12:30:00Z',
        },
        deployment: {
          sha: 'abc123',
          environment: 'production',
        },
        repository: {
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('deployment_status', 'delivery-1', payload);

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');

      // Act
      await metricCalculationService.processQueue();

      // Assert
      expect(mockWriteDeployment).not.toHaveBeenCalled();
    });

    it('should reject invalid timestamps', async () => {
      // Arrange - timestamp in the far future
      const payload = {
        deployment_status: {
          state: 'success',
          created_at: '2099-01-01T12:30:00Z',
        },
        deployment: {
          sha: 'abc123',
          environment: 'production',
        },
        repository: {
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('deployment_status', 'delivery-1', payload);

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');

      // Act
      await metricCalculationService.processQueue();

      // Assert
      expect(mockWriteDeployment).not.toHaveBeenCalled();
    });

    it('should reject negative lead time', async () => {
      // Arrange - deployment before commit (invalid)
      const pushPayload = {
        commits: [
          {
            id: 'abc123',
            timestamp: '2026-03-31T12:30:00Z', // commit after deployment
          },
        ],
        repository: { full_name: 'owner/test-repo' },
      };

      const deploymentStatusPayload = {
        deployment_status: {
          state: 'success',
          created_at: '2026-03-31T12:00:00Z', // deployment before commit
        },
        deployment: {
          sha: 'abc123',
          environment: 'production',
        },
        repository: {
          full_name: 'owner/test-repo',
        },
      };

      eventQueue.enqueue('push', 'delivery-1', pushPayload);
      eventQueue.enqueue('deployment_status', 'delivery-2', deploymentStatusPayload);

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');

      // Act
      await metricCalculationService.processQueue();

      // Assert - should write deployment but without lead time
      expect(mockWriteDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          leadTimeMinutes: undefined,
        })
      );
    });

    it('should handle invalid push payload gracefully', async () => {
      // Arrange - missing required fields
      const invalidPayload = {
        ref: 'refs/heads/main',
        // missing commits array
      };

      eventQueue.enqueue('push', 'delivery-1', invalidPayload);

      // Act & Assert - should not throw
      await expect(metricCalculationService.processQueue()).resolves.not.toThrow();
    });

    it('should handle invalid deployment_status payload gracefully', async () => {
      // Arrange - missing required fields
      const invalidPayload = {
        deployment_status: {
          state: 'success',
          // missing created_at
        },
        // missing deployment
      };

      eventQueue.enqueue('deployment_status', 'delivery-1', invalidPayload);

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');

      // Act
      await metricCalculationService.processQueue();

      // Assert
      expect(mockWriteDeployment).not.toHaveBeenCalled();
    });

    it('should process multiple events in sequence', async () => {
      // Arrange
      const events = [
        { type: 'push', deliveryId: 'delivery-1', payload: createPushPayload('abc123') },
        { type: 'push', deliveryId: 'delivery-2', payload: createPushPayload('def456') },
        {
          type: 'deployment_status',
          deliveryId: 'delivery-3',
          payload: createDeploymentStatusPayload('abc123', 'production'),
        },
        {
          type: 'deployment_status',
          deliveryId: 'delivery-4',
          payload: createDeploymentStatusPayload('def456', 'staging'),
        },
      ];

      events.forEach((e) => eventQueue.enqueue(e.type, e.deliveryId, e.payload));

      const mockWriteDeployment = jest.spyOn(influxDBService, 'writeDeployment');

      // Act
      await metricCalculationService.processQueue();

      // Assert
      expect(mockWriteDeployment).toHaveBeenCalledTimes(2);
      expect(mockWriteDeployment).toHaveBeenCalledWith(
        expect.objectContaining({ commitSha: 'abc123', environment: 'production' })
      );
      expect(mockWriteDeployment).toHaveBeenCalledWith(
        expect.objectContaining({ commitSha: 'def456', environment: 'staging' })
      );
    });
  });

  describe('cache management', () => {
    it('should maintain cache size limits for delivery IDs', async () => {
      // Arrange - add many events to exceed cache limit
      const maxProcessedIds = 10000;
      const testCount = maxProcessedIds + 100;

      for (let i = 0; i < testCount; i++) {
        const payload = createDeploymentStatusPayload(`sha-${i}`, 'production');
        eventQueue.enqueue('deployment_status', `delivery-${i}`, payload);
      }

      // Act
      await metricCalculationService.processQueue();

      // Assert
      const stats = metricCalculationService.getStats();
      expect(stats.processedDeliveryIds).toBeLessThanOrEqual(maxProcessedIds);
    });

    it('should maintain cache size limits for commit timestamps', async () => {
      // Arrange
      const maxCommitCache = 5000;
      const testCount = maxCommitCache + 100;

      for (let i = 0; i < testCount; i++) {
        const payload = createPushPayload(`sha-${i}`);
        eventQueue.enqueue('push', `delivery-${i}`, payload);
      }

      // Act
      await metricCalculationService.processQueue();

      // Assert
      const stats = metricCalculationService.getStats();
      expect(stats.commitTimestamps).toBeLessThanOrEqual(maxCommitCache);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = metricCalculationService.getStats();

      expect(stats).toEqual({
        processedDeliveryIds: expect.any(Number),
        commitTimestamps: expect.any(Number),
        maxProcessedIds: 10000,
        maxCommitCache: 5000,
      });
    });
  });

  describe('clearCaches', () => {
    it('should clear all caches', async () => {
      // Arrange
      eventQueue.enqueue('push', 'delivery-1', createPushPayload('abc123'));
      await metricCalculationService.processQueue();

      // Act
      metricCalculationService.clearCaches();

      // Assert
      const stats = metricCalculationService.getStats();
      expect(stats.processedDeliveryIds).toBe(0);
      expect(stats.commitTimestamps).toBe(0);
    });
  });
});

// Helper functions
function createPushPayload(commitSha: string) {
  return {
    ref: 'refs/heads/main',
    commits: [
      {
        id: commitSha,
        message: 'Test commit',
        timestamp: '2026-03-31T12:00:00Z',
        author: { name: 'Test User', email: 'test@example.com' },
      },
    ],
    repository: {
      id: 1,
      name: 'test-repo',
      full_name: 'owner/test-repo',
    },
  };
}

function createDeploymentStatusPayload(commitSha: string, environment: string) {
  return {
    deployment_status: {
      id: 1,
      state: 'success',
      created_at: '2026-03-31T12:30:00Z',
    },
    deployment: {
      id: 1,
      sha: commitSha,
      environment,
    },
    repository: {
      id: 1,
      name: 'test-repo',
      full_name: 'owner/test-repo',
    },
  };
}
