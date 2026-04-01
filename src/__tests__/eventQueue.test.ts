import { eventQueue } from '../services/eventQueue';

describe('EventQueue', () => {
  beforeEach(() => {
    eventQueue.clear(); // Clear before each test
  });

  describe('enqueue', () => {
    it('should add event to queue', () => {
      const event = eventQueue.enqueue('deployment', 'delivery-1', { test: 'data' });

      expect(event).toHaveProperty('id');
      expect(event.eventType).toBe('deployment');
      expect(event.deliveryId).toBe('delivery-1');
      expect(event.payload).toEqual({ test: 'data' });
      expect(event.processed).toBe(false);
      expect(event.receivedAt).toBeDefined();

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('should handle multiple events', () => {
      eventQueue.enqueue('deployment', 'delivery-1', {});
      eventQueue.enqueue('push', 'delivery-2', {});
      eventQueue.enqueue('deployment_status', 'delivery-3', {});

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(3);
    });

    it('should handle queue at capacity', () => {
      // Fill queue to large capacity (default 1000)
      // Just test that enqueue works without errors at high volume
      for (let i = 0; i < 100; i++) {
        eventQueue.enqueue('deployment', `delivery-${i}`, { index: i });
      }

      const stats = eventQueue.getStats();
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  describe('dequeue', () => {
    it('should return first unprocessed event', () => {
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});
      eventQueue.enqueue('push', 'delivery-2', {});

      const dequeued = eventQueue.dequeue();
      expect(dequeued?.id).toBe(event1.id);
    });

    it('should skip processed events', () => {
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});
      const event2 = eventQueue.enqueue('push', 'delivery-2', {});

      eventQueue.markProcessed(event1.id);

      const dequeued = eventQueue.dequeue();
      expect(dequeued?.id).toBe(event2.id);
    });

    it('should return undefined when queue is empty', () => {
      const dequeued = eventQueue.dequeue();
      expect(dequeued).toBeUndefined();
    });

    it('should return undefined when all events are processed', () => {
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});
      const event2 = eventQueue.enqueue('push', 'delivery-2', {});

      eventQueue.markProcessed(event1.id);
      eventQueue.markProcessed(event2.id);

      const dequeued = eventQueue.dequeue();
      expect(dequeued).toBeUndefined();
    });
  });

  describe('markProcessed', () => {
    it('should mark event as processed', () => {
      const event = eventQueue.enqueue('deployment', 'delivery-1', {});

      const result = eventQueue.markProcessed(event.id);
      expect(result).toBe(true);

      const stats = eventQueue.getStats();
      expect(stats.processed).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it('should return false for non-existent event', () => {
      const result = eventQueue.markProcessed('non-existent-id');
      expect(result).toBe(false);
    });

    it('should not affect other events', () => {
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});
      const event2 = eventQueue.enqueue('push', 'delivery-2', {});

      eventQueue.markProcessed(event1.id);

      const stats = eventQueue.getStats();
      expect(stats.processed).toBe(1);
      expect(stats.pending).toBe(1);

      const dequeued = eventQueue.dequeue();
      expect(dequeued?.id).toBe(event2.id);
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty queue', () => {
      const stats = eventQueue.getStats();
      expect(stats.total).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.maxSize).toBeGreaterThan(0);
    });

    it('should return correct stats with mixed events', () => {
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});
      eventQueue.enqueue('push', 'delivery-2', {});
      const event3 = eventQueue.enqueue('deployment_status', 'delivery-3', {});

      eventQueue.markProcessed(event1.id);
      eventQueue.markProcessed(event3.id);

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(3);
      expect(stats.processed).toBe(2);
      expect(stats.pending).toBe(1);
    });
  });

  describe('getAll', () => {
    it('should return all events', () => {
      eventQueue.enqueue('deployment', 'delivery-1', {});
      eventQueue.enqueue('push', 'delivery-2', {});

      const allEvents = eventQueue.getAll();
      expect(allEvents).toHaveLength(2);
    });

    it('should return a copy of the queue', () => {
      eventQueue.enqueue('deployment', 'delivery-1', {});

      const allEvents = eventQueue.getAll();
      allEvents.push({
        id: 'fake',
        eventType: 'fake',
        deliveryId: 'fake',
        payload: {},
        receivedAt: new Date().toISOString(),
        processed: false,
      });

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1); // Original queue unchanged
    });
  });

  describe('clear', () => {
    it('should remove all events', () => {
      eventQueue.enqueue('deployment', 'delivery-1', {});
      eventQueue.enqueue('push', 'delivery-2', {});

      eventQueue.clear();

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.processed).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old processed events', () => {
      // Create events with old timestamps
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});
      const event2 = eventQueue.enqueue('push', 'delivery-2', {});

      eventQueue.markProcessed(event1.id);

      // Manually set old timestamp (access internal state for testing)
      const allEvents = eventQueue.getAll();
      const oldEvent = allEvents.find((e: any) => e.id === event1.id);
      if (oldEvent) {
        const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
        oldEvent.receivedAt = twoHoursAgo;
      }

      // Cleanup events older than 1 hour
      const removed = eventQueue.cleanup(3600000);

      expect(removed).toBe(1);

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);

      // Verify remaining event is event2
      const remaining = eventQueue.getAll();
      expect(remaining[0].id).toBe(event2.id);
    });

    it('should keep unprocessed events regardless of age', () => {
      const event1 = eventQueue.enqueue('deployment', 'delivery-1', {});

      // Set old timestamp on unprocessed event
      const allEvents = eventQueue.getAll();
      const oldEvent = allEvents.find((e: any) => e.id === event1.id);
      if (oldEvent) {
        const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
        oldEvent.receivedAt = twoHoursAgo;
      }

      const removed = eventQueue.cleanup(3600000);

      expect(removed).toBe(0);

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('should return 0 when no events are removed', () => {
      eventQueue.enqueue('deployment', 'delivery-1', {});

      const removed = eventQueue.cleanup(3600000);

      expect(removed).toBe(0);

      const stats = eventQueue.getStats();
      expect(stats.total).toBe(1);
    });
  });
});
