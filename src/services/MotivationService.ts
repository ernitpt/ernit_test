import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  getCountFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Motivation } from '../types';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { notificationService } from './NotificationService';
import { toDateSafe } from '../utils/GoalHelpers';
import { AppError } from '../utils/AppError';

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
    media?: {
      type?: 'text' | 'audio' | 'image' | 'mixed';
      imageUrl?: string;
      audioUrl?: string;
      audioDuration?: number;
    },
  ): Promise<string> {
    // Fetch the goal to validate and get owner info
    const goalRef = doc(db, 'goals', goalId);
    const goalSnap = await getDoc(goalRef);
    if (!goalSnap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    const goalData = goalSnap.data();

    // Cannot motivate your own goal
    if (goalData.userId === authorId) {
      throw new AppError('SELF_MOTIVATION', 'Cannot motivate your own goal', 'business');
    }

    // Cannot motivate a completed goal
    if (goalData.isCompleted) {
      throw new AppError('GOAL_COMPLETED', 'This goal has already been completed', 'business');
    }

    // Calculate effective target session
    const currentSessionsDone =
      (goalData.currentCount || 0) * (goalData.sessionsPerWeek || 1) +
      (goalData.weeklyCount || 0);
    const nextSession = currentSessionsDone + 1;
    const effectiveTargetSession = targetSession || nextSession;

    // Only allow motivation for the next upcoming session
    if (effectiveTargetSession !== nextSession) {
      throw new AppError('INVALID_SESSION', 'Can only send motivation for the next upcoming session', 'business');
    }

    // Duplicate check: 1 motivation per sender per target session
    const motivationsRef = this.getMotivationsCollection(goalId);
    const duplicateQuery = query(
      motivationsRef,
      where('authorId', '==', authorId),
      where('targetSession', '==', effectiveTargetSession),
    );
    const duplicateSnap = await getDocs(duplicateQuery);
    if (!duplicateSnap.empty) {
      throw new AppError('DUPLICATE_MOTIVATION', 'You have already sent a motivation for this session', 'business');
    }

    // Save the motivation
    try {
      const motivationData: Record<string, any> = {
        authorId,
        authorName,
        authorProfileImage: authorProfileImage || null,
        message: message.substring(0, 500),
        type: media?.type || 'text',
        targetSession: effectiveTargetSession,
        createdAt: serverTimestamp(),
        seen: false,
      };
      if (media?.imageUrl) motivationData.imageUrl = media.imageUrl;
      if (media?.audioUrl) motivationData.audioUrl = media.audioUrl;
      if (media?.audioDuration) motivationData.audioDuration = media.audioDuration;

      const docRef = await addDoc(motivationsRef, motivationData);
      logger.log('Motivation left for goal:', goalId);

      // Notify the goal owner
      try {
        await notificationService.createNotification(
          goalData.userId,
          'motivation_received',
          `${authorName} sent you motivation!`,
          `You have a special message waiting! Complete your next session to see it.`,
          {
            goalId,
            senderId: authorId,
            senderName: authorName,
            senderProfileImageUrl: authorProfileImage || null,
          },
          true,
        );
      } catch (notifError) {
        logger.error('Error creating motivation notification:', notifError);
      }

      return docRef.id;
    } catch (error) {
      // Re-throw validation errors as-is
      if (error instanceof Error && (
        error.message.includes('already sent') ||
        error.message.includes('next upcoming session') ||
        error.message.includes('already been completed') ||
        error.message.includes('Cannot motivate')
      )) {
        throw error;
      }
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
            createdAt: toDateSafe(data.createdAt),
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

  /** Get ALL motivations for a goal (for journey display, regardless of seen status) */
  async getAllMotivations(goalId: string): Promise<Motivation[]> {
    try {
      const motivationsRef = this.getMotivationsCollection(goalId);
      const q = query(motivationsRef, orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      const motivations: Motivation[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        motivations.push({
          id: docSnap.id,
          authorId: data.authorId,
          authorName: data.authorName,
          authorProfileImage: data.authorProfileImage,
          message: data.message,
          targetSession: data.targetSession,
          createdAt: toDateSafe(data.createdAt),
          seen: data.seen,
        });
      });

      return motivations;
    } catch (error) {
      logger.error('Error fetching all motivations:', error);
      return [];
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

  /** Check if a user has already sent a motivation for a specific session */
  async hasUserSentMotivation(goalId: string, authorId: string, targetSession: number): Promise<boolean> {
    try {
      const motivationsRef = this.getMotivationsCollection(goalId);
      const q = query(
        motivationsRef,
        where('authorId', '==', authorId),
        where('targetSession', '==', targetSession),
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch {
      return false;
    }
  }
}

export const motivationService = new MotivationService();
