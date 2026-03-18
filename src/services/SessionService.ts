import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    doc,
    updateDoc,
    Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { SessionRecord } from '../types';
import { logger } from '../utils/logger';
import { analyticsService } from './AnalyticsService';
import { toDateSafe } from '../utils/GoalHelpers';

class SessionService {
    /**
     * Create a session record under goals/{goalId}/sessions
     */
    async createSessionRecord(
        goalId: string,
        sessionData: Omit<SessionRecord, 'id' | 'createdAt'>
    ): Promise<SessionRecord> {
        try {
            const sessionsRef = collection(db, 'goals', goalId, 'sessions');
            const docData: Record<string, unknown> = {
                goalId: sessionData.goalId,
                userId: sessionData.userId,
                timestamp: Timestamp.fromDate(sessionData.timestamp),
                duration: sessionData.duration,
                sessionNumber: sessionData.sessionNumber,
                weekNumber: sessionData.weekNumber,
                createdAt: Timestamp.now(),
            };

            if (sessionData.mediaUrl) docData.mediaUrl = sessionData.mediaUrl;
            if (sessionData.mediaType) docData.mediaType = sessionData.mediaType;
            if (sessionData.thumbnailUrl) docData.thumbnailUrl = sessionData.thumbnailUrl;
            if (sessionData.notes) docData.notes = sessionData.notes;

            const docRef = await addDoc(sessionsRef, docData);
            analyticsService.trackEvent('session_logged', 'engagement', { goalId, sessionId: docRef.id, sessionNumber: sessionData.sessionNumber, weekNumber: sessionData.weekNumber, duration: sessionData.duration, hasMedia: !!sessionData.mediaUrl });
            logger.log('Session record created:', docRef.id);

            return {
                id: docRef.id,
                ...sessionData,
                createdAt: new Date(),
            };
        } catch (error) {
            logger.error('Error creating session record:', error);
            throw error;
        }
    }

    /**
     * Get all sessions for a goal (ordered by timestamp descending)
     */
    async getSessionsForGoal(goalId: string): Promise<SessionRecord[]> {
        try {
            const sessionsRef = collection(db, 'goals', goalId, 'sessions');
            const q = query(sessionsRef, orderBy('timestamp', 'desc'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    goalId: data.goalId,
                    userId: data.userId,
                    timestamp: toDateSafe(data.timestamp),
                    duration: data.duration || 0,
                    sessionNumber: data.sessionNumber || 0,
                    weekNumber: data.weekNumber || 0,
                    mediaUrl: data.mediaUrl,
                    mediaType: data.mediaType,
                    thumbnailUrl: data.thumbnailUrl,
                    notes: data.notes,
                    createdAt: toDateSafe(data.createdAt),
                } as SessionRecord;
            });
        } catch (error) {
            logger.error('Error fetching sessions for goal:', error);
            return [];
        }
    }

    /**
     * Update a session (e.g., to add media after completion)
     */
    async updateSession(
        goalId: string,
        sessionId: string,
        updates: Partial<Pick<SessionRecord, 'mediaUrl' | 'mediaType' | 'thumbnailUrl' | 'notes'>>
    ): Promise<void> {
        try {
            const sessionRef = doc(db, 'goals', goalId, 'sessions', sessionId);
            await updateDoc(sessionRef, updates);
            logger.log('Session updated:', sessionId);
        } catch (error) {
            logger.error('Error updating session:', error);
            throw error;
        }
    }
}

export const sessionService = new SessionService();
