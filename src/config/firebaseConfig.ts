import Constants from 'expo-constants';

import { logger } from '../utils/logger';
import { isProduction } from './environment';
// Firebase configuration using environment variables
export const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: Constants.expoConfig?.extra?.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: Constants.expoConfig?.extra?.firebaseMeasurementId || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate that all required Firebase config values are present.
// Warns (does not throw) so a temporarily missing env var during development does not crash the app at startup.
export function validateFirebaseConfig(): void {
  const requiredKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  for (const key of requiredKeys) {
    if (!firebaseConfig[key]) {
      console.error(`[Firebase] Missing required config key: ${key}. Check EXPO_PUBLIC_* environment variables.`);
    }
  }
}

// Run validation at module load time so missing keys are surfaced immediately on startup.
validateFirebaseConfig();

// Debug log to help troubleshoot Vercel deployment
logger.log(`🔧 firebaseConfig: __DEV__=${typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined'}, EXPO_PUBLIC_APP_ENV=${process.env.EXPO_PUBLIC_APP_ENV}, isDevelopment=${!isProduction}`);
