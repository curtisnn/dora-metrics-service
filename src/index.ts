import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { metricProcessor } from './services/metricProcessor';

const startServer = () => {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info('Server started', {
      port: env.PORT,
      environment: env.NODE_ENV,
      version: '1.0.0',
    });

    // Start metric processor
    metricProcessor.start();
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);

    // Stop metric processor
    metricProcessor.stop();

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
};

if (require.main === module) {
  startServer();
}

export { startServer };
