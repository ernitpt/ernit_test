// Error Logger - Centralized error logging to Firestore
import { db, auth } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { logger } from './logger';

// Client-side rate limiting: max 10 error logs per minute
const ERROR_RATE_LIMIT = 10;
const ERROR_RATE_WINDOW_MS = 60_000;
let errorTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  errorTimestamps = errorTimestamps.filter(t => now - t < ERROR_RATE_WINDOW_MS);
  if (errorTimestamps.length >= ERROR_RATE_LIMIT) {
    return true;
  }
  errorTimestamps.push(now);
  return false;
}

export interface ErrorLogData {
    message: string;
    stack?: string;
    context?: string; // e.g., "ValentineCheckout", "StripePayment", "GoalCreation"
    userId?: string;
    screenName?: string;
    additionalData?: Record<string, unknown>;
    timestamp: Date;
    userAgent?: string;
}

/**
 * Log error to Firestore with full context
 * Use this in try-catch blocks throughout the app
 */
export const logErrorToFirestore = async (error: Error | unknown, context: {
    screenName?: string;
    feature?: string;
    userId?: string;
    additionalData?: Record<string, unknown>;
}): Promise<void> => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Get current user ID if available
    const currentUserId = context.userId || auth.currentUser?.uid || 'anonymous';

    // Strip undefined values — Firestore SDK rejects undefined field values
    const errorData: ErrorLogData = {
        message: errorMessage,
        ...(errorStack ? { stack: errorStack.substring(0, 2000) } : {}),
        context: context.feature || context.screenName || 'unknown',
        ...(context.screenName ? { screenName: context.screenName } : {}),
        userId: currentUserId,
        timestamp: new Date(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        ...(context.additionalData ? {
            additionalData: Object.fromEntries(
                Object.entries(context.additionalData).filter(([_, v]) => v !== undefined)
            ),
        } : {}),
    };

    // Log to console for development
    logger.error(`🔴 [${errorData.context}] Error:`, errorMessage);

    // Client-side rate limit to prevent Firestore spam
    if (isRateLimited()) {
        logger.warn('⚠️ Error logging rate limited — skipping Firestore write');
        return;
    }

    // Try Firestore first
    try {
        await addDoc(collection(db, 'errors'), errorData);
        logger.log('✅ Error logged to Firestore');
    } catch (firestoreError: unknown) {
        logger.warn('⚠️ Failed to log to Firestore:', firestoreError);

        // Fallback: Save to localStorage (web only)
        try {
            if (typeof localStorage === 'undefined') {
                throw new Error('No localStorage available');
            }
            const existingErrors = JSON.parse(localStorage.getItem('ernit_error_log') || '[]');
            existingErrors.push({
                ...errorData,
                timestamp: errorData.timestamp.toISOString(),
            });
            // Keep only last 20 errors
            const trimmed = existingErrors.slice(-20);
            localStorage.setItem('ernit_error_log', JSON.stringify(trimmed));
            logger.log('✅ Error saved to localStorage instead');
        } catch (localError: unknown) {
            logger.error('❌ Could not save error anywhere:', localError);
        }
    }
};

/**
 * Wrap async functions with automatic error logging
 * Usage: await withErrorLogging(() => someAsyncFunction(), { feature: 'PaymentProcessing' })
 */
export const withErrorLogging = async <T>(
    fn: () => Promise<T>,
    context: {
        screenName?: string;
        feature?: string;
        userId?: string;
        additionalData?: Record<string, unknown>;
    }
): Promise<T> => {
    try {
        return await fn();
    } catch (error: unknown) {
        await logErrorToFirestore(error, context);
        throw error; // Re-throw so calling code can handle it
    }
};
