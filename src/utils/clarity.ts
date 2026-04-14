// Microsoft Clarity — Heatmaps & Session Replays
// Web: uses @microsoft/clarity package
// Native (future): will use @microsoft/react-native-clarity
import { Platform } from 'react-native';
import { logger } from './logger';

const CLARITY_PROJECT_ID = 'w96xdt9sfp';

let clarityLoaded = false;

/**
 * Initialize Microsoft Clarity (web only).
 * Call once when the app starts.
 */
export const initializeClarity = () => {
  if (Platform.OS !== 'web' || clarityLoaded) return;

  try {
    // Dynamic import avoids bundling native-incompatible code
    const Clarity = require('@microsoft/clarity').default;
    Clarity.init(CLARITY_PROJECT_ID);
    clarityLoaded = true;
    logger.log('Clarity initialized');
  } catch (error: unknown) {
    logger.error('Failed to initialize Clarity:', error);
  }
};

/**
 * Identify the current user in Clarity for session attribution.
 * Call when user logs in / auth state changes.
 */
export const identifyClarity = (userId: string, displayName?: string) => {
  if (Platform.OS !== 'web' || !clarityLoaded) return;

  try {
    const Clarity = require('@microsoft/clarity').default;
    Clarity.identify(userId, undefined, undefined, displayName);
  } catch (error: unknown) {
    logger.error('Clarity identify failed:', error);
  }
};

/**
 * Set custom tags on the Clarity session for filtering.
 */
export const setClarityTag = (key: string, value: string) => {
  if (Platform.OS !== 'web' || !clarityLoaded) return;

  try {
    const Clarity = require('@microsoft/clarity').default;
    Clarity.setTag(key, value);
  } catch (error: unknown) {
    logger.error('Clarity setTag failed:', error);
  }
};
