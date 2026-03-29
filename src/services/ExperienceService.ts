import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from './firebase';
import { Experience } from "../types";

import { logger } from '../utils/logger';

interface CacheEntry {
  data: Experience;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Session-scoped cache to avoid redundant Firestore reads for the same experience
const _experienceCache: Record<string, CacheEntry> = {};

/**
 * Service for interacting with the 'experiences' collection in Firestore.
 */
export const experienceService = {
  /**
   * Get a single experience by its document ID.
   * Results are cached for 5 minutes. Null/missing results are not cached
   * so that transient failures do not permanently poison the cache.
   */
  async getExperienceById(id: string): Promise<Experience | null> {
    const cached = _experienceCache[id];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }
    try {
      const docRef = doc(db, "experiences", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const experience = { id: docSnap.id, ...docSnap.data() } as Experience;
        _experienceCache[id] = { data: experience, fetchedAt: Date.now() };
        return experience;
      } else {
        logger.warn(`Experience not found: ${id}`);
        // Do not cache null — allows retry on future calls
        return null;
      }
    } catch (error: unknown) {
      logger.error("Error fetching experience:", error);
      return null;
    }
  },

  /**
   * Get all experiences from the collection.
   */
  async getAllExperiences(): Promise<Experience[]> {
    try {
      const snapshot = await getDocs(collection(db, "experiences"));
      const experiences = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Experience));
      // Populate cache with TTL
      const now = Date.now();
      experiences.forEach(e => { _experienceCache[e.id] = { data: e, fetchedAt: now }; });
      return experiences;
    } catch (error: unknown) {
      logger.error("Error fetching experiences:", error);
      return [];
    }
  },
};
