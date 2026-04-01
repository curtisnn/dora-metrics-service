import { Request, Response } from 'express';
import { env } from '../config/env';
import { HealthStatus } from '../types';

const startTime = Date.now();
const version = '1.0.0';

export const healthCheck = (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  const health: HealthStatus = {
    status: 'healthy',
    version,
    timestamp: new Date().toISOString(),
    uptime,
    environment: env.NODE_ENV,
  };

  res.status(200).json(health);
};
