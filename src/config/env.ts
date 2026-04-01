import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  WEBHOOK_SECRET: z.string().optional(),
  API_KEY: z.string().optional(),
  INFLUXDB_URL: z.string().optional(),
  INFLUXDB_TOKEN: z.string().optional(),
  INFLUXDB_ORG: z.string().optional(),
  INFLUXDB_BUCKET: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();
