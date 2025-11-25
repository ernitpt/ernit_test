// services/AIHintService.ts
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type HintStyle = "neutral" | "personalized" | "motivational";

export type SessionDoc = {
  sessionNumber: number;
  hint?: string;
  style?: HintStyle;
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
  const i = (n - 1) % 3;
  return i === 0 ? "neutral" : i === 1 ? "personalized" : "motivational";
}

export const aiHintService = {
  /** ✅ Get or generate a hint WITHOUT writing to Firestore */
  async generateHint(params: {
    goalId: string;
    experienceType: string;
    sessionNumber: number;
    totalSessions: number;
    userName?: string | null;
  }): Promise<string> {
    await loadLocalCache();

    const {
      goalId,
      sessionNumber,
      experienceType,
      totalSessions,
      userName,
    } = params;

    const cacheKey = `${goalId}_${sessionNumber}`;

    // ✅ Check local cache first
    if (localCache[cacheKey]) {
      console.log("✅ Returning cached hint");
      return localCache[cacheKey];
    }

    // ✅ Check Firestore stored hint (previous sessions)
    try {
      const ref = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));
      const snap = await getDoc(ref);
      const existing = snap.data() as SessionDoc | undefined;

      if (existing?.hint) {
        console.log("✅ Returning Firestore stored hint");
        localCache[cacheKey] = existing.hint;
        saveLocalCache();
        return existing.hint;
      }
    } catch (err) {
      // Document doesn't exist or permission denied - this is expected for future sessions
      console.log("Session document not found, will generate new hint");
    }

    // ✅ Generate remotely
    const style = styleForSession(sessionNumber);

    const callable = httpsCallable(functions, "aiGenerateHint");
    const res: any = await callable({
      experienceType,
      sessionNumber,
      totalSessions,
      userName,
      style,
    });

    const hint = res?.data?.hint as string;

    if (!hint) throw new Error("No hint returned");

    console.log("✨ Generated new hint:", hint);

    // ✅ Cache locally ONLY
    localCache[cacheKey] = hint;
    saveLocalCache();

    return hint;
  },

  /** ✅ Save hint ONLY when session is finished (allowed in rules) */
  async saveHintToFirestore(
    goalId: string,
    sessionNumber: number,
    timeElapsedSec: number
  ) {
    const cacheKey = `${goalId}_${sessionNumber}`;
    const hint = localCache[cacheKey];
    if (!hint) return; // nothing to save

    const ref = doc(db, "goalSessions", goalId, "sessions", String(sessionNumber));

    await updateDoc(ref, {
      hint,
      style: styleForSession(sessionNumber),
      completedAt: serverTimestamp(),
      timeElapsedSec,
    });

    console.log("✅ Hint saved to Firestore AFTER completion");
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
