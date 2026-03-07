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
import { db } from './firebase';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { trackPageView, trackEvent as trackGA4Event } from '../utils/analytics';
import { logger } from '../utils/logger';
import type { AnalyticsEvent, AnalyticsEventCategory, AnalyticsEventName } from '../types';

const BUFFER_SIZE = 10;
const FLUSH_INTERVAL_MS = 30_000;

class AnalyticsService {
  private buffer: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private userId: string | null = null;
  private sessionId: string;

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

  private enqueue(partial: {
    eventName: AnalyticsEventName;
    category: AnalyticsEventCategory;
    properties?: Record<string, unknown>;
    screenName?: string;
  }) {
    try {
      const event: AnalyticsEvent = {
        eventName: partial.eventName,
        category: partial.category,
        properties: partial.properties || {},
        screenName: partial.screenName || null,
        userId: this.userId,
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
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
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
