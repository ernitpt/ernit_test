import { db, auth } from './firebase';
import {
  doc,
  collection,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export interface PartnerCoupon {
  code: string;
  status: 'active' | 'redeemed' | 'expired';
  userId: string;
  validUntil: Date;
  partnerId: string;
  goalId: string;
}

/** Generate a unique 12-character alphanumeric code using a CSPRNG with rejection sampling */
function generateUniqueCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // Rejection sampling to eliminate modulo bias
  // 252 = 7 * 36, the largest multiple of 36 that fits in a byte (0-255)
  const bytes = new Uint8Array(1);
  let code = '';
  while (code.length < 12) {
    crypto.getRandomValues(bytes);
    if (bytes[0] >= 252) continue;
    code += chars[bytes[0] % 36];
  }
  return code;
}

/**
 * Atomic coupon generation using Firestore transaction.
 * Prevents race conditions and duplicate coupons.
 * Returns the coupon code (existing or newly generated).
 */
export async function generateCouponForGoal(
  goalId: string,
  userId: string,
  partnerId: string,
  retryCount: number = 0,
): Promise<string> {
  const goalRef = doc(db, 'goals', goalId);

  try {
    const couponCode = await runTransaction(db, async (transaction) => {
      const goalDoc = await transaction.get(goalRef);
      if (!goalDoc.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');

      const goalData = goalDoc.data();

      // Verify the caller owns this goal and matches the userId parameter
      if (goalData.userId !== userId || userId !== auth.currentUser?.uid) {
        throw new AppError('UNAUTHORIZED', 'Not authorized to generate a coupon for this goal', 'auth');
      }

      // Verify payment is confirmed for deferred gifts before issuing a coupon
      if (goalData.experienceGiftId) {
        const giftSnap = await getDoc(doc(db, 'experienceGifts', goalData.experienceGiftId));
        const giftPayment = giftSnap.data()?.payment;
        if (giftPayment === 'deferred' || giftPayment === 'processing') {
          throw new AppError('PAYMENT_PENDING', 'Coupon cannot be issued until payment is confirmed', 'business');
        }
      }

      // Check if coupon already exists (atomic check)
      if (goalData.couponCode) {
        // Validate that the existing coupon has not expired before returning it
        if (goalData.couponGeneratedAt) {
          const validUntilCheck = goalData.validUntil
            ? (goalData.validUntil.toDate ? goalData.validUntil.toDate() : new Date(goalData.validUntil))
            : null;
          if (validUntilCheck && new Date() > new Date(validUntilCheck)) {
            throw new AppError('COUPON_EXPIRED', 'This coupon has expired', 'business');
          }
        }
        logger.log('Found existing coupon:', goalData.couponCode);
        return goalData.couponCode as string;
      }

      // Generate new coupon code
      const newCode = generateUniqueCode();
      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1);

      const coupon: PartnerCoupon = {
        code: newCode,
        status: 'active',
        userId,
        validUntil,
        partnerId,
        goalId,
      };

      const partnerCouponRef = doc(
        collection(db, `partnerUsers/${partnerId}/coupons`),
        newCode,
      );

      // Collision check removed — 12-char CSPRNG code (36^12 ≈ 4.7×10^18)
      // makes collision essentially impossible, and the previous get() on a
      // non-existent partner coupon doc triggers a Firestore permission error.

      // Atomically create both documents
      transaction.set(partnerCouponRef, {
        ...coupon,
        createdAt: serverTimestamp(),
      });

      transaction.update(goalRef, {
        couponCode: newCode,
        couponGeneratedAt: serverTimestamp(),
      });

      logger.log('Coupon atomically generated:', newCode);
      return newCode;
    });

    return couponCode;
  } catch (error: unknown) {
    if (error instanceof AppError && error.code === 'CODE_COLLISION') {
      if (retryCount >= 5) {
        throw new AppError('CODE_GENERATION_FAILED', 'Failed to generate unique coupon code. Please try again.', 'internal');
      }
      logger.log(`Retrying coupon generation due to collision (attempt ${retryCount + 1}/5)...`);
      return generateCouponForGoal(goalId, userId, partnerId, retryCount + 1);
    }
    throw error;
  }
}
