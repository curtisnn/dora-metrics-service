import { Request, Response, NextFunction } from 'express';
import {
  httpRequestDuration,
  httpRequestCounter,
  httpErrorCounter,
} from '../services/metrics';

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  // Capture response finish event
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode.toString();

    // Record request duration
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );

    // Record request count
    httpRequestCounter.inc({ method, route, status_code: statusCode });

    // Record errors (4xx and 5xx)
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      httpErrorCounter.inc({ method, route, error_type: errorType });
    }
  });

  next();
};
