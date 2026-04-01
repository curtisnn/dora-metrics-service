import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger, webhookLogger } from '../config/logger';
import { RequestWithId, RequestWithGitHub } from '../types';
import { eventQueue } from '../services/eventQueue';

// GitHub deployment event schema
const deploymentSchema = z.object({
  action: z.literal('created').optional(),
  deployment: z.object({
    id: z.number(),
    sha: z.string(),
    ref: z.string(),
    environment: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    creator: z.object({
      login: z.string(),
    }),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
  }),
});

// GitHub deployment_status event schema
const deploymentStatusSchema = z.object({
  action: z.literal('created').optional(),
  deployment_status: z.object({
    id: z.number(),
    state: z.enum([
      'pending',
      'success',
      'failure',
      'error',
      'inactive',
      'in_progress',
      'queued',
    ]),
    description: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  deployment: z.object({
    id: z.number(),
    sha: z.string(),
    ref: z.string(),
    environment: z.string(),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
  }),
});

// GitHub push event schema
const pushSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  commits: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      timestamp: z.string(),
      author: z.object({
        name: z.string(),
        email: z.string(),
      }),
    })
  ),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
  }),
  pusher: z.object({
    name: z.string(),
    email: z.string().optional(),
  }),
});

const deploymentEventSchema = z.object({
  timestamp: z.string(),
  environment: z.enum(['production', 'staging', 'development']),
  commitSha: z.string(),
  status: z.enum(['success', 'failure', 'rollback']),
  duration: z.number().optional(),
  repository: z.string(),
});

const incidentEventSchema = z.object({
  timestamp: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['open', 'resolved']),
  relatedDeployment: z.string().optional(),
  description: z.string(),
  resolvedAt: z.string().optional(),
});

export const handleGitHubWebhook = async (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = (req as RequestWithId).id;
  const { eventType, deliveryId, hookId } = (req as RequestWithGitHub)
    .githubMetadata;

  try {
    // Validate payload based on event type
    let validatedPayload: any;
    let eventDescription: string;

    switch (eventType) {
      case 'deployment':
        validatedPayload = deploymentSchema.parse(req.body);
        eventDescription = `Deployment created for ${validatedPayload.repository.full_name} (${validatedPayload.deployment.environment})`;
        break;

      case 'deployment_status':
        validatedPayload = deploymentStatusSchema.parse(req.body);
        eventDescription = `Deployment status ${validatedPayload.deployment_status.state} for ${validatedPayload.repository.full_name}`;
        break;

      case 'push':
        validatedPayload = pushSchema.parse(req.body);
        eventDescription = `Push to ${validatedPayload.ref} in ${validatedPayload.repository.full_name} (${validatedPayload.commits.length} commits)`;
        break;

      default:
        logger.warn('Unsupported GitHub webhook event type', {
          requestId,
          eventType,
          deliveryId,
        });
        return res.status(400).json({
          error: {
            message: `Unsupported event type: ${eventType}. Supported types: deployment, deployment_status, push`,
            requestId,
          },
        });
    }

    // Enqueue event for processing
    const event = eventQueue.enqueue(eventType, deliveryId, validatedPayload);

    logger.info('GitHub webhook processed and enqueued', {
      requestId,
      eventType,
      deliveryId,
      hookId,
      eventId: event.id,
      description: eventDescription,
      repository: validatedPayload.repository?.full_name,
    });

    // Log full webhook event to file for debugging
    webhookLogger.info('GitHub webhook received', {
      requestId,
      eventType,
      deliveryId,
      hookId,
      eventId: event.id,
      receivedAt: event.receivedAt,
      payload: validatedPayload,
    });

    return res.status(202).json({
      message: 'Webhook received and queued',
      requestId,
      eventId: event.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('GitHub webhook validation failed', {
        requestId,
        eventType,
        deliveryId,
        errors: error.errors,
      });
      return res.status(400).json({
        error: {
          message: 'Invalid webhook payload',
          requestId,
          details: error.errors,
        },
      });
    }

    logger.error('GitHub webhook processing error', {
      requestId,
      eventType,
      deliveryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

export const handleDeploymentEvent = async (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = (req as RequestWithId).id;

  try {
    const event = deploymentEventSchema.parse(req.body);

    logger.info('Deployment event received', {
      requestId,
      environment: event.environment,
      status: event.status,
      commitSha: event.commitSha,
      repository: event.repository,
    });

    // TODO: Store event and calculate metrics
    // For now, just acknowledge receipt

    res.status(202).json({
      message: 'Deployment event received',
      requestId,
    });
  } catch (error) {
    logger.error('Deployment event validation failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

export const handleIncidentEvent = async (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = (req as RequestWithId).id;

  try {
    const event = incidentEventSchema.parse(req.body);

    logger.info('Incident event received', {
      requestId,
      severity: event.severity,
      status: event.status,
      relatedDeployment: event.relatedDeployment,
    });

    // TODO: Store incident and calculate MTTR
    // For now, just acknowledge receipt

    res.status(202).json({
      message: 'Incident event received',
      requestId,
    });
  } catch (error) {
    logger.error('Incident event validation failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};
