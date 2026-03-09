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

/** Generate a unique 12-character alphanumeric code */
function generateUniqueCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
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
): Promise<string> {
  const goalRef = doc(db, 'goals', goalId);

  try {
    const couponCode = await runTransaction(db, async (transaction) => {
      const goalDoc = await transaction.get(goalRef);
      if (!goalDoc.exists()) throw new Error('Goal not found');

      const goalData = goalDoc.data();

      // Check if coupon already exists (atomic check)
      if (goalData.couponCode) {
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
  } catch (error: any) {
    if (error.message === 'CODE_COLLISION') {
      logger.log('Retrying coupon generation due to collision...');
      return generateCouponForGoal(goalId, userId, partnerId);
    }
    throw error;
  }
}
