import { Request, Response } from 'express';
import { influxQueryService } from '../services/influxQuery';

/**
 * Get dashboard metrics data
 */
export const getDashboardData = async (req: Request, res: Response): Promise<void> => {
  if (!influxQueryService.isEnabled()) {
    res.status(503).json({
      error: {
        message: 'Dashboard unavailable - InfluxDB not configured',
        requestId: (req as any).id,
      },
    });
    return;
  }

  try {
    const daysParam = req.query.days as string;
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (isNaN(days) || days < 1 || days > 365) {
      res.status(400).json({
        error: {
          message: 'Days parameter must be between 1 and 365',
          requestId: (req as any).id,
        },
      });
      return;
    }

    const stats = await influxQueryService.getDashboardStats(days);

    res.json({
      data: stats,
      meta: {
        days,
        generatedAt: new Date().toISOString(),
        requestId: (req as any).id,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Failed to fetch dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: (req as any).id,
      },
    });
  }
};
