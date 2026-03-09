/**
 * Retry utility for async operations.
 * Retries with exponential backoff on transient failures (network errors, 5xx).
 */

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true if the error is retryable. Defaults to network/5xx errors. */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  isRetryable: (error: unknown): boolean => {
    if (!error) return false;
    const msg = String((error as Error)?.message || error).toLowerCase();
    // Network failures, timeouts, Firestore unavailable
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('unavailable') ||
      msg.includes('failed to fetch') ||
      msg.includes('internal') ||
      msg.includes('deadline-exceeded')
    );
  },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= opts.maxAttempts || !opts.isRetryable(error)) {
        throw error;
      }
      // Exponential backoff with jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200,
        opts.maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
