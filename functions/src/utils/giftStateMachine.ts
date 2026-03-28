/**
 * Gift status state machine.
 * Defines valid transitions to prevent data corruption from arbitrary status changes.
 *
 * Normal lifecycle: pending → active → claimed → completed
 * Error recovery:   claimed → pending (intentional, for failed goal creation)
 * Expiry:           pending → expired, active → expired
 * Cancellation:     pending → cancelled, active → cancelled, claimed → cancelled
 * Free gifts:       pending → active (skip payment step)
 *
 * Files that currently update gift status and should adopt validateGiftTransition:
 *   - src/triggers/chargeDeferredGift.ts  (status: 'completed', 'expired')
 *   - src/deleteGoal.ts                   (status: 'cancelled', 'active')
 *   - src/stripeWebhook.ts                (status: 'pending' via gift creation)
 *   - src/createFreeGift.ts               (status: 'pending' on creation)
 *   - src/createDeferredGift.ts           (status: 'pending' on creation)
 */

export type GiftStatus = 'pending' | 'active' | 'claimed' | 'completed' | 'expired' | 'cancelled';

const VALID_TRANSITIONS: Record<GiftStatus, GiftStatus[]> = {
    pending:   ['active', 'expired', 'cancelled'],
    active:    ['claimed', 'expired', 'cancelled'],
    claimed:   ['completed', 'pending', 'cancelled'], // pending = error recovery revert
    completed: [],                                     // terminal state
    expired:   [],                                     // terminal state
    cancelled: [],                                     // terminal state
};

export class InvalidGiftTransitionError extends Error {
    constructor(from: GiftStatus, to: GiftStatus) {
        super(`Invalid gift status transition: ${from} → ${to}`);
        this.name = 'InvalidGiftTransitionError';
    }
}

/**
 * Validates a gift status transition.
 * Throws InvalidGiftTransitionError if the transition is not allowed.
 */
export function validateGiftTransition(from: GiftStatus, to: GiftStatus): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed) {
        throw new InvalidGiftTransitionError(from, to);
    }
    if (!allowed.includes(to)) {
        throw new InvalidGiftTransitionError(from, to);
    }
}

/**
 * Returns true if the transition is valid, false otherwise.
 * Use this for non-throwing validation.
 */
export function isValidGiftTransition(from: GiftStatus, to: GiftStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
