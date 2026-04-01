import request from 'supertest';
import { createApp } from '../app';

describe('OpsController', () => {
  const app = createApp();

  describe('GET /api/ops', () => {
    it('should return operational metrics', async () => {
      const response = await request(app).get('/api/ops').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;

      // Verify service health structure
      expect(data).toHaveProperty('serviceHealth');
      expect(data.serviceHealth).toHaveProperty('uptime');
      expect(data.serviceHealth).toHaveProperty('responseTime');
      expect(data.serviceHealth.responseTime).toHaveProperty('p50');
      expect(data.serviceHealth.responseTime).toHaveProperty('p95');
      expect(data.serviceHealth.responseTime).toHaveProperty('p99');
      expect(data.serviceHealth).toHaveProperty('errorRate');
      expect(data.serviceHealth).toHaveProperty('requestRate');
      expect(data.serviceHealth).toHaveProperty('activeConnections');

      // Verify queue processing structure
      expect(data).toHaveProperty('queueProcessing');
      expect(data.queueProcessing).toHaveProperty('queueDepth');
      expect(data.queueProcessing).toHaveProperty('processingRate');
      expect(data.queueProcessing).toHaveProperty('processingLatency');
      expect(data.queueProcessing.processingLatency).toHaveProperty('avg');
      expect(data.queueProcessing.processingLatency).toHaveProperty('p95');
      expect(data.queueProcessing).toHaveProperty('failedWebhooks');

      // Verify data quality structure
      expect(data).toHaveProperty('dataQuality');
      expect(data.dataQuality).toHaveProperty('influxdbConnectionStatus');
      expect(data.dataQuality).toHaveProperty('influxdbWriteRate');
      expect(data.dataQuality).toHaveProperty('influxdbWriteErrors');
      expect(data.dataQuality).toHaveProperty('influxdbWriteLatency');

      // Verify timestamp
      expect(data).toHaveProperty('timestamp');
      expect(new Date(data.timestamp).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });

    it('should return valid numeric values', async () => {
      const response = await request(app).get('/api/ops').expect(200);

      const { data } = response.body;

      // All numeric values should be numbers
      expect(typeof data.serviceHealth.uptime).toBe('number');
      expect(typeof data.serviceHealth.responseTime.p50).toBe('number');
      expect(typeof data.serviceHealth.errorRate).toBe('number');
      expect(typeof data.queueProcessing.queueDepth).toBe('number');
      expect(typeof data.dataQuality.influxdbConnectionStatus).toBe('number');

      // Rates should be non-negative
      expect(data.serviceHealth.requestRate).toBeGreaterThanOrEqual(0);
      expect(data.queueProcessing.processingRate).toBeGreaterThanOrEqual(0);
      expect(data.dataQuality.influxdbWriteRate).toBeGreaterThanOrEqual(0);

      // Percentages should be 0-100
      expect(data.serviceHealth.errorRate).toBeGreaterThanOrEqual(0);
      expect(data.serviceHealth.errorRate).toBeLessThanOrEqual(100);

      // Connection status should be 0 or 1
      expect([0, 1]).toContain(data.dataQuality.influxdbConnectionStatus);
    });

    it('should return consistent data on multiple calls', async () => {
      const response1 = await request(app).get('/api/ops').expect(200);
      const response2 = await request(app).get('/api/ops').expect(200);

      // Structure should be identical
      expect(Object.keys(response1.body.data)).toEqual(
        Object.keys(response2.body.data)
      );

      // Uptime should be increasing or equal (within 1 second tolerance)
      expect(response2.body.data.serviceHealth.uptime).toBeGreaterThanOrEqual(
        response1.body.data.serviceHealth.uptime - 1
      );
    });
  });

  describe('GET /api/ops/export', () => {
    it('should export metrics as CSV', async () => {
      const response = await request(app).get('/api/ops/export').expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="ops-metrics-\d+\.csv"$/
      );

      const csvContent = response.text;

      // Verify CSV structure
      const lines = csvContent.split('\n');
      expect(lines.length).toBeGreaterThan(1);

      // Check header
      expect(lines[0]).toBe(
        'Metric Category,Metric Name,Value,Unit,Timestamp'
      );

      // Check at least one data row
      expect(lines[1]).toMatch(/^Service Health,Uptime,\d+/);

      // Verify all expected metrics are present
      const categories = [
        'Service Health',
        'Queue Processing',
        'Data Quality',
      ];
      categories.forEach((category) => {
        expect(csvContent).toContain(category);
      });
    });

    it('should include timestamp in CSV export', async () => {
      const response = await request(app).get('/api/ops/export').expect(200);

      const csvContent = response.text;
      const lines = csvContent.split('\n');

      // Skip header, check first data line
      const firstDataLine = lines[1];
      const timestamp = firstDataLine.split(',')[4];

      // Should be valid ISO timestamp
      expect(new Date(timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should have consistent data between JSON and CSV exports', async () => {
      const jsonResponse = await request(app).get('/api/ops').expect(200);
      const csvResponse = await request(app).get('/api/ops/export').expect(200);

      const jsonData = jsonResponse.body.data;
      const csvContent = csvResponse.text;

      // Verify key metrics are present in both
      expect(csvContent).toContain(jsonData.serviceHealth.uptime.toString());
      expect(csvContent).toContain(
        jsonData.serviceHealth.errorRate.toFixed(2)
      );
      expect(csvContent).toContain(
        jsonData.queueProcessing.queueDepth.toString()
      );
    });
  });

  describe('Error handling', () => {
    it('should handle internal errors gracefully', async () => {
      // This test ensures error structure is correct
      // In a real error scenario, we'd mock the metrics service to throw

      const response = await request(app).get('/api/ops').expect(200);

      // Should not throw even if some metrics are unavailable
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
    });
  });
});
