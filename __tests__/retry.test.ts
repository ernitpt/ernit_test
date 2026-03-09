import { withRetry } from '../src/utils/retry';

// Use real timers with tiny delays to keep tests fast
const FAST_OPTS = { baseDelayMs: 1, maxDelayMs: 5 };

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(mockFn, FAST_OPTS);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds on 2nd attempt', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(mockFn, FAST_OPTS);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts exhausted', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('timeout occurred'));
    await expect(
      withRetry(mockFn, { ...FAST_OPTS, maxAttempts: 3 })
    ).rejects.toThrow('timeout occurred');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-retryable errors', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Invalid argument'));
    await expect(withRetry(mockFn, FAST_OPTS)).rejects.toThrow('Invalid argument');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('respects custom maxAttempts', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('network failure'));
    await expect(
      withRetry(mockFn, { ...FAST_OPTS, maxAttempts: 5 })
    ).rejects.toThrow('network failure');
    expect(mockFn).toHaveBeenCalledTimes(5);
  });

  describe('default isRetryable', () => {
    const retryableMessages = [
      'Network error',
      'Request timeout',
      'Service unavailable',
      'Failed to fetch',
      'Internal server error',
      'deadline-exceeded',
    ];

    it.each(retryableMessages)('retries on "%s"', async (msg) => {
      const mockFn = jest.fn().mockRejectedValue(new Error(msg));
      await expect(
        withRetry(mockFn, { ...FAST_OPTS, maxAttempts: 2 })
      ).rejects.toThrow(msg);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry non-matching errors', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Permission denied'));
      await expect(withRetry(mockFn, FAST_OPTS)).rejects.toThrow('Permission denied');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  it('uses custom isRetryable function', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('CUSTOM_RETRYABLE'));
    await expect(
      withRetry(mockFn, {
        ...FAST_OPTS,
        maxAttempts: 2,
        isRetryable: (err) => String((err as Error)?.message).includes('CUSTOM_RETRYABLE'),
      })
    ).rejects.toThrow('CUSTOM_RETRYABLE');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('custom isRetryable returning false skips retry', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('network error'));
    await expect(
      withRetry(mockFn, { ...FAST_OPTS, maxAttempts: 3, isRetryable: () => false })
    ).rejects.toThrow('network error');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
