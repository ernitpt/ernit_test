import { firebaseConfig, validateFirebaseConfig } from '../config/firebaseConfig';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  initializeAuth,
  Auth,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions } from 'firebase/functions';
import { config } from '../config/environment';
import { logger } from '../utils/logger';


// ✅ Validate config before initializing (throws if required keys are missing)
validateFirebaseConfig();

// ✅ Prevent re-init on hot reload
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ✅ Initialize Auth with correct persistence
let auth: Auth;

if (typeof window !== 'undefined') {
  // 🌐 Web
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(e => logger.warn('Failed to set auth persistence:', e));
} else {
  // 📱 React Native (iOS/Android)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getReactNativePersistence } = require('firebase/auth');
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

// ✅ Use environment-based database selection with offline persistence
// persistentLocalCache + persistentMultipleTabManager enables IndexedDB-backed
// offline caching for web (Firebase v10+). Falls back gracefully in environments
// that do not support it (e.g., private browsing, very old browsers).
const dbOptions = (typeof window !== 'undefined')
  ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
  : {};

// Test: 'ernitclone2' database | Production: default database (no second param)
const db = config.isProduction
  ? initializeFirestore(app, dbOptions)              // default database
  : initializeFirestore(app, dbOptions, 'ernitclone2'); // test database

// Debug logging to verify database connection
logger.log(`🔥 Firebase Database: ${config.isProduction ? 'DEFAULT (Production)' : 'ernitclone2 (Test)'}`);
logger.log(`🔥 Environment Config: isProduction=${config.isProduction}, name=${config.name}`);

const storage = getStorage(app);

// ✅ Use environment-based region
export const functions = getFunctions(app, 'europe-west1');

export { app, auth, db, storage };