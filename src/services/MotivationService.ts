import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  getCountFromServer,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Motivation } from '../types';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { notificationService } from './NotificationService';
import { toDateSafe } from '../utils/GoalHelpers';
import { AppError } from '../utils/AppError';
import { sanitizeText } from '../utils/sanitization';

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

    const goalOwnerId: string = goalData.userId;

    // Cannot motivate your own goal
    if (goalOwnerId === authorId) {
      throw new AppError('SELF_MOTIVATION', 'Cannot motivate your own goal', 'business');
    }

    // Cannot motivate a completed goal
    if (goalData.isCompleted) {
      throw new AppError('GOAL_COMPLETED', 'This goal has already been completed', 'business');
    }

    // Calculate effective target session
    // safeSessionsPerWeek guards against 0, null, and undefined to prevent NaN/Infinity propagation
    const safeSessionsPerWeek = Math.max(1, goalData.sessionsPerWeek || 1);
    const currentSessionsDone =
      (goalData.currentCount || 0) * safeSessionsPerWeek +
      (goalData.weeklyCount || 0);
    const nextSession = currentSessionsDone + 1;
    const effectiveTargetSession = targetSession || nextSession;

    // Only allow motivation for the next upcoming session
    if (effectiveTargetSession !== nextSession) {
      throw new AppError('INVALID_SESSION', 'Can only send motivation for the next upcoming session', 'business');
    }

    // Check friendship immediately before the transaction to minimise the race window.
    // Friend docs use auto-generated IDs (non-deterministic), so a query is required here —
    // Firestore transactions only support get-by-ref, not queries. The window between this
    // check and the transaction.set is small; Firestore rules enforce the same constraint.
    const friendsQuery = query(
      collection(db, 'friends'),
      where('userId', '==', authorId),
      where('friendId', '==', goalOwnerId),
    );
    const friendSnap = await getDocs(friendsQuery);
    if (friendSnap.empty) {
      throw new AppError('PERMISSION_DENIED', 'You must be friends to leave a motivation', 'auth');
    }

    // Transactional duplicate check + write using a deterministic doc ID
    // so transaction.get() can be used instead of a query (queries don't participate in transactions)
    const motivationId = `${authorId}_${goalId}_${effectiveTargetSession}`;
    const motivationsRef = this.getMotivationsCollection(goalId);
    const motivationRef = doc(motivationsRef, motivationId);

    // Save the motivation
    try {
      const sanitizedAuthorName = sanitizeText(authorName, 100);
      const sanitizedMessage = sanitizeText(message, 500);
      const motivationData: Record<string, unknown> = {
        authorId,
        authorName: sanitizedAuthorName,
        authorProfileImage: authorProfileImage || null,
        message: sanitizedMessage,
        type: media?.type || 'text',
        targetSession: effectiveTargetSession,
        createdAt: serverTimestamp(),
        seen: false,
      };
      if (media?.imageUrl) motivationData.imageUrl = media.imageUrl;
      if (media?.audioUrl) motivationData.audioUrl = media.audioUrl;
      if (media?.audioDuration) motivationData.audioDuration = media.audioDuration;

      await runTransaction(db, async (transaction) => {
        // Use transaction.get() on the deterministic ref — participates in the transaction's read set
        const existing = await transaction.get(motivationRef);
        if (existing.exists()) {
          throw new AppError('DUPLICATE_MOTIVATION', 'You already left a motivation for this session', 'business');
        }
        transaction.set(motivationRef, motivationData);
      });

      const docRef = motivationRef;
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
      } catch (notifError: unknown) {
        logger.error('Error creating motivation notification:', notifError);
      }

      return docRef.id;
    } catch (error: unknown) {
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
            type: data.type,
            imageUrl: data.imageUrl,
            audioUrl: data.audioUrl,
            audioDuration: data.audioDuration,
          });
        }
      });

      return motivations;
    } catch (error: unknown) {
      logger.error('Error fetching motivations:', error);
      return [];
    }
  }

  /** Mark a motivation as seen */
  async markMotivationSeen(goalId: string, motivationId: string): Promise<void> {
    try {
      const motivationRef = doc(db, 'goals', goalId, 'motivations', motivationId);
      await updateDoc(motivationRef, { seen: true });
    } catch (error: unknown) {
      logger.error('Error marking motivation as seen:', error);
    }
  }

  /** Get total count of motivations for a goal */
  async getMotivationCount(goalId: string): Promise<number> {
    try {
      const motivationsRef = this.getMotivationsCollection(goalId);
      const snapshot = await getCountFromServer(motivationsRef);
      return snapshot.data().count;
    } catch (error: unknown) {
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
          type: data.type,
          imageUrl: data.imageUrl,
          audioUrl: data.audioUrl,
          audioDuration: data.audioDuration,
        });
      });

      return motivations;
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
