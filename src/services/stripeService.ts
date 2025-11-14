// services/stripeService.ts

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
      const response = await fetch(`${STRIPE_FUNCTIONS_URL}/stripeCreatePaymentIntent_Test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
   * Update payment intent metadata (for personalized message)
   */
  updatePaymentIntentMetadata: async (
    paymentIntentId: string,
    personalizedMessage: string
  ): Promise<void> => {
    try {
      const response = await fetch(`${STRIPE_FUNCTIONS_URL}/updatePaymentIntentMetadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentIntentId,
          personalizedMessage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update payment intent");
      }
    } catch (error: any) {
      console.error("Error updating payment intent:", error);
      // Don't throw - this is not critical for payment flow
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