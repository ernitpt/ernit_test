/**
 * Standardized application error class.
 *
 * Categories:
 * - `validation`  — bad user input, show message directly
 * - `business`    — business rule violation (limit reached, expired, etc.), show message directly
 * - `not_found`   — resource doesn't exist, show message directly
 * - `auth`        — authentication/permission issue, show message directly
 * - `rate_limit`  — too many requests, show message directly
 * - `internal`    — unexpected failure, show generic message to user, log details
 *
 * Usage in services:
 *   throw new AppError('GOAL_LIMIT_REACHED', 'You can have up to 3 active goals', 'business');
 *
 * Usage in screens:
 *   catch (err) {
 *     showError(getUserMessage(err));
 *   }
 */

export type ErrorCategory =
  | 'validation'
  | 'business'
  | 'not_found'
  | 'auth'
  | 'rate_limit'
  | 'internal';

export class AppError extends Error {
  /** Machine-readable code for programmatic handling */
  readonly code: string;
  /** Determines how the error should be presented to the user */
  readonly category: ErrorCategory;

  constructor(code: string, message: string, category: ErrorCategory = 'internal') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.category = category;
  }

  /** Whether the error message is safe to show directly to the user */
  get isUserFacing(): boolean {
    return this.category !== 'internal';
  }
}

/**
 * Extract a user-safe message from any error.
 * - AppError with a user-facing category → use its message
 * - AppError with 'internal' category → generic message
 * - Regular Error → generic message
 * - String → use directly (legacy support)
 */
export function getUserMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof AppError && error.isUserFacing) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * Check if an error matches a specific code.
 * Works with both AppError and legacy `new Error('CODE')` patterns.
 */
export function isErrorCode(error: unknown, code: string): boolean {
  if (error instanceof AppError) {
    return error.code === code;
  }
  if (error instanceof Error) {
    return error.message === code;
  }
  return false;
}
