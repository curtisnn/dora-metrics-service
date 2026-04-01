import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app';
import { eventQueue } from '../services/eventQueue';

const app = createApp();

describe('GitHub Webhook Endpoint', () => {
  beforeEach(() => {
    // Clear event queue before each test
    eventQueue.clear();
    // Set webhook secret for tests
    process.env.WEBHOOK_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  const createSignature = (payload: any, secret: string): string => {
    const payloadString = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payloadString).digest('hex');
  };

  const deploymentPayload = {
    action: 'created',
    deployment: {
      id: 12345,
      sha: 'abc123def456',
      ref: 'refs/heads/main',
      environment: 'production',
      created_at: '2026-03-31T10:00:00Z',
      updated_at: '2026-03-31T10:00:00Z',
      creator: {
        login: 'testuser',
      },
    },
    repository: {
      id: 1,
      name: 'test-repo',
      full_name: 'testorg/test-repo',
    },
  };

  const deploymentStatusPayload = {
    action: 'created',
    deployment_status: {
      id: 67890,
      state: 'success',
      description: 'Deployment succeeded',
      created_at: '2026-03-31T10:05:00Z',
      updated_at: '2026-03-31T10:05:00Z',
    },
    deployment: {
      id: 12345,
      sha: 'abc123def456',
      ref: 'refs/heads/main',
      environment: 'production',
    },
    repository: {
      id: 1,
      name: 'test-repo',
      full_name: 'testorg/test-repo',
    },
  };

  const pushPayload = {
    ref: 'refs/heads/main',
    before: 'old123',
    after: 'new456',
    commits: [
      {
        id: 'commit1',
        message: 'Fix bug',
        timestamp: '2026-03-31T09:00:00Z',
        author: {
          name: 'Test User',
          email: 'test@example.com',
        },
      },
    ],
    repository: {
      id: 1,
      name: 'test-repo',
      full_name: 'testorg/test-repo',
    },
    pusher: {
      name: 'testuser',
      email: 'test@example.com',
    },
  };

  describe('POST /webhooks/github', () => {
    it('should accept valid deployment webhook with signature', async () => {
      const signature = createSignature(deploymentPayload, 'test-secret-key');

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'test-delivery-123')
        .set('X-GitHub-Hook-Id', 'hook-456')
        .set('X-Hub-Signature-256', signature)
        .send(deploymentPayload)
        .expect(202);

      expect(response.body).toHaveProperty('message', 'Webhook received and queued');
      expect(response.body).toHaveProperty('eventId');

      // Verify event was enqueued
      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('should accept valid deployment_status webhook', async () => {
      const signature = createSignature(
        deploymentStatusPayload,
        'test-secret-key'
      );

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment_status')
        .set('X-GitHub-Delivery', 'test-delivery-456')
        .set('X-Hub-Signature-256', signature)
        .send(deploymentStatusPayload)
        .expect(202);

      expect(response.body).toHaveProperty('eventId');

      // Verify event was enqueued
      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
    });

    it('should accept valid push webhook', async () => {
      const signature = createSignature(pushPayload, 'test-secret-key');

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'test-delivery-789')
        .set('X-Hub-Signature-256', signature)
        .send(pushPayload)
        .expect(202);

      expect(response.body).toHaveProperty('eventId');

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
    });

    it('should reject webhook with invalid signature', async () => {
      const invalidSignature = 'sha256=invalidsignature123';

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'test-delivery-123')
        .set('X-Hub-Signature-256', invalidSignature)
        .send(deploymentPayload)
        .expect(403);

      expect(response.body.error).toHaveProperty(
        'message',
        'Invalid webhook signature'
      );

      // Verify event was not enqueued
      const stats = eventQueue.getStats();
      expect(stats.total).toBe(0);
    });

    it('should reject webhook with missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'test-delivery-123')
        .send(deploymentPayload)
        .expect(403);

      expect(response.body.error).toHaveProperty(
        'message',
        'Missing X-Hub-Signature-256 header'
      );

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(0);
    });

    it('should reject unsupported event type', async () => {
      const unsupportedPayload = { action: 'opened', issue: { id: 1 } };
      const signature = createSignature(unsupportedPayload, 'test-secret-key');

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'issues')
        .set('X-GitHub-Delivery', 'test-delivery-999')
        .set('X-Hub-Signature-256', signature)
        .send(unsupportedPayload)
        .expect(400);

      expect(response.body.error.message).toContain('Unsupported event type');

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(0);
    });

    it('should reject malformed deployment payload', async () => {
      const malformedPayload = {
        deployment: {
          // Missing required fields
          id: 12345,
        },
      };
      const signature = createSignature(malformedPayload, 'test-secret-key');

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'test-delivery-invalid')
        .set('X-Hub-Signature-256', signature)
        .send(malformedPayload)
        .expect(400);

      expect(response.body.error).toHaveProperty(
        'message',
        'Invalid webhook payload'
      );
      expect(response.body.error).toHaveProperty('details');

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(0);
    });

    it('should skip signature verification when no secret configured', async () => {
      delete process.env.WEBHOOK_SECRET;

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'test-delivery-no-secret')
        .send(deploymentPayload)
        .expect(202);

      expect(response.body).toHaveProperty('eventId');

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
    });

    it('should include request ID in all responses', async () => {
      const signature = createSignature(deploymentPayload, 'test-secret-key');

      const response = await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'test-delivery-reqid')
        .set('X-Hub-Signature-256', signature)
        .send(deploymentPayload)
        .expect(202);

      expect(response.body).toHaveProperty('requestId');
      expect(typeof response.body.requestId).toBe('string');
    });
  });

  describe('Event Queue Integration', () => {
    it('should queue multiple webhook events', async () => {
      const signature1 = createSignature(deploymentPayload, 'test-secret-key');
      const signature2 = createSignature(pushPayload, 'test-secret-key');

      await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'deployment')
        .set('X-GitHub-Delivery', 'delivery-1')
        .set('X-Hub-Signature-256', signature1)
        .send(deploymentPayload)
        .expect(202);

      await request(app)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'delivery-2')
        .set('X-Hub-Signature-256', signature2)
        .send(pushPayload)
        .expect(202);

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
    });
  });
});
