import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { RequestWithId } from '../types';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = (req as RequestWithId).id;

  if (err instanceof AppError) {
    logger.error('Application error', {
      requestId,
      statusCode: err.statusCode,
      message: err.message,
      isOperational: err.isOperational,
    });

    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        requestId,
      },
    });
  }

  if (err instanceof ZodError) {
    logger.error('Validation error', {
      requestId,
      errors: err.errors,
    });

    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.errors,
        requestId,
      },
    });
  }

  logger.error('Unexpected error', {
    requestId,
    error: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      requestId,
    },
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  const requestId = (req as RequestWithId).id;
  res.status(404).json({
    error: {
      message: 'Route not found',
      path: req.path,
      requestId,
    },
  });
};
