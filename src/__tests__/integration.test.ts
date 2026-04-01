import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app';
import { eventQueue } from '../services/eventQueue';
import { metricCalculationService } from '../services/metricCalculation';
import { influxDBService } from '../services/influxdb';

// Mock InfluxDB service
jest.mock('../services/influxdb', () => ({
  influxDBService: {
    writeDeployment: jest.fn().mockResolvedValue(undefined),
    writeMetric: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  webhookLogger: {
    info: jest.fn(),
  },
}));

describe('Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    eventQueue.clear();
    metricCalculationService.clearCaches();
    jest.clearAllMocks();
  });

  describe('End-to-End: Webhook → Queue → Calculation → InfluxDB', () => {
    it('should process push and deployment webhooks end-to-end', async () => {
      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-secret';

      // Step 1: Send push webhook with commit timestamp
      const pushPayload = {
        ref: 'refs/heads/main',
        before: '0000000000000000000000000000000000000000',
        after: 'abc123def456',
        commits: [
          {
            id: 'abc123def456',
            message: 'Add new feature',
            timestamp: '2026-03-31T12:00:00Z',
            author: {
              name: 'Test User',
              email: 'test@example.com',
            },
          },
        ],
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
        pusher: {
          name: 'Test User',
          email: 'test@example.com',
        },
      };

      const pushSignature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(pushPayload))
        .digest('hex');

      const pushResponse = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'delivery-push-123')
        .set('X-Hub-Signature-256', pushSignature)
        .set('Content-Type', 'application/json')
        .send(pushPayload);

      expect(pushResponse.status).toBe(202);
      expect(pushResponse.body).toMatchObject({
        message: 'Webhook received and queued',
        eventId: expect.any(String),
      });

      // Step 2: Send deployment_status webhook
      const deploymentPayload = {
        action: 'created',
        deployment_status: {
          id: 456,
          state: 'success',
          description: 'Deployment successful',
          created_at: '2026-03-31T12:30:00Z',
          updated_at: '2026-03-31T12:30:00Z',
        },
        deployment: {
          id: 789,
          sha: 'abc123def456',
          ref: 'refs/heads/main',
          environment: 'production',
        },
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
      };

      const deploymentSignature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(deploymentPayload))
        .digest('hex');

      const deploymentResponse = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment_status')
        .set('X-GitHub-Delivery', 'delivery-deploy-456')
        .set('X-Hub-Signature-256', deploymentSignature)
        .set('Content-Type', 'application/json')
        .send(deploymentPayload);

      expect(deploymentResponse.status).toBe(202);

      // Step 3: Verify events are queued
      const queueStats = eventQueue.getStats();
      expect(queueStats.pending).toBe(2);
      expect(queueStats.total).toBe(2);

      // Step 4: Process the queue (simulating background processor)
      await metricCalculationService.processQueue();

      // Step 5: Verify all events were processed
      const afterProcessingStats = eventQueue.getStats();
      expect(afterProcessingStats.processed).toBe(2);
      expect(afterProcessingStats.pending).toBe(0);

      // Step 6: Verify InfluxDB writes
      const mockWriteDeployment = influxDBService.writeDeployment as jest.Mock;
      const mockWriteMetric = influxDBService.writeMetric as jest.Mock;
      const mockFlush = influxDBService.flush as jest.Mock;

      // Should write deployment with lead time
      expect(mockWriteDeployment).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        environment: 'production',
        status: 'success',
        repository: 'testorg/test-repo',
        commitSha: 'abc123def456',
        leadTimeMinutes: 30,
        deliveryId: 'delivery-deploy-456',
      });

      // Should write deployment frequency metric
      expect(mockWriteMetric).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        metricName: 'deployment_frequency',
        value: 1,
        window: 'daily',
        environment: 'production',
        repository: 'testorg/test-repo',
      });

      // Should write lead time metric
      expect(mockWriteMetric).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        metricName: 'lead_time',
        value: 30,
        window: 'daily',
        environment: 'production',
        repository: 'testorg/test-repo',
      });

      // Should flush writes
      expect(mockFlush).toHaveBeenCalled();
    });

    it('should handle deployment without prior push event', async () => {
      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-secret';

      // Send deployment_status webhook without prior push
      const deploymentPayload = {
        deployment_status: {
          id: 999,
          state: 'success',
          created_at: '2026-03-31T12:30:00Z',
          updated_at: '2026-03-31T12:30:00Z',
        },
        deployment: {
          id: 888,
          sha: 'unknown-commit-sha',
          ref: 'refs/heads/main',
          environment: 'staging',
        },
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
      };

      const signature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(deploymentPayload))
        .digest('hex');

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment_status')
        .set('X-GitHub-Delivery', 'delivery-no-push')
        .set('X-Hub-Signature-256', signature)
        .send(deploymentPayload);

      expect(response.status).toBe(202);

      // Process queue
      await metricCalculationService.processQueue();

      // Verify deployment written without lead time
      const mockWriteDeployment = influxDBService.writeDeployment as jest.Mock;
      expect(mockWriteDeployment).toHaveBeenCalledWith({
        timestamp: new Date('2026-03-31T12:30:00Z'),
        environment: 'staging',
        status: 'success',
        repository: 'testorg/test-repo',
        commitSha: 'unknown-commit-sha',
        leadTimeMinutes: undefined,
        deliveryId: 'delivery-no-push',
      });

      // Should write deployment frequency but not lead time
      const mockWriteMetric = influxDBService.writeMetric as jest.Mock;
      expect(mockWriteMetric).toHaveBeenCalledWith(
        expect.objectContaining({ metricName: 'deployment_frequency' })
      );
      expect(mockWriteMetric).not.toHaveBeenCalledWith(
        expect.objectContaining({ metricName: 'lead_time' })
      );
    });

    it('should handle multiple deployments for different environments', async () => {
      const webhookSecret = process.env.WEBHOOK_SECRET || 'test-secret';

      // Send push event
      const pushPayload = {
        ref: 'refs/heads/main',
        before: '0000000000000000000000000000000000000000',
        after: 'multi-env-sha',
        commits: [
          {
            id: 'multi-env-sha',
            timestamp: '2026-03-31T10:00:00Z',
            message: 'Multi-env deployment',
            author: { name: 'Test', email: 'test@example.com' },
          },
        ],
        repository: {
          id: 1,
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
        pusher: {
          name: 'Test',
          email: 'test@example.com',
        },
      };

      const pushSig = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(pushPayload))
        .digest('hex');

      await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'delivery-multi-1')
        .set('X-Hub-Signature-256', pushSig)
        .send(pushPayload);

      // Send staging deployment
      const stagingPayload = {
        deployment_status: {
          id: 111,
          state: 'success',
          created_at: '2026-03-31T10:15:00Z',
          updated_at: '2026-03-31T10:15:00Z',
        },
        deployment: {
          id: 222,
          sha: 'multi-env-sha',
          ref: 'refs/heads/main',
          environment: 'staging',
        },
        repository: {
          id: 1,
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
      };

      const stagingSig = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(stagingPayload))
        .digest('hex');

      await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment_status')
        .set('X-GitHub-Delivery', 'delivery-staging')
        .set('X-Hub-Signature-256', stagingSig)
        .send(stagingPayload);

      // Send production deployment
      const prodPayload = {
        deployment_status: {
          id: 333,
          state: 'success',
          created_at: '2026-03-31T10:30:00Z',
          updated_at: '2026-03-31T10:30:00Z',
        },
        deployment: {
          id: 444,
          sha: 'multi-env-sha',
          ref: 'refs/heads/main',
          environment: 'production',
        },
        repository: {
          id: 1,
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
      };

      const prodSig = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(prodPayload))
        .digest('hex');

      await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment_status')
        .set('X-GitHub-Delivery', 'delivery-prod')
        .set('X-Hub-Signature-256', prodSig)
        .send(prodPayload);

      // Process all events
      await metricCalculationService.processQueue();

      // Verify both deployments written
      const mockWriteDeployment = influxDBService.writeDeployment as jest.Mock;
      expect(mockWriteDeployment).toHaveBeenCalledTimes(2);

      // Verify staging deployment (15 min lead time)
      expect(mockWriteDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'staging',
          commitSha: 'multi-env-sha',
          leadTimeMinutes: 15,
        })
      );

      // Verify production deployment (30 min lead time)
      expect(mockWriteDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
          commitSha: 'multi-env-sha',
          leadTimeMinutes: 30,
        })
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle malformed webhook payloads gracefully', async () => {
      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'bad-delivery')
        .send({ invalid: 'payload' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        message: 'Invalid webhook payload',
      });

      // Queue should be empty
      expect(eventQueue.getStats().total).toBe(0);
    });

    it('should process queue even with some invalid events', async () => {
      // Add one valid event
      eventQueue.enqueue('deployment_status', 'valid-123', {
        deployment_status: { state: 'success', created_at: '2026-03-31T12:00:00Z' },
        deployment: { sha: 'abc123', environment: 'production' },
        repository: { full_name: 'test/repo' },
      });

      // Add one invalid event
      eventQueue.enqueue('deployment_status', 'invalid-456', {
        invalid: 'payload',
      });

      // Process queue
      await metricCalculationService.processQueue();

      // Both should be marked processed (invalid one fails but doesn't block)
      const stats = eventQueue.getStats();
      expect(stats.processed).toBe(2);
      expect(stats.pending).toBe(0);

      // Valid event should have written to InfluxDB
      expect(influxDBService.writeDeployment).toHaveBeenCalled();
    });
  });

  describe('Health Check Integration', () => {
    it('should return healthy status with all components', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String),
      });
    });
  });
});
