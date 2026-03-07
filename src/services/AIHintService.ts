// services/AIHintService.ts
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from '../utils/logger';

export type HintStyle = "neutral" | "personalized" | "motivational";

export type HintCategory =
  | 'what_to_bring'
  | 'what_to_wear'
  | 'physical_prep'
  | 'mental_prep'
  | 'atmosphere'
  | 'sensory'
  | 'activity_level'
  | 'location_type'
  | 'geographic_clues';

export type SessionDoc = {
  sessionNumber: number;
  hint?: string;
  style?: HintStyle;
  category?: HintCategory;
  completedAt?: any;
  timeElapsedSec?: number;
};

// 🔹 Local cache for fast reuse
const LOCAL_HINT_CACHE_KEY = "local_hint_cache_v1";
let localCache: Record<string, string> = {};

async function loadLocalCache() {
  if (Object.keys(localCache).length > 0) return;

  try {
    const stored = await AsyncStorage.getItem(LOCAL_HINT_CACHE_KEY);
    if (stored) localCache = JSON.parse(stored);
  } catch { }
}

async function saveLocalCache() {
  try {
    await AsyncStorage.setItem(
      LOCAL_HINT_CACHE_KEY,
      JSON.stringify(localCache)
    );
  } catch { }
}

// 🌀 Determine style rotation by session number
function styleForSession(n: number): HintStyle {
  if (n < 1) return "neutral"; // Fallback for invalid input
  const i = (n - 1) % 3;
  return i === 0 ? "neutral" : i === 1 ? "personalized" : "motivational";
}

