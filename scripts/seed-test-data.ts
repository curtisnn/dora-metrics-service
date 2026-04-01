#!/usr/bin/env tsx
/**
 * Seed test data for DORA metrics dashboard testing
 */
import { influxDBService } from '../src/services/influxdb';

async function seedTestData() {
  console.log('🌱 Seeding test data for DORA metrics...');

  const now = new Date();
  const repositories = ['myorg/api', 'myorg/web', 'myorg/mobile'];
  const environments = ['production', 'staging'];

  // Generate 30 days of deployment data
  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);

    // Random 2-5 deployments per day
    const deploymentsCount = Math.floor(Math.random() * 4) + 2;

    for (let i = 0; i < deploymentsCount; i++) {
      const timestamp = new Date(date);
      timestamp.setHours(Math.floor(Math.random() * 24));
      timestamp.setMinutes(Math.floor(Math.random() * 60));

      const repository = repositories[Math.floor(Math.random() * repositories.length)];
      const environment = environments[Math.floor(Math.random() * environments.length)];
      const commitSha = Math.random().toString(36).substring(2, 15);

      // Lead time: 30-240 minutes (0.5-4 hours)
      const leadTimeMinutes = Math.floor(Math.random() * 210) + 30;

      // 95% success rate
      const status = Math.random() > 0.05 ? 'success' : 'failure';

      await influxDBService.writeDeployment({
        timestamp,
        environment,
        status: status as 'success' | 'failure',
        repository,
        commitSha,
        leadTimeMinutes: status === 'success' ? leadTimeMinutes : undefined,
        deliveryId: `seed-${timestamp.getTime()}-${i}`,
      });
    }
  }

  // Flush all writes
  await influxDBService.flush();

  console.log('✅ Test data seeded successfully!');
  console.log('📊 Generated ~90 deployment events across 30 days');
  console.log('🔗 View dashboard at: http://localhost:3000/dashboard/');

  process.exit(0);
}

seedTestData().catch((error) => {
  console.error('❌ Failed to seed test data:', error);
  process.exit(1);
});
