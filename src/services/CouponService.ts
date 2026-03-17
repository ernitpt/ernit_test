import { db } from './firebase';
import {
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { logger } from '../utils/logger';

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
      if (!goalDoc.exists()) throw new Error('Goal not found');

      const goalData = goalDoc.data();

      // Check if coupon already exists (atomic check)
      if (goalData.couponCode) {
        // Validate that the existing coupon has not expired before returning it
        if (goalData.couponGeneratedAt) {
          const validUntilCheck = goalData.validUntil
            ? (goalData.validUntil.toDate ? goalData.validUntil.toDate() : new Date(goalData.validUntil))
            : null;
          if (validUntilCheck && new Date() > new Date(validUntilCheck)) {
            throw new Error('This coupon has expired');
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

      // Check for code collision
      const existingCouponDoc = await transaction.get(partnerCouponRef);
      if (existingCouponDoc.exists()) {
        throw new Error('CODE_COLLISION');
      }

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
    if (error instanceof Error && error.message === 'CODE_COLLISION') {
      if (retryCount >= 5) {
        throw new Error('Failed to generate unique coupon code after 5 attempts');
      }
      logger.log(`Retrying coupon generation due to collision (attempt ${retryCount + 1}/5)...`);
      return generateCouponForGoal(goalId, userId, partnerId, retryCount + 1);
    }
    throw error;
  }
}
