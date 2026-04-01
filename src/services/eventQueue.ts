import { randomUUID } from 'crypto';
import { WebhookEvent } from '../types';
import { logger } from '../config/logger';
import { queueDepth } from './metrics';

/**
 * In-memory event queue for webhook processing
 *
 * This is a simple MVP implementation. For production, consider:
 * - Redis Streams for persistent queue
 * - Bull or BullMQ for advanced job processing
 * - Kafka for high-throughput event streaming
 */
class EventQueue {
  private queue: WebhookEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add event to the queue
   */
  enqueue(eventType: string, deliveryId: string, payload: any): WebhookEvent {
    const event: WebhookEvent = {
      id: randomUUID(),
      eventType,
      deliveryId,
      payload,
      receivedAt: new Date().toISOString(),
      processed: false,
    };

    // Prevent queue from growing unbounded
    if (this.queue.length >= this.maxSize) {
      const removed = this.queue.shift();
      logger.warn('Event queue at capacity, removing oldest event', {
        removedEventId: removed?.id,
        queueSize: this.queue.length,
      });
    }

    this.queue.push(event);

    // Update queue depth metric
    const pending = this.queue.filter((e) => !e.processed).length;
    queueDepth.set(pending);

    logger.debug('Event enqueued', {
      eventId: event.id,
      eventType: event.eventType,
      deliveryId: event.deliveryId,
      queueSize: this.queue.length,
    });

    return event;
  }

  /**
   * Get next unprocessed event
   */
  dequeue(): WebhookEvent | undefined {
    const event = this.queue.find((e) => !e.processed);
    return event;
  }

  /**
   * Mark event as processed
   */
  markProcessed(eventId: string): boolean {
    const event = this.queue.find((e) => e.id === eventId);
    if (event) {
      event.processed = true;

      // Update queue depth metric
      const pending = this.queue.filter((e) => !e.processed).length;
      queueDepth.set(pending);

      logger.debug('Event marked as processed', { eventId });
      return true;
    }
    return false;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const processed = this.queue.filter((e) => e.processed).length;
    const pending = this.queue.filter((e) => !e.processed).length;

    return {
      total: this.queue.length,
      processed,
      pending,
      maxSize: this.maxSize,
    };
  }

  /**
   * Get all events (for debugging)
   */
  getAll(): WebhookEvent[] {
    return [...this.queue];
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.queue = [];
    queueDepth.set(0);
    logger.info('Event queue cleared');
  }

  /**
   * Remove old processed events to free memory
   */
  cleanup(olderThanMs: number = 3600000): number {
    const cutoffTime = Date.now() - olderThanMs;
    const beforeCount = this.queue.length;

    this.queue = this.queue.filter((e) => {
      if (!e.processed) return true;
      const eventTime = new Date(e.receivedAt).getTime();
      return eventTime > cutoffTime;
    });

    const removed = beforeCount - this.queue.length;
    if (removed > 0) {
      // Update queue depth metric
      const pending = this.queue.filter((e) => !e.processed).length;
      queueDepth.set(pending);

      logger.info('Event queue cleanup completed', {
        removedCount: removed,
        remainingCount: this.queue.length,
      });
    }

    return removed;
  }
}

// Singleton instance
export const eventQueue = new EventQueue();

// Periodic cleanup (every 5 minutes)
setInterval(() => {
  eventQueue.cleanup();
}, 5 * 60 * 1000);
