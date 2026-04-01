import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('Health Endpoint', () => {
  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
    });

    it('should return version information', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('version');
      expect(typeof response.body.version).toBe('string');
    });

    it('should return timestamp', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('timestamp');
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('should return uptime in seconds', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return environment', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('environment');
      expect(typeof response.body.environment).toBe('string');
    });

    it('should have consistent structure', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String),
      });
    });

    it('should return Content-Type application/json', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should have increasing uptime on subsequent requests', async () => {
      const response1 = await request(app).get('/health').expect(200);
      const uptime1 = response1.body.uptime;

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response2 = await request(app).get('/health').expect(200);
      const uptime2 = response2.body.uptime;

      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });
});
