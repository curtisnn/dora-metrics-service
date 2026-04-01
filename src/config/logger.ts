import winston from 'winston';
import path from 'path';
import { env } from './env';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const reqId = requestId ? `[${requestId}]` : '';
    return `${timestamp} ${level} ${reqId}: ${message} ${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: 'dora-ingestion' },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'development' ? consoleFormat : logFormat,
    }),
  ],
});

export const childLogger = (requestId: string) => {
  return logger.child({ requestId });
};

// Webhook logger - logs all webhook events to file for debugging
export const webhookLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'dora-ingestion', component: 'webhook' },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'webhooks.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'webhooks-error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});
