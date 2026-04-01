import { logger } from '../config/logger';
import { metricCalculationService } from './metricCalculation';

/**
 * Background metric processor
 *
 * Runs periodically to process events from the queue and calculate metrics
 */
class MetricProcessor {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private isProcessing = false;

  constructor(intervalMs: number = 5000) {
    this.intervalMs = intervalMs;
  }

  /**
   * Start the background processor
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Metric processor already running');
      return;
    }

    logger.info('Starting metric processor', {
      intervalMs: this.intervalMs,
    });

    // Process immediately on start
    this.processOnce();

    // Then set up interval
    this.intervalId = setInterval(() => {
      this.processOnce();
    }, this.intervalMs);
  }

  /**
   * Stop the background processor
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Metric processor stopped');
    }
  }

  /**
   * Process queue once
   */
  private async processOnce(): Promise<void> {
    // Skip if already processing
    if (this.isProcessing) {
      logger.debug('Metric processor already running, skipping');
      return;
    }

    this.isProcessing = true;

    try {
      await metricCalculationService.processQueue();
    } catch (error) {
      logger.error('Metric processor error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get processor status
   */
  getStatus() {
    return {
      running: this.intervalId !== null,
      intervalMs: this.intervalMs,
      isProcessing: this.isProcessing,
    };
  }
}

// Singleton instance - 5 second interval
export const metricProcessor = new MetricProcessor(5000);

// Graceful shutdown
process.on('SIGTERM', () => {
  metricProcessor.stop();
});

process.on('SIGINT', () => {
  metricProcessor.stop();
});
