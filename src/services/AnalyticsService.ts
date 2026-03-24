/**
 * AnalyticsService — Centralized event tracking with buffered Firestore writes
 *
 * - Buffers events in memory, flushes to Firestore `events` collection every 10 events or 30s
 * - Typed event names prevent typos
 * - Auto-attaches userId, sessionId, timestamp, userAgent
 * - Bridges to existing GA4 utility (web only)
 * - Fail-silent: analytics never crashes the app
 */

import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { trackPageView, trackEvent as trackGA4Event } from '../utils/analytics';
import { logger } from '../utils/logger';
import type { AnalyticsEvent, AnalyticsEventCategory, AnalyticsEventName } from '../types';

const BUFFER_SIZE = 10;
const FLUSH_INTERVAL_MS = 30_000;
const MAX_EVENTS_PER_MINUTE = 60; // Client-side rate limit

class AnalyticsService {
  private buffer: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private userId: string | null = null;
  private sessionId: string;
  private eventTimestamps: number[] = [];

  constructor() {
    this.sessionId = this.generateSessionId();
    this.startFlushTimer();
    this.listenAppState();
  }

  /** Set the current user for all subsequent events */
  setUserId(userId: string | null) {
    this.userId = userId;
  }

  /** Track a screen view */
  trackScreenView(screenName: string) {
    // GA4 bridge (web only)
    trackPageView(`/${screenName}`);

    this.enqueue({
      eventName: 'screen_view',
      category: 'navigation',
      screenName,
      properties: {},
    });
  }

  /** Track a generic typed event */
  trackEvent(
    eventName: AnalyticsEventName,
    category: AnalyticsEventCategory,
    properties: Record<string, unknown> = {},
    screenName?: string
  ) {
    // GA4 bridge
    trackGA4Event(category, eventName, screenName);

    this.enqueue({ eventName, category, properties, screenName });
  }

  /** Convenience: track a button click */
  trackButtonClick(buttonName: string, screenName: string, extra: Record<string, unknown> = {}) {
    this.trackEvent('button_click', 'engagement', { buttonName, ...extra }, screenName);
  }

  /** Flush any remaining events (call on app background / unmount) */
  async flush() {
    if (this.buffer.length === 0) return;
    // Skip flush if user is not authenticated — Firestore rules require auth
    if (!auth.currentUser) {
      this.buffer = []; // Discard events from unauthenticated sessions
      return;
    }

    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      if (eventsToFlush.length === 1) {
        await addDoc(collection(db, 'events'), eventsToFlush[0]);
      } else {
        const batch = writeBatch(db);
        for (const event of eventsToFlush) {
          const ref = doc(collection(db, 'events'));
          batch.set(ref, event);
        }
        await batch.commit();
      }
    } catch (error) {
      logger.error('AnalyticsService flush failed:', error);
      // Don't re-add to buffer to avoid infinite growth
    }
  }

  // --- Private ---

  private isEventRateLimited(): boolean {
    const now = Date.now();
    this.eventTimestamps = this.eventTimestamps.filter(t => now - t < 60_000);
    if (this.eventTimestamps.length >= MAX_EVENTS_PER_MINUTE) return true;
    this.eventTimestamps.push(now);
    return false;
  }

  private enqueue(partial: {
    eventName: AnalyticsEventName;
    category: AnalyticsEventCategory;
    properties?: Record<string, unknown>;
    screenName?: string;
  }) {
    try {
      if (this.isEventRateLimited()) return;
      // Strip undefined values from properties — Firestore rejects undefined
      const cleanProps: Record<string, unknown> = {};
      if (partial.properties) {
        for (const [k, v] of Object.entries(partial.properties)) {
          if (v !== undefined) cleanProps[k] = v;
        }
      }

      const event: AnalyticsEvent = {
        eventName: partial.eventName,
        category: partial.category,
        properties: cleanProps,
        ...(partial.screenName ? { screenName: partial.screenName } : {}),
        userId: this.userId || auth.currentUser?.uid || 'anonymous',
        sessionId: this.sessionId,
        timestamp: new Date(),
        userAgent: Platform.OS,
        environment: __DEV__ ? 'development' : 'production',
      };

      this.buffer.push(event);

      if (this.buffer.length >= BUFFER_SIZE) {
        this.flush();
      }
    } catch (error) {
      logger.error('AnalyticsService enqueue failed:', error);
    }
  }

  private startFlushTimer() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /** Flush buffered events when the app goes to background */
  private listenAppState() {
    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        this.flush();
      }
    });
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export const analyticsService = new AnalyticsService();
