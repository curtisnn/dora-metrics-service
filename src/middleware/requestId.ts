import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestWithId } from '../types';

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = randomUUID();
  (req as RequestWithId).id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
