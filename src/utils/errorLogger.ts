// Error Logger - Centralized error logging to Firestore
import { db, auth } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { logger } from './logger';

export interface ErrorLogData {
    message: string;
    stack?: string;
    context?: string; // e.g., "ValentineCheckout", "StripePayment", "GoalCreation"
    userId?: string;
    screenName?: string;
    additionalData?: Record<string, any>;
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
    additionalData?: Record<string, any>;
}): Promise<void> => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Get current user ID if available
    const currentUserId = context.userId || auth.currentUser?.uid || 'anonymous';

    const errorData: ErrorLogData = {
        message: errorMessage,
        stack: errorStack?.substring(0, 2000), // Limit stack size
        context: context.feature || context.screenName || 'unknown',
        screenName: context.screenName,
        userId: currentUserId,
        timestamp: new Date(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        additionalData: context.additionalData,
    };

    // Log to console for development
    logger.error(`🔴 [${errorData.context}] Error:`, errorMessage);

    // Try Firestore first
    try {
        await addDoc(collection(db, 'errors'), errorData);
        logger.log('✅ Error logged to Firestore');
    } catch (firestoreError) {
        logger.warn('⚠️ Failed to log to Firestore:', firestoreError);

        // Fallback: Save to localStorage
        try {
            const existingErrors = JSON.parse(localStorage.getItem('ernit_error_log') || '[]');
            existingErrors.push({
                ...errorData,
                timestamp: errorData.timestamp.toISOString(),
            });
            // Keep only last 20 errors
            const trimmed = existingErrors.slice(-20);
            localStorage.setItem('ernit_error_log', JSON.stringify(trimmed));
            logger.log('✅ Error saved to localStorage instead');
        } catch (localError) {
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
        additionalData?: Record<string, any>;
    }
): Promise<T> => {
    try {
        return await fn();
    } catch (error) {
        await logErrorToFirestore(error, context);
        throw error; // Re-throw so calling code can handle it
    }
};
