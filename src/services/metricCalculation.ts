import { logger } from '../config/logger';
import { eventQueue } from './eventQueue';
import { influxDBService } from './influxdb';
import { WebhookEvent } from '../types';
import { webhookProcessingDuration } from './metrics';

/**
 * MetricCalculationService
 *
 * Processes webhook events from the queue and calculates DORA metrics:
 * - Deployment Frequency: Count of deployments per time window
 * - Lead Time for Changes: Time from commit to deployment
 */
class MetricCalculationService {
  // Track processed delivery IDs to handle duplicates
  private processedDeliveryIds = new Set<string>();
  private readonly maxProcessedIds = 10000;

  // Store commit timestamps for lead time calculation
  private commitTimestamps = new Map<string, Date>();
  private readonly maxCommitCache = 5000;

  /**
   * Process all pending events in the queue
   */
  async processQueue(): Promise<void> {
    let event = eventQueue.dequeue();
    let processedCount = 0;
    let errorCount = 0;

    while (event) {
      try {
        await this.processEvent(event);
        eventQueue.markProcessed(event.id);
        processedCount++;
      } catch (error) {
        errorCount++;
        logger.error('Failed to process event', {
          eventId: event.id,
          eventType: event.eventType,
          deliveryId: event.deliveryId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Mark as processed anyway to avoid infinite retry
        eventQueue.markProcessed(event.id);
      }

      event = eventQueue.dequeue();
    }

    if (processedCount > 0 || errorCount > 0) {
      logger.info('Queue processing completed', {
        processed: processedCount,
        errors: errorCount,
        queueStats: eventQueue.getStats(),
      });
    }
  }

  /**
   * Process a single webhook event
   */
  private async processEvent(event: WebhookEvent): Promise<void> {
    const startTime = Date.now();
    let status = 'success';

    try {
      // Check for duplicates using delivery ID
      if (this.processedDeliveryIds.has(event.deliveryId)) {
        logger.debug('Duplicate event detected, skipping', {
          eventId: event.id,
          deliveryId: event.deliveryId,
          eventType: event.eventType,
        });
        status = 'duplicate';
        return;
      }

      switch (event.eventType) {
        case 'push':
          await this.processPushEvent(event);
          break;

        case 'deployment_status':
          await this.processDeploymentStatusEvent(event);
          break;

        case 'deployment':
          // Deployment creation events don't need processing for metrics
          logger.debug('Deployment creation event ignored', {
            eventId: event.id,
          });
          status = 'ignored';
          break;

        default:
          logger.debug('Unsupported event type for metric calculation', {
            eventId: event.id,
            eventType: event.eventType,
          });
          status = 'unsupported';
      }

      // Mark delivery ID as processed
      this.addProcessedDeliveryId(event.deliveryId);
    } catch (error) {
      status = 'error';
      throw error;
    } finally {
      // Track processing duration
      const duration = (Date.now() - startTime) / 1000;
      webhookProcessingDuration.observe(
        { event_type: event.eventType, status },
        duration
      );
    }
  }

  /**
   * Process push event to store commit timestamps for lead time calculation
   */
  private async processPushEvent(event: WebhookEvent): Promise<void> {
    const { payload } = event;

    if (!this.validatePushPayload(payload)) {
      logger.warn('Invalid push event payload', {
        eventId: event.id,
        deliveryId: event.deliveryId,
      });
      return;
    }

    const commits = payload.commits || [];
    const repository = payload.repository?.full_name || 'unknown';

    commits.forEach((commit: any) => {
      if (commit.id && commit.timestamp) {
        const commitSha = commit.id;
        const commitTimestamp = new Date(commit.timestamp);

        // Validate timestamp is reasonable
        if (this.isValidTimestamp(commitTimestamp)) {
          this.addCommitTimestamp(commitSha, commitTimestamp);

          logger.debug('Commit timestamp stored', {
            commitSha,
            timestamp: commitTimestamp.toISOString(),
            repository,
          });
        } else {
          logger.warn('Invalid commit timestamp', {
            commitSha,
            timestamp: commit.timestamp,
          });
        }
      }
    });

    logger.debug('Push event processed', {
      eventId: event.id,
      repository,
      commitsProcessed: commits.length,
    });
  }

  /**
   * Process deployment_status event to calculate and write metrics
   */
  private async processDeploymentStatusEvent(event: WebhookEvent): Promise<void> {
    const { payload } = event;

    if (!this.validateDeploymentStatusPayload(payload)) {
      logger.warn('Invalid deployment_status event payload', {
        eventId: event.id,
        deliveryId: event.deliveryId,
      });
      return;
    }

    const deploymentStatus = payload.deployment_status;
    const deployment = payload.deployment;
    const repository = payload.repository?.full_name || 'unknown';

    // Only process successful deployments for metrics
    if (deploymentStatus.state !== 'success') {
      logger.debug('Non-success deployment status ignored', {
        eventId: event.id,
        state: deploymentStatus.state,
      });
      return;
    }

    const commitSha = deployment.sha;
    const environment = deployment.environment;
    const deploymentTimestamp = new Date(deploymentStatus.created_at);

    // Validate deployment timestamp
    if (!this.isValidTimestamp(deploymentTimestamp)) {
      logger.warn('Invalid deployment timestamp', {
        eventId: event.id,
        timestamp: deploymentStatus.created_at,
      });
      return;
    }

    // Calculate lead time if we have commit timestamp
    let leadTimeMinutes: number | undefined;
    const commitTimestamp = this.commitTimestamps.get(commitSha);

    if (commitTimestamp) {
      const leadTimeMs = deploymentTimestamp.getTime() - commitTimestamp.getTime();

      // Validate lead time is positive
      if (leadTimeMs > 0) {
        leadTimeMinutes = leadTimeMs / (1000 * 60);

        logger.info('Lead time calculated', {
          commitSha,
          leadTimeMinutes: leadTimeMinutes.toFixed(2),
          commitTimestamp: commitTimestamp.toISOString(),
          deploymentTimestamp: deploymentTimestamp.toISOString(),
        });
      } else {
        logger.warn('Invalid lead time: deployment timestamp before commit timestamp', {
          commitSha,
          commitTimestamp: commitTimestamp.toISOString(),
          deploymentTimestamp: deploymentTimestamp.toISOString(),
        });
      }
    } else {
      logger.debug('No commit timestamp found for lead time calculation', {
        commitSha,
        eventId: event.id,
      });
    }

    // Write deployment to InfluxDB
    await influxDBService.writeDeployment({
      timestamp: deploymentTimestamp,
      environment,
      status: 'success',
      repository,
      commitSha,
      leadTimeMinutes,
      deliveryId: event.deliveryId,
    });

    // Write deployment frequency metric
    await influxDBService.writeMetric({
      timestamp: deploymentTimestamp,
      metricName: 'deployment_frequency',
      value: 1,
      window: 'daily',
      environment,
      repository,
    });

    // Write lead time metric if available
    if (leadTimeMinutes !== undefined) {
      await influxDBService.writeMetric({
        timestamp: deploymentTimestamp,
        metricName: 'lead_time',
        value: leadTimeMinutes,
        window: 'daily',
        environment,
        repository,
      });
    }

    // Flush writes to InfluxDB
    await influxDBService.flush();

    logger.info('Deployment metrics written', {
      eventId: event.id,
      repository,
      environment,
      commitSha,
      leadTimeMinutes,
    });
  }

  /**
   * Validate push event payload
   */
  private validatePushPayload(payload: any): boolean {
    return (
      payload &&
      Array.isArray(payload.commits) &&
      payload.repository &&
      payload.repository.full_name
    );
  }

  /**
   * Validate deployment_status event payload
   */
  private validateDeploymentStatusPayload(payload: any): boolean {
    return (
      payload &&
      payload.deployment_status &&
      payload.deployment_status.state &&
      payload.deployment_status.created_at &&
      payload.deployment &&
      payload.deployment.sha &&
      payload.deployment.environment &&
      payload.repository &&
      payload.repository.full_name
    );
  }

  /**
   * Validate timestamp is within reasonable bounds
   */
  private isValidTimestamp(date: Date): boolean {
    const now = Date.now();
    const timestamp = date.getTime();

    // Reject timestamps more than 1 year in the past or in the future
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    return (
      !isNaN(timestamp) &&
      timestamp > now - oneYearMs &&
      timestamp < now + oneYearMs
    );
  }

  /**
   * Add delivery ID to processed set with size limit
   */
  private addProcessedDeliveryId(deliveryId: string): void {
    if (this.processedDeliveryIds.size >= this.maxProcessedIds) {
      // Remove oldest entries (arbitrary, since Set doesn't guarantee order)
      const iterator = this.processedDeliveryIds.values();
      const toRemove = Math.floor(this.maxProcessedIds * 0.2);
      for (let i = 0; i < toRemove; i++) {
        const value = iterator.next().value;
        if (value) {
          this.processedDeliveryIds.delete(value);
        }
      }
    }

    this.processedDeliveryIds.add(deliveryId);
  }

  /**
   * Add commit timestamp to cache with size limit
   */
  private addCommitTimestamp(commitSha: string, timestamp: Date): void {
    if (this.commitTimestamps.size >= this.maxCommitCache) {
      // Remove oldest entries (arbitrary, since Map iteration order is insertion order)
      const iterator = this.commitTimestamps.keys();
      const toRemove = Math.floor(this.maxCommitCache * 0.2);
      for (let i = 0; i < toRemove; i++) {
        const key = iterator.next().value;
        if (key) {
          this.commitTimestamps.delete(key);
        }
      }
    }

    this.commitTimestamps.set(commitSha, timestamp);
  }

  /**
   * Calculate deployment frequency for a time window
   *
   * Note: This is a simple count-based implementation.
   * For production, consider aggregating from InfluxDB using time-series queries.
   */
  async calculateDeploymentFrequency(
    repository: string,
    environment: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    // For MVP, this is a placeholder
    // In production, query InfluxDB directly for aggregated counts

    logger.debug('Deployment frequency calculation requested', {
      repository,
      environment,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    // This would typically be:
    // SELECT COUNT(value) FROM deployments
    // WHERE repository = $repository AND environment = $environment
    // AND time >= $startDate AND time <= $endDate

    return 0;
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats() {
    return {
      processedDeliveryIds: this.processedDeliveryIds.size,
      commitTimestamps: this.commitTimestamps.size,
      maxProcessedIds: this.maxProcessedIds,
      maxCommitCache: this.maxCommitCache,
    };
  }

  /**
   * Clear caches (for testing)
   */
  clearCaches(): void {
    this.processedDeliveryIds.clear();
    this.commitTimestamps.clear();
    logger.info('Metric calculation caches cleared');
  }
}

// Singleton instance
export const metricCalculationService = new MetricCalculationService();
