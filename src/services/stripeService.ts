// services/stripeService.ts

import { auth } from './firebase';

const STRIPE_FUNCTIONS_URL = "https://europe-west1-ernit-3fc0b.cloudfunctions.net";

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

      const response = await fetch(`${STRIPE_FUNCTIONS_URL}/stripeCreatePaymentIntent_Test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amount,
          // experienceId,
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
      console.error("Error creating payment intent:", error);
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

      const response = await fetch(`${STRIPE_FUNCTIONS_URL}/updatePaymentIntentMetadata_Test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`, // ✅ Add auth token
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
      console.error("Error updating payment intent:", error);
      // Don't throw - this is not critical for payment flow
      // But log the error for monitoring
      if (error.message === "User not authenticated") {
        console.warn("⚠️ User not authenticated when trying to update payment metadata");
      }
    }
  },

  /**
   * Check if a gift was created for a payment intent
   */
  getGiftByPaymentIntent: async (paymentIntentId: string): Promise<any | null> => {
    try {
      const response = await fetch(
        `${STRIPE_FUNCTIONS_URL}/getGiftByPaymentIntent?paymentIntentId=${paymentIntentId}`
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
      console.error("Error fetching gift:", error);
      return null;
    }
  },
};