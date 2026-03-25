import { doc, getDoc } from "firebase/firestore";
import { db } from './firebase';
import { Experience } from "../types";

import { logger } from '../utils/logger';

// Session-scoped cache to avoid redundant Firestore reads for the same experience
const _experienceCache = new Map<string, Experience | null>();

/**
 * Service for interacting with the 'experiences' collection in Firestore.
 */
export const experienceService = {
  /**
   * Get a single experience by its document ID.
   * Results are cached for the session lifetime.
   */
  async getExperienceById(id: string): Promise<Experience | null> {
    if (_experienceCache.has(id)) {
      return _experienceCache.get(id) ?? null;
    }
    try {
      const docRef = doc(db, "experiences", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const experience = { id: docSnap.id, ...docSnap.data() } as Experience;
        _experienceCache.set(id, experience);
        return experience;
      } else {
        logger.warn(`Experience not found: ${id}`);
        _experienceCache.set(id, null);
        return null;
      }
    } catch (error: unknown) {
      logger.error("Error fetching experience:", error);
      return null;
    }
  },
};
