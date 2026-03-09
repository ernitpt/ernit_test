/**
 * Offline operation queue — persists failed writes to localStorage
 * and retries them when the app comes back online.
 *
 * Usage:
 *   import { offlineQueue } from '../utils/offlineQueue';
 *
 *   try {
 *     await someFirestoreWrite();
 *   } catch (error) {
 *     if (isNetworkError(error)) {
 *       offlineQueue.enqueue('updateGoal', { goalId, updates });
 *     }
 *     throw error;
 *   }
 *
 *   // On app startup or when coming online:
 *   offlineQueue.processQueue(handlers);
 */

import { logger } from './logger';

interface QueuedOperation {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

type OperationHandler = (payload: Record<string, unknown>) => Promise<void>;

const STORAGE_KEY = 'ernit_offline_queue';
const MAX_ATTEMPTS = 3;
const MAX_QUEUE_SIZE = 50;

class OfflineQueue {
  private processing = false;

  /** Add a failed operation to the queue */
  enqueue(type: string, payload: Record<string, unknown>): void {
    try {
      const queue = this.getQueue();
      if (queue.length >= MAX_QUEUE_SIZE) {
        // Drop oldest items to prevent unbounded growth
        queue.splice(0, queue.length - MAX_QUEUE_SIZE + 1);
      }
      queue.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      this.saveQueue(queue);
      logger.log(`Offline queue: enqueued ${type} (${queue.length} items)`);
    } catch {
      // localStorage might be full — fail silently
    }
  }

  /** Process all queued operations using provided handlers */
  async processQueue(handlers: Record<string, OperationHandler>): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const queue = this.getQueue();
      if (queue.length === 0) return;

      logger.log(`Offline queue: processing ${queue.length} items`);
      const remaining: QueuedOperation[] = [];

      for (const op of queue) {
        const handler = handlers[op.type];
        if (!handler) {
          logger.warn(`Offline queue: no handler for type "${op.type}", dropping`);
          continue;
        }

        try {
          await handler(op.payload);
          logger.log(`Offline queue: processed ${op.type} (${op.id})`);
        } catch {
          op.attempts += 1;
          if (op.attempts < MAX_ATTEMPTS) {
            remaining.push(op);
          } else {
            logger.warn(`Offline queue: dropping ${op.type} after ${MAX_ATTEMPTS} attempts`);
          }
        }
      }

      this.saveQueue(remaining);
    } finally {
      this.processing = false;
    }
  }

  /** Get current queue size */
  get size(): number {
    return this.getQueue().length;
  }

  /** Listen for online events and auto-process */
  listenForOnline(handlers: Record<string, OperationHandler>): () => void {
    const handleOnline = () => {
      logger.log('Offline queue: device came online, processing queue');
      this.processQueue(handlers);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }
    return () => {};
  }

  private getQueue(): QueuedOperation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: QueuedOperation[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // Storage full — fail silently
    }
  }
}

export const offlineQueue = new OfflineQueue();