export const aiHintService = {
  /** ✅ Get or generate a hint WITHOUT writing to Firestore */
  async generateHint(params: {
    goalId: string;
    experienceType: string;
    experienceDescription?: string;
    experienceCategory?: string;
    experienceSubtitle?: string;
    sessionNumber: number;
    totalSessions: number;
    userName?: string | null;
  }): Promise<{ hint: string; category?: HintCategory }> {
    await loadLocalCache();

    const {
      goalId,
      sessionNumber,
      experienceType,
      experienceDescription,
      experienceCategory,
      experienceSubtitle,
      totalSessions,
      userName,
    } = params;

    const cacheKey = `${goalId}_${sessionNumber}`;

    // ✅ Check local cache first
    if (localCache[cacheKey]) {
      return { hint: localCache[cacheKey] };
    }

    // ✅ Check Firestore stored hint (previous sessions)
    try {
      const ref = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));
      const snap = await getDoc(ref);
      const existing = snap.data() as SessionDoc | undefined;

      if (existing?.hint) {
        localCache[cacheKey] = existing.hint;
        saveLocalCache();
        return { hint: existing.hint, category: existing.category };
      }
    } catch (err) {
      // Document doesn't exist or permission denied - this is expected for future sessions
      logger.log("Session document not found, will generate new hint");
    }

    // ✅ Fetch previous hints AND categories for anti-repetition
    let previousHints: string[] = [];
    let previousCategories: HintCategory[] = [];

    try {
      const sessions = await this.getAllSessions(goalId);

      // Get last 15 sessions (or all if less than 15)
      const recentSessions = sessions.slice(0, 15).reverse(); // reverse to get oldest-to-newest

      previousHints = recentSessions
        .map(s => s.hint)
        .filter((h): h is string => !!h);

      previousCategories = recentSessions
        .map(s => s.category)
        .filter((c): c is HintCategory => !!c);

    } catch (err) {
      logger.warn('Could not fetch previous hints/categories:', err);
    }

    // ✅ Generate remotely
    const style = styleForSession(sessionNumber);

    const callable = httpsCallable(functions, "aiGenerateHint");
    const res: any = await callable({
      experienceType,
      experienceDescription,
      experienceCategory,
      experienceSubtitle,
      sessionNumber,
      totalSessions,
      userName,
      style,
      previousHints,
      previousCategories, // NEW: Send categories
    });

    const hint = res?.data?.hint as string;
    const category = res?.data?.category as HintCategory | undefined;

    if (!hint) throw new Error("No hint returned");

    // Optional: Log category for debugging
    if (category) {
      logger.log(`Generated hint for category: ${category}`);
    }

    // ✅ Save hint + category to Firestore session document
    try {
      const sessionRef = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));
      await setDoc(sessionRef, {
        goalId,
        sessionNumber,
        hint,
        category: category || null,
        createdAt: new Date(),
        giverName: "Anonymous", // Hints are anonymous
      });
      logger.log(`✅ Saved hint + category to Firestore: ${category}`);
    } catch (err) {
      logger.warn('Failed to save hint to Firestore:', err);
      // Continue anyway - hint is still in local cache
    }

    // ✅ Cache locally
    localCache[cacheKey] = hint;
    saveLocalCache();

    return { hint, category };
  },

  /** ✅ Generate hint for mystery gifts — experience details resolved server-side */
  async generateMysteryHint(params: {
    goalId: string;
    sessionNumber: number;
    totalSessions: number;
    userName?: string | null;
  }): Promise<{ hint: string; category?: HintCategory }> {
    await loadLocalCache();

    const { goalId, sessionNumber, totalSessions, userName } = params;
    const cacheKey = `${goalId}_${sessionNumber}`;

    // Check local cache first
    if (localCache[cacheKey]) {
      return { hint: localCache[cacheKey] };
    }

    // Check Firestore stored hint
    try {
      const ref = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));
      const snap = await getDoc(ref);
      const existing = snap.data() as SessionDoc | undefined;
      if (existing?.hint) {
        localCache[cacheKey] = existing.hint;
        saveLocalCache();
        return { hint: existing.hint, category: existing.category };
      }
    } catch {
      logger.log("Session document not found for mystery hint, will generate new");
    }

    // Fetch previous hints for anti-repetition
    let previousHints: string[] = [];
    let previousCategories: HintCategory[] = [];
    try {
      const sessions = await this.getAllSessions(goalId);
      const recentSessions = sessions.slice(0, 15).reverse();
      previousHints = recentSessions.map(s => s.hint).filter((h): h is string => !!h);
      previousCategories = recentSessions.map(s => s.category).filter((c): c is HintCategory => !!c);
    } catch (err) {
      logger.warn('Could not fetch previous hints/categories for mystery:', err);
    }

    const style = styleForSession(sessionNumber);

    // Call Cloud Function with goalId — it resolves experience details server-side
    const callable = httpsCallable(functions, "aiGenerateHint");
    const res: any = await callable({
      goalId,
      sessionNumber,
      totalSessions,
      userName,
      style,
      previousHints,
      previousCategories,
    });

    const hint = res?.data?.hint as string;
    const category = res?.data?.category as HintCategory | undefined;
    if (!hint) throw new Error("No hint returned for mystery");

    // Save to Firestore
    try {
      const sessionRef = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));
      await setDoc(sessionRef, {
        goalId,
        sessionNumber,
        hint,
        category: category || null,
        createdAt: new Date(),
        giverName: "Anonymous",
      });
    } catch (err) {
      logger.warn('Failed to save mystery hint to Firestore:', err);
    }

    localCache[cacheKey] = hint;
    saveLocalCache();
    return { hint, category };
  },

  /** ✅ Fetch a hint already completed */
  async getHint(goalId: string, sessionNumber: number) {
    await loadLocalCache();

    const cacheKey = `${goalId}_${sessionNumber}`;
    if (localCache[cacheKey]) return localCache[cacheKey];

    const ref = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));
    const snap = await getDoc(ref);

    return (snap.data() as SessionDoc | undefined)?.hint ?? null;
  },

  /** 📋 Fetch all previous hints for a goal (for anti-repetition) */
  async getPreviousHints(goalId: string): Promise<string[]> {
    try {
      const hintsQuery = query(
        collection(db, "goalSessions", goalId, "sessions"),
        orderBy("sessionNumber", "asc")
      );
      const snaps = await getDocs(hintsQuery);

      const hints: string[] = [];
      snaps.docs.forEach((doc) => {
        const data = doc.data() as SessionDoc;
        if (data.hint) {
          hints.push(data.hint);
        }
      });

      return hints;
    } catch (err) {
      logger.warn('Could not fetch previous hints:', err);
      return []; // Graceful fallback
    }
  },

  /** 📜 Fetch session history (newest first) */
  async getAllSessions(goalId: string) {
    const q = query(
      collection(db, "goalSessions", goalId, "sessions"),
      orderBy("sessionNumber", "desc")
    );
    const snaps = await getDocs(q);
    return snaps.docs.map((d) => d.data() as SessionDoc);
  },
};
