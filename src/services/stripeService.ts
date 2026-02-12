// services/stripeService.ts

import { auth } from './firebase';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { logErrorToFirestore } from '../utils/errorLogger';

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
        throw new Error("User not authenticated");
      }

      const idToken = await currentUser.getIdToken();

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
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Extract payment intent ID from client secret
      // Format: pi_xxxxx_secret_yyyyy
      const paymentIntentId = data.clientSecret.split("_secret_")[0];

      return {
        clientSecret: data.clientSecret,
        paymentIntentId,
      };
    } catch (error: any) {
      logger.error("Error creating payment intent:", error);

      // Log to Firestore with full context
      await logErrorToFirestore(error, {
        feature: 'PaymentIntent',
        additionalData: {
          amount,
          giverId,
          partnerId,
          cartItemsCount: cartItems?.length || 0,
          errorType: error.name,
        },
      });

      throw new Error(error.message || "Failed to create payment intent");
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
        throw new Error("User not authenticated");
      }

      const idToken = await currentUser.getIdToken();

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
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update payment intent");
      }
    } catch (error: any) {
      logger.error("Error updating payment intent:", error);
      // Don't throw - this is not critical for payment flow
      if (error.message === "User not authenticated") {
        logger.warn("⚠️ User not authenticated when trying to update payment metadata");
      }
    }
  },

  /**
   * Check if a gift was created for a payment intent
   * ✅ SECURITY FIX: Added authentication
   */
  getGiftByPaymentIntent: async (paymentIntentId: string): Promise<any | null> => {
    try {
      // ✅ SECURITY: Get authentication token
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        `${STRIPE_FUNCTIONS_URL}/${FUNCTIONS.getGiftsByPaymentIntent}?paymentIntentId=${paymentIntentId}`,
        {
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch gift");
      }

      const gift = await response.json();

      // Convert date strings to Date objects
      return {
        ...gift,
        createdAt: new Date(gift.createdAt),
        deliveryDate: new Date(gift.deliveryDate),
        updatedAt: new Date(gift.updatedAt),
      };
    } catch (error: any) {
      logger.error("Error fetching gift:", error);
      return null;
    }
  },

  /**
   * Create payment intent for Valentine's challenge (no authentication required)
   */
  createValentinePaymentIntent: async (
    amount: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<{ clientSecret: string; paymentIntentId: string }> => {
    try {
      const response = await fetch(`${STRIPE_FUNCTIONS_URL}/${FUNCTIONS.createValentinePaymentIntent}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency,
          metadata,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        const errorMsg = errorData.error || `HTTP ${response.status}`;

        // Log to Firestore
        await logErrorToFirestore(new Error(errorMsg), {
          feature: 'ValentinePaymentIntent',
          additionalData: {
            amount,
            currency,
            statusCode: response.status,
            url: `${STRIPE_FUNCTIONS_URL}/${FUNCTIONS.createValentinePaymentIntent}`,
          },
        });

        throw new Error(errorMsg);
      }

      const data = await response.json();

      // Extract payment intent ID from client secret
      const paymentIntentId = data.clientSecret.split("_secret_")[0];

      return {
        clientSecret: data.clientSecret,
        paymentIntentId,
      };
    } catch (error: any) {
      logger.error("Error creating Valentine payment intent:", error);

      // Log to Firestore with full context
      await logErrorToFirestore(error, {
        feature: 'ValentinePaymentIntent',
        additionalData: {
          amount,
          currency,
          metadata,
          errorType: error.name,
        },
      });

      throw new Error(error.message || "Failed to create payment intent");
    }
  },
};