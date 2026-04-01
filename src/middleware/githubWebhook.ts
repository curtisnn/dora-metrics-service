import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { RequestWithId } from '../types';

/**
 * Verify GitHub webhook signature using HMAC SHA-256
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export const verifyGitHubSignature = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = (req as RequestWithId).id;

  // Skip verification if no webhook secret is configured
  // Check process.env directly to allow runtime configuration (e.g., in tests)
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('GitHub webhook signature verification skipped - no secret configured', {
      requestId,
    });
    return next();
  }

  const signature = req.headers['x-hub-signature-256'] as string;

  if (!signature) {
    logger.warn('GitHub webhook missing signature header', {
      requestId,
      headers: Object.keys(req.headers),
    });
    return res.status(403).json({
      error: {
        message: 'Missing X-Hub-Signature-256 header',
        requestId,
      },
    });
  }

  // GitHub sends raw body for signature calculation
  // Express body parser already parsed it, so we need the raw buffer
  const payload = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  let isValid = false;
  try {
    // Buffers must be same length for timingSafeEqual
    if (signature.length === digest.length) {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
      );
    }
  } catch (error) {
    // Invalid signature format, treat as invalid
    isValid = false;
  }

  if (!isValid) {
    logger.warn('GitHub webhook signature verification failed', {
      requestId,
      expectedPrefix: digest.substring(0, 15) + '...',
      receivedPrefix: signature.substring(0, 15) + '...',
    });
    return res.status(403).json({
      error: {
        message: 'Invalid webhook signature',
        requestId,
      },
    });
  }

  logger.debug('GitHub webhook signature verified', { requestId });
  next();
};

/**
 * Extract GitHub webhook metadata from headers
 */
export const extractGitHubMetadata = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const eventType = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;
  const hookId = req.headers['x-github-hook-id'] as string;

  // Attach metadata to request for use in controllers
  (req as any).githubMetadata = {
    eventType,
    deliveryId,
    hookId,
  };

  next();
};
