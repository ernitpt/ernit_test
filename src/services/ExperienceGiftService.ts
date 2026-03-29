import { db } from './firebase';
import { doc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, startAfter, type DocumentSnapshot } from 'firebase/firestore';
import { ExperienceGift } from '../types';
import { toDateSafe } from '../utils/GoalHelpers';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { analyticsService } from './AnalyticsService';
import { AppError } from '../utils/AppError';
import { sanitizeText } from '../utils/sanitization';

export class ExperienceGiftService {

  private experiencesCollection = collection(db, 'experienceGifts');

  /**
   * @deprecated Gift creation must go through Cloud Functions.
   * Firestore rules block client-side creates (allow create: if false).
   */
  async createExperienceGift(experienceGift: ExperienceGift): Promise<ExperienceGift> {
    logger.warn('createExperienceGift is deprecated — gifts are created server-side via Cloud Functions');
    throw new Error('Gift creation must go through Cloud Functions');
  }

  async getExperienceGiftById(id: string): Promise<ExperienceGift | null> {
    if (!id) return null;

    try {
      // Try as a document ID first
      const docRef = doc(db, 'experienceGifts', id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() } as ExperienceGift;
      }

      // Fallback: try to find by field `id`
      const q = query(this.experiencesCollection, where('id', '==', id), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        logger.warn('ExperienceGift not found with either docId or field id:', id);
        return null;
      }

      const foundDoc = querySnapshot.docs[0];
      return { id: foundDoc.id, ...foundDoc.data() } as ExperienceGift;
    } catch (error: unknown) {
      logger.error('Failed to get experience gift:', error);
      return null;
    }
  }

  async getExperienceGiftsByUser(
    userId: string,
    pageLimit = 10,
    lastDoc?: DocumentSnapshot,
  ): Promise<{ gifts: ExperienceGift[]; lastDoc: DocumentSnapshot | undefined }> {
    try {
      const ref = collection(db, 'experienceGifts');
      let q = query(
        ref,
        where('giverId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(pageLimit),
      );
      if (lastDoc) {
        q = query(
          ref,
          where('giverId', '==', userId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageLimit),
        );
      }
      const snap = await getDocs(q);

      const gifts = snap.docs.map((doc) => {
        const data = doc.data() as ExperienceGift;
        return {
          ...data,
          id: doc.id,
          createdAt: toDateSafe(data.createdAt),
          deliveryDate: toDateSafe(data.deliveryDate),
        };
      });

      return {
        gifts,
        lastDoc: snap.docs[snap.docs.length - 1],
      };
    } catch (error: unknown) {
      logger.error('Error fetching gifts by user:', error);
      await logErrorToFirestore(error, {
        screenName: 'ExperienceGiftService',
        feature: 'GetGiftsByUser',
        additionalData: { userId }
      });
      return { gifts: [], lastDoc: undefined };
    }
  }

  /** Update personalized message for an experience gift */
  async updatePersonalizedMessage(giftId: string, personalizedMessage: string): Promise<void> {
    try {
      // Try as document ID first
      const docRef = doc(db, 'experienceGifts', giftId);
      const snapshot = await getDoc(docRef);

      const sanitizedMessage = sanitizeText(personalizedMessage, 500);

      if (snapshot.exists()) {
        await updateDoc(docRef, {
          personalizedMessage: sanitizedMessage,
          updatedAt: serverTimestamp(),
        });
        analyticsService.trackEvent('gift_message_updated', 'engagement', { giftId });
        return;
      }

      // Fallback: find by field 'id'
      const q = query(this.experiencesCollection, where('id', '==', giftId), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new AppError('GIFT_NOT_FOUND', 'Experience gift not found', 'not_found');
      }

      const foundDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, 'experienceGifts', foundDoc.id), {
        personalizedMessage: sanitizedMessage,
        updatedAt: serverTimestamp(),
      });
      analyticsService.trackEvent('gift_message_updated', 'engagement', { giftId });
    } catch (error: unknown) {
      logger.error('Error updating personalized message:', error);
      await logErrorToFirestore(error, {
        screenName: 'ExperienceGiftService',
        feature: 'UpdatePersonalizedMessage',
        additionalData: { giftId }
      });
      throw error;
    }
  }
}

export const experienceGiftService = new ExperienceGiftService();
