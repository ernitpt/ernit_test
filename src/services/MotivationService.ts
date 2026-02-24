import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  getCountFromServer,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Motivation } from '../types';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';

class MotivationService {
  private getMotivationsCollection(goalId: string) {
    return collection(db, 'goals', goalId, 'motivations');
  }

  /** Friend leaves a motivational message for the goal owner */
  async leaveMotivation(
    goalId: string,
    authorId: string,
    authorName: string,
    message: string,
    authorProfileImage?: string,
    targetSession?: number,
  ): Promise<string> {
    try {
      const motivationData = {
        authorId,
        authorName,
        authorProfileImage: authorProfileImage || null,
        message: message.substring(0, 500), // Max 500 chars
        targetSession: targetSession || null,
        createdAt: serverTimestamp(),
        seen: false,
      };

      const docRef = await addDoc(this.getMotivationsCollection(goalId), motivationData);
      logger.log('✅ Motivation left for goal:', goalId);
      return docRef.id;
    } catch (error) {
      await logErrorToFirestore(error, {
        feature: 'LeaveMotivation',
        additionalData: { goalId, authorId },
      });
      throw error;
    }
  }

  /** Get unseen motivations for the current session */
  async getMotivationsForSession(goalId: string, sessionNumber: number): Promise<Motivation[]> {
    try {
      const motivationsRef = this.getMotivationsCollection(goalId);

      // Get motivations that are either untargeted or targeted at this session (or earlier unseen)
      const q = query(
        motivationsRef,
        where('seen', '==', false),
        orderBy('createdAt', 'asc'),
      );

      const snapshot = await getDocs(q);
      const motivations: Motivation[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Include if no target session, or target session <= current session
        if (!data.targetSession || data.targetSession <= sessionNumber) {
          motivations.push({
            id: docSnap.id,
            authorId: data.authorId,
            authorName: data.authorName,
            authorProfileImage: data.authorProfileImage,
            message: data.message,
            targetSession: data.targetSession,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : new Date(data.createdAt),
            seen: data.seen,
          });
        }
      });

      return motivations;
    } catch (error) {
      logger.error('Error fetching motivations:', error);
      return [];
    }
  }

  /** Mark a motivation as seen */
  async markMotivationSeen(goalId: string, motivationId: string): Promise<void> {
    try {
      const motivationRef = doc(db, 'goals', goalId, 'motivations', motivationId);
      await updateDoc(motivationRef, { seen: true });
    } catch (error) {
      logger.error('Error marking motivation as seen:', error);
    }
  }

  /** Get total count of motivations for a goal */
  async getMotivationCount(goalId: string): Promise<number> {
    try {
      const motivationsRef = this.getMotivationsCollection(goalId);
      const snapshot = await getCountFromServer(motivationsRef);
      return snapshot.data().count;
    } catch (error) {
      logger.error('Error getting motivation count:', error);
      return 0;
    }
  }

  /** Get count of unseen motivations */
  async getUnseenMotivationCount(goalId: string): Promise<number> {
    try {
      const motivationsRef = this.getMotivationsCollection(goalId);
      const q = query(motivationsRef, where('seen', '==', false));
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      logger.error('Error getting unseen motivation count:', error);
      return 0;
    }
  }
}

export const motivationService = new MotivationService();
