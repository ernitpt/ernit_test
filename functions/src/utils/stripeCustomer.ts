import Stripe from "stripe";
import { Firestore } from "firebase-admin/firestore";

/**
 * Retrieves the existing Stripe Customer ID for a user, or creates a new
 * Stripe Customer and persists the ID on the user document for reuse.
 */
export async function getOrCreateStripeCustomer(
    stripe: Stripe,
    db: Firestore,
    userId: string,
    opts?: { email?: string; name?: string }
): Promise<string> {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    // Return existing customer if already linked
    if (userData?.stripeCustomerId) {
        return userData.stripeCustomerId;
    }

    // Create a new Stripe Customer
    const customer = await stripe.customers.create({
        email: opts?.email || userData?.email || undefined,
        name: opts?.name || userData?.displayName || userData?.name || undefined,
        metadata: { firebaseUid: userId },
    });

    // Persist for future lookups (merge in case doc doesn't exist yet)
    await userRef.set({ stripeCustomerId: customer.id }, { merge: true });

    return customer.id;
}
