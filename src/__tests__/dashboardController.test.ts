import request from 'supertest';
import { createApp } from '../app';

describe('Dashboard API', () => {
  const app = createApp();

  describe('GET /api/dashboard', () => {
    it('should return 200 OK with dashboard data structure', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data).toHaveProperty('deploymentFrequency');
      expect(response.body.data).toHaveProperty('leadTime');
      expect(response.body.meta).toHaveProperty('days');
      expect(response.body.meta).toHaveProperty('generatedAt');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should have deployment frequency with current and trend', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      expect(response.body.data.deploymentFrequency).toHaveProperty('current');
      expect(response.body.data.deploymentFrequency).toHaveProperty('trend');
      expect(typeof response.body.data.deploymentFrequency.current).toBe('number');
      expect(Array.isArray(response.body.data.deploymentFrequency.trend)).toBe(true);
    });

    it('should have lead time with current and trend', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      expect(response.body.data.leadTime).toHaveProperty('current');
      expect(response.body.data.leadTime).toHaveProperty('trend');
      expect(typeof response.body.data.leadTime.current).toBe('number');
      expect(Array.isArray(response.body.data.leadTime.trend)).toBe(true);
    });

    it('should default to 30 days when days parameter not provided', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      expect(response.body.meta.days).toBe(30);
    });

    it('should accept custom days parameter', async () => {
      const response = await request(app).get('/api/dashboard?days=7').expect(200);

      expect(response.body.meta.days).toBe(7);
    });

    it('should reject invalid days parameter (too small)', async () => {
      const response = await request(app).get('/api/dashboard?days=0').expect(400);

      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('between 1 and 365');
    });

    it('should reject invalid days parameter (too large)', async () => {
      const response = await request(app).get('/api/dashboard?days=400').expect(400);

      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('between 1 and 365');
    });

    it('should return Content-Type application/json', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should include request ID in response', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      expect(response.body.meta.requestId).toBeTruthy();
      expect(typeof response.body.meta.requestId).toBe('string');
    });

    it('should return ISO 8601 timestamp', async () => {
      const response = await request(app).get('/api/dashboard').expect(200);

      const timestamp = response.body.meta.generatedAt;
      expect(timestamp).toBeTruthy();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });
});
