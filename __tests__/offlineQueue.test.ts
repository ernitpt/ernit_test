/**
 * @jest-environment jsdom
 */
import { offlineQueue } from '../src/utils/offlineQueue';

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('OfflineQueue', () => {
  // In-memory localStorage mock
  let store: Record<string, string> = {};

  beforeAll(() => {
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  beforeEach(() => {
    // Clear store between tests
    store = {};
    jest.clearAllMocks();
  });

  describe('enqueue', () => {
    it('should add items to localStorage', () => {
      offlineQueue.enqueue('test_operation', { foo: 'bar' });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'ernit_offline_queue',
        expect.any(String)
      );

      const queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        type: 'test_operation',
        payload: { foo: 'bar' },
        attempts: 0,
      });
      expect(queue[0].id).toBeDefined();
      expect(queue[0].createdAt).toBeDefined();
    });

    it('should add multiple items to the queue', () => {
      offlineQueue.enqueue('operation_1', { data: 'one' });
      offlineQueue.enqueue('operation_2', { data: 'two' });
      offlineQueue.enqueue('operation_3', { data: 'three' });

      const queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue).toHaveLength(3);
      expect(queue[0].payload).toEqual({ data: 'one' });
      expect(queue[1].payload).toEqual({ data: 'two' });
      expect(queue[2].payload).toEqual({ data: 'three' });
    });

    it('should respect MAX_QUEUE_SIZE (50) by dropping oldest items', () => {
      // Fill queue with 52 items
      for (let i = 0; i < 52; i++) {
        offlineQueue.enqueue('test_op', { index: i });
      }

      const queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue).toHaveLength(50);

      // First item should be index 2 (items 0 and 1 were dropped)
      expect(queue[0].payload.index).toBe(2);
      // Last item should be index 51
      expect(queue[49].payload.index).toBe(51);
    });

    it('should generate unique IDs for each operation', () => {
      offlineQueue.enqueue('op1', {});
      offlineQueue.enqueue('op2', {});

      const queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue[0].id).not.toBe(queue[1].id);
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(offlineQueue.size).toBe(0);
    });

    it('should return correct count', () => {
      offlineQueue.enqueue('op1', {});
      expect(offlineQueue.size).toBe(1);

      offlineQueue.enqueue('op2', {});
      expect(offlineQueue.size).toBe(2);

      offlineQueue.enqueue('op3', {});
      expect(offlineQueue.size).toBe(3);
    });
  });

  describe('processQueue', () => {
    it('should call correct handler with payload', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const handlers = {
        test_operation: mockHandler,
      };

      offlineQueue.enqueue('test_operation', { foo: 'bar', baz: 123 });
      await offlineQueue.processQueue(handlers);

      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith({ foo: 'bar', baz: 123 });
    });

    it('should remove successful items from queue', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const handlers = {
        test_op: mockHandler,
      };

      offlineQueue.enqueue('test_op', { data: 'one' });
      offlineQueue.enqueue('test_op', { data: 'two' });

      expect(offlineQueue.size).toBe(2);

      await offlineQueue.processQueue(handlers);

      expect(mockHandler).toHaveBeenCalledTimes(2);
      expect(offlineQueue.size).toBe(0);
    });

    it('should retry failed items (keeps in queue if attempts < 3)', async () => {
      let callCount = 0;
      const mockHandler = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Network error'));
      });
      const handlers = {
        test_op: mockHandler,
      };

      offlineQueue.enqueue('test_op', { data: 'test' });

      // First attempt
      await offlineQueue.processQueue(handlers);
      expect(offlineQueue.size).toBe(1);
      let queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue[0].attempts).toBe(1);

      // Second attempt
      await offlineQueue.processQueue(handlers);
      expect(offlineQueue.size).toBe(1);
      queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue[0].attempts).toBe(2);

      // Third attempt
      await offlineQueue.processQueue(handlers);
      expect(offlineQueue.size).toBe(0); // Dropped after 3 attempts

      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it('should drop items after MAX_ATTEMPTS (3)', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Failed'));
      const handlers = {
        test_op: mockHandler,
      };

      offlineQueue.enqueue('test_op', { data: 'test' });

      // Process 3 times
      await offlineQueue.processQueue(handlers);
      await offlineQueue.processQueue(handlers);
      await offlineQueue.processQueue(handlers);

      expect(offlineQueue.size).toBe(0);
      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it('should drop items with no matching handler', async () => {
      const handlers = {
        valid_op: jest.fn().mockResolvedValue(undefined),
      };

      offlineQueue.enqueue('invalid_op', { data: 'test' });
      offlineQueue.enqueue('valid_op', { data: 'test' });

      await offlineQueue.processQueue(handlers);

      expect(offlineQueue.size).toBe(0);
      expect(handlers.valid_op).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed success and failure', async () => {
      const successHandler = jest.fn().mockResolvedValue(undefined);
      const failHandler = jest.fn().mockRejectedValue(new Error('Failed'));
      const handlers = {
        success_op: successHandler,
        fail_op: failHandler,
      };

      offlineQueue.enqueue('success_op', { data: '1' });
      offlineQueue.enqueue('fail_op', { data: '2' });
      offlineQueue.enqueue('success_op', { data: '3' });

      await offlineQueue.processQueue(handlers);

      expect(successHandler).toHaveBeenCalledTimes(2);
      expect(failHandler).toHaveBeenCalledTimes(1);
      expect(offlineQueue.size).toBe(1); // Only failed item remains

      const queue = JSON.parse(store['ernit_offline_queue']);
      expect(queue[0].type).toBe('fail_op');
      expect(queue[0].attempts).toBe(1);
    });

    it('should be re-entrant safe (does not run if already processing)', async () => {
      let resolveHandler!: () => void;
      const delayedHandler = jest.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveHandler = resolve;
          })
      );
      const handlers = {
        slow_op: delayedHandler,
      };

      offlineQueue.enqueue('slow_op', { data: 'test' });

      // Start processing (will hang until we resolve the handler)
      const firstProcess = offlineQueue.processQueue(handlers);
      // Yield to let processQueue enter the handler
      await new Promise((r) => setTimeout(r, 10));

      // Try to process again while first is running - should return immediately
      const secondProcess = offlineQueue.processQueue(handlers);
      await secondProcess;

      // Handler should only be called once (second call exited early)
      expect(delayedHandler).toHaveBeenCalledTimes(1);

      // Resolve the first handler to let processQueue finish
      resolveHandler();
      await firstProcess;
    }, 10000);

    it('should return early if queue is empty', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const handlers = {
        test_op: mockHandler,
      };

      await offlineQueue.processQueue(handlers);

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('listenForOnline', () => {
    it('should register online event listener and return cleanup function', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const handlers = {
        test_op: jest.fn().mockResolvedValue(undefined),
      };

      const cleanup = offlineQueue.listenForOnline(handlers);

      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));

      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should process queue when online event fires', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const handlers = {
        test_op: mockHandler,
      };

      offlineQueue.enqueue('test_op', { data: 'test' });

      const cleanup = offlineQueue.listenForOnline(handlers);

      // Simulate online event
      window.dispatchEvent(new Event('online'));

      // Wait long enough for async processQueue to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockHandler).toHaveBeenCalledWith({ data: 'test' });

      cleanup();
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle localStorage errors gracefully on enqueue', () => {
      const setItemMock = localStorage.setItem as jest.Mock;
      setItemMock.mockImplementationOnce(() => {
        throw new Error('Storage full');
      });

      // Should not throw
      expect(() => {
        offlineQueue.enqueue('test_op', { data: 'test' });
      }).not.toThrow();
    });

    it('should handle localStorage errors gracefully on getQueue', async () => {
      const getItemMock = localStorage.getItem as jest.Mock;
      getItemMock.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const handlers = {
        test_op: mockHandler,
      };

      // Should not throw and should treat as empty queue
      await expect(offlineQueue.processQueue(handlers)).resolves.not.toThrow();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON in localStorage', async () => {
      store['ernit_offline_queue'] = 'invalid json{';

      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const handlers = {
        test_op: mockHandler,
      };

      // Should not throw and should treat as empty queue
      await expect(offlineQueue.processQueue(handlers)).resolves.not.toThrow();
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});
