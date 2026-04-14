// Google Analytics 4 — Web Only
// Modern GA4 integration with recommended event names and rich parameters
import { Platform } from 'react-native';
import ReactGA from 'react-ga4';
import { logger } from './logger';
import type { AnalyticsEventName, AnalyticsEventCategory } from '../types';

const GA_MEASUREMENT_ID = process.env.EXPO_PUBLIC_GA4_MEASUREMENT_ID || '';

// ─── GA4 Recommended Event Mapping ───────────────────────────────────────────
// Maps our custom event names to GA4 recommended events where applicable.
// GA4 natively understands these and builds automatic reports (monetization,
// engagement, retention) when they're used.
const GA4_EVENT_MAP: Partial<Record<AnalyticsEventName, string>> = {
  // Auth → GA4 recommended
  signup_completed: 'sign_up',
  login_completed: 'login',

  // E-commerce → GA4 recommended
  checkout_started: 'begin_checkout',
  payment_completed: 'purchase',
  add_to_cart: 'add_to_cart',
  experience_viewed: 'view_item',
  category_browsed: 'view_item_list',

  // Engagement → GA4 recommended
  share_goal_completed: 'share',
  friend_request_sent: 'invite',
};

// ─── Parameter Transformation ────────────────────────────────────────────────
// Converts our property names to GA4 standard parameter names where applicable.
function transformParams(
  eventName: AnalyticsEventName,
  properties: Record<string, unknown>
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...properties };

  // Map common property names to GA4 standard parameters
  if (params.amount !== undefined) {
    params.value = params.amount;
    params.currency = params.currency || 'EUR';
    delete params.amount;
  }

  // E-commerce events: structure items array for GA4
  if (
    (eventName === 'add_to_cart' ||
      eventName === 'checkout_started' ||
      eventName === 'payment_completed' ||
      eventName === 'experience_viewed') &&
    params.experienceId
  ) {
    params.items = [
      {
        item_id: params.experienceId,
        item_name: params.experienceTitle || params.experienceId,
        item_category: params.experienceCategory || undefined,
        price: params.experiencePrice || params.value || undefined,
        quantity: params.quantity || 1,
      },
    ];
  }

  // Auth events: map method
  if (eventName === 'signup_completed' || eventName === 'login_completed') {
    params.method = params.provider || params.method || 'email';
  }

  return params;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize Google Analytics 4 (Web Only)
 * Call once when the app starts.
 */
export const initializeAnalytics = () => {
  if (Platform.OS === 'web' && GA_MEASUREMENT_ID) {
    try {
      ReactGA.initialize(GA_MEASUREMENT_ID, {
        gaOptions: {
          anonymizeIp: true,
        },
      });
      logger.log('GA4 initialized');
    } catch (error: unknown) {
      logger.error('Failed to initialize GA4:', error);
    }
  }
};

/**
 * Track page/screen views
 */
export const trackPageView = (path: string) => {
  if (Platform.OS === 'web' && GA_MEASUREMENT_ID) {
    ReactGA.send({ hitType: 'pageview', page: path });
  }
};

/**
 * Track events with full GA4 parameter support.
 * Automatically maps to GA4 recommended event names and transforms parameters.
 */
export const trackGA4Event = (
  eventName: AnalyticsEventName,
  category: AnalyticsEventCategory,
  properties: Record<string, unknown> = {},
  screenName?: string
) => {
  if (Platform.OS !== 'web' || !GA_MEASUREMENT_ID) return;

  try {
    const ga4EventName = GA4_EVENT_MAP[eventName] || eventName;
    const params = transformParams(eventName, {
      ...properties,
      event_category: category,
      ...(screenName ? { screen_name: screenName } : {}),
    });

    ReactGA.event(ga4EventName, params);
  } catch (error: unknown) {
    logger.error('GA4 trackEvent failed:', error);
  }
};

/**
 * Set GA4 user ID for cross-session attribution.
 */
export const setGA4UserId = (userId: string | null) => {
  if (Platform.OS !== 'web' || !GA_MEASUREMENT_ID) return;

  try {
    if (userId) {
      ReactGA.set({ userId });
    }
  } catch (error: unknown) {
    logger.error('GA4 setUserId failed:', error);
  }
};

/**
 * Set GA4 user properties for audience segmentation.
 */
export const setGA4UserProperties = (properties: Record<string, string | number | boolean>) => {
  if (Platform.OS !== 'web' || !GA_MEASUREMENT_ID) return;

  try {
    ReactGA.gtag('set', 'user_properties', properties);
  } catch (error: unknown) {
    logger.error('GA4 setUserProperties failed:', error);
  }
};

/**
 * Track errors in GA4
 */
export const trackError = (description: string, fatal: boolean = false) => {
  if (Platform.OS !== 'web' || !GA_MEASUREMENT_ID) return;

  try {
    ReactGA.event('exception', {
      description,
      fatal,
    });
  } catch (error: unknown) {
    logger.error('GA4 trackError failed:', error);
  }
};
