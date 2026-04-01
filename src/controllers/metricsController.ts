import { Request, Response } from 'express';
import { register } from '../services/metrics';

export const getMetrics = async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', register.contentType);
  const metrics = await register.metrics();
  res.send(metrics);
};
