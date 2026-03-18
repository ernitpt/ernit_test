// services/stripeService.ts

import { auth } from './firebase';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { logErrorToFirestore } from '../utils/errorLogger';
import { withRetry } from '../utils/retry';
import { AppError } from '../utils/AppError';

// Use environment-based URL and function names
const STRIPE_FUNCTIONS_URL = config.functionsUrl;
const FUNCTIONS = config.stripeFunctions;

export const stripeService = {
  /**
   * Create a payment intent with full metadata for webhook processing
   */
  createPaymentIntent: async (
    amount: number,
    giverId: string,
    giverName?: string,
    partnerId?: string,
    cartItems?: {
      experienceId: string;
      partnerId: string;
      quantity: number;
    }[],
    personalizedMessage?: string
  ): Promise<{ clientSecret: string; paymentIntentId: string }> => {
    try {
      // Get the current user's ID token
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new AppError('UNAUTHENTICATED', 'User not authenticated', 'auth');
      }

      const idToken = await currentUser.getIdToken();

      const data = await withRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${STRIPE_FUNCTIONS_URL}/${FUNCTIONS.createPaymentIntent}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            amount,
            giverId,
            giverName: giverName || "",
            partnerId: partnerId || "",
            cart: cartItems,
            personalizedMessage: personalizedMessage || "",
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        return await response.json();
      });

      // Extract payment intent ID from client secret
      // Format: pi_xxxxx_secret_yyyyy
      const paymentIntentId = data.clientSecret.split("_secret_")[0];

      return {
        clientSecret: data.clientSecret,
        paymentIntentId,
      };
    } catch (error: unknown) {
      logger.error("Error creating payment intent:", error);
      const err = error instanceof Error ? error : new Error('Unknown error');

      // Log to Firestore with full context
      await logErrorToFirestore(err, {
        feature: 'PaymentIntent',
        additionalData: {
          amount,
          giverId,
          partnerId,
          cartItemsCount: cartItems?.length || 0,
          errorType: err.name,
        },
      });

      throw new Error(err.message || "Failed to create payment intent");
    }
  },

  /**
   * ✅ SECURITY FIX: Update payment intent metadata with authentication
   */
  updatePaymentIntentMetadata: async (
    paymentIntentId: string,
    personalizedMessage: string
  ): Promise<void> => {
    try {
      // ✅ SECURITY: Get authentication token
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new AppError('UNAUTHENTICATED', 'User not authenticated', 'auth');
      }

      const idToken = await currentUser.getIdToken();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${STRIPE_FUNCTIONS_URL}/${FUNCTIONS.updatePaymentIntentMetadata}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          paymentIntentId,
          personalizedMessage,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update payment intent");
      }
    } catch (error: unknown) {
      logger.error("Error updating payment intent:", error);
      // Don't throw - this is not critical for payment flow
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg === "User not authenticated") {
        logger.warn("⚠️ User not authenticated when trying to update payment metadata");
      }
    }
  },

  /**
   * Check if a gift was created for a payment intent
   * ✅ SECURITY FIX: Added authentication
   */
  getGiftByPaymentIntent: async (paymentIntentId: string): Promise<Record<string, unknown> | null> => {
    try {
      // ✅ SECURITY: Get authentication token
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new AppError('UNAUTHENTICATED', 'User not authenticated', 'auth');
      }

      const idToken = await currentUser.getIdToken();

      const gift = await withRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(
          `${STRIPE_FUNCTIONS_URL}/${FUNCTIONS.getGiftsByPaymentIntent}?paymentIntentId=${paymentIntentId}`,
          {
            headers: {
              "Authorization": `Bearer ${idToken}`,
            },
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch gift");
        }

        return await response.json();
      });

      if (!gift) return null;

      // Convert date strings to Date objects
      return {
        ...gift,
        createdAt: new Date(gift.createdAt),
        deliveryDate: new Date(gift.deliveryDate),
        updatedAt: new Date(gift.updatedAt),
      };
    } catch (error: unknown) {
      logger.error("Error fetching gift:", error);
      return null;
    }
  },
};