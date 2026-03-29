import Stripe from "stripe";
import { Firestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// Sentinel value written during the "claim" phase of the race-free pattern.
// Any concurrent reader that sees this value knows creation is in-flight and
// should not attempt to create a second customer.
const CREATING_SENTINEL = 'creating';

/**
 * Retrieves the existing Stripe Customer ID for a user, or creates a new
 * Stripe Customer and persists the ID on the user document for reuse.
 *
 * Uses a "claim-then-create" pattern to prevent TOCTOU race conditions that
 * would otherwise cause duplicate Stripe Customers when two concurrent calls
 * both find no existing ID and both call stripe.customers.create():
 *
 *  1. Run a Firestore transaction that atomically checks for an existing
 *     stripeCustomerId.  If one already exists (or is being created by another
 *     concurrent call), return it immediately without touching Stripe.
 *     Otherwise write the sentinel 'creating' to claim the slot.
 *  2. Only the winner of that transaction calls stripe.customers.create().
 *  3. The real customer ID is written back with set+merge, replacing the
 *     sentinel.  Any subsequent call will find the real ID.
 */
export async function getOrCreateStripeCustomer(
    stripe: Stripe,
    db: Firestore,
    userId: string,
    opts?: { email?: string; name?: string }
): Promise<string> {
    const userRef = db.collection("users").doc(userId);

    // --- Phase 1: atomic claim ---
    // Read snapshot outside the transaction first so we can pass email/name
    // to stripe.customers.create() without a second Firestore read.
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    // Fast-path: already has a real customer ID (not sentinel).
    if (userData?.stripeCustomerId && userData.stripeCustomerId !== CREATING_SENTINEL) {
        return userData.stripeCustomerId as string;
    }

    // Attempt to atomically claim the slot by writing the sentinel.
    let wonRace = false;
    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(userRef);
        const existing = snap.data()?.stripeCustomerId as string | undefined;

        if (existing && existing !== CREATING_SENTINEL) {
            // Another concurrent call already finished — use their customer ID.
            wonRace = false;
            return;
        }

        if (existing === CREATING_SENTINEL) {
            // Another concurrent call is mid-flight — let it finish.
            wonRace = false;
            return;
        }

        // No ID present: claim the slot.
        transaction.set(userRef, { stripeCustomerId: CREATING_SENTINEL }, { merge: true });
        wonRace = true;
    });

    if (!wonRace) {
        // We lost the race.  Poll briefly for the real ID (the winner will
        // replace the sentinel within milliseconds).
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            const snap = await userRef.get();
            const id = snap.data()?.stripeCustomerId as string | undefined;
            if (id && id !== CREATING_SENTINEL) {
                return id;
            }
        }
        // Fallback: read one final time and return whatever is there.
        const snap = await userRef.get();
        const id = snap.data()?.stripeCustomerId as string | undefined;
        if (id && id !== CREATING_SENTINEL) {
            return id;
        }
        throw new Error(`Timed out waiting for Stripe customer creation for userId=${userId}`);
    }

    // --- Phase 2: create the Stripe customer (only the race winner reaches here) ---
    try {
        const customer = await stripe.customers.create({
            email: opts?.email || userData?.email || undefined,
            name: opts?.name || userData?.displayName || userData?.name || undefined,
            metadata: { firebaseUid: userId },
        });

        // Replace the sentinel with the real customer ID.
        await userRef.set({ stripeCustomerId: customer.id }, { merge: true });

        return customer.id;
    } catch (err) {
        // Clear the sentinel so future calls can retry rather than spinning forever.
        // Use a transaction to only remove the sentinel if it hasn't already been
        // replaced by a real customer ID (e.g. written by another concurrent process).
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(userRef);
                if (snap.data()?.stripeCustomerId === CREATING_SENTINEL) {
                    tx.update(userRef, { stripeCustomerId: FieldValue.delete() });
                }
                // If it's already a real ID (written by another process), leave it alone.
            });
        } catch (cleanupErr) {
            logger.error('Failed to clear Stripe customer sentinel:', cleanupErr);
        }
        throw err;
    }
}
