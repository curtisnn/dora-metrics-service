import express from 'express';
import 'express-async-errors';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { requestIdMiddleware } from './middleware/requestId';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/healthRoutes';
import webhookRoutes from './routes/webhookRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import metricsRoutes from './routes/metricsRoutes';
import opsRoutes from './routes/opsRoutes';

export const createApp = () => {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );
  app.use(cors());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request ID middleware (must be before routes)
  app.use(requestIdMiddleware);

  // Metrics middleware (must be before routes)
  app.use(metricsMiddleware);

  // Static files for dashboard
  app.use('/dashboard', express.static(path.join(__dirname, '../public')));

  // Routes
  app.use('/', healthRoutes);
  app.use('/', webhookRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/', metricsRoutes);
  app.use('/', opsRoutes);

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
