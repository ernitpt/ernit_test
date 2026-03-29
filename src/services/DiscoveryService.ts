import { db } from '../services/firebase';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Experience, ExperienceCategory } from '../types';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Checks whether a haystack string contains any of the given keywords (case-insensitive). */
function containsAny(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

/**
 * Returns the searchable text blob for an experience.
 * Combines title, description, category, and location so keyword matching
 * spans all relevant fields in a single pass.
 */
function experienceSearchBlob(exp: Experience): string {
  return [exp.title, exp.description, exp.category, exp.location ?? ''].join(' ');
}

// ---------------------------------------------------------------------------
// Per-category scoring rules
// ---------------------------------------------------------------------------

type ScoringRule = {
  keywords: string[];
  score: number;
};

type CategoryRules = Record<string, ScoringRule>;

const SCORING_RULES: Record<ExperienceCategory, CategoryRules> = {
  adventure: {
    beach:     { keywords: ['beach', 'ocean', 'sea', 'surf', 'coast'],                    score: 2 },
    mountains: { keywords: ['mountain', 'hill', 'climb', 'hike', 'altitude'],             score: 2 },
    morning:   { keywords: ['sunrise', 'morning', 'dawn'],                                score: 1 },
    evening:   { keywords: ['sunset', 'evening', 'night', 'stargazing'],                  score: 1 },
    water:     { keywords: ['water', 'river', 'lake', 'ocean', 'swim', 'dive', 'surf', 'kayak'], score: 2 },
    sky:       { keywords: ['sky', 'fly', 'air', 'balloon', 'paraglid', 'parachute'],     score: 2 },
    adrenaline:{ keywords: ['extreme', 'thrill', 'rush', 'fast', 'adrenaline'],           score: 1 },
    gentle:    { keywords: ['gentle', 'calm', 'peaceful', 'scenic', 'relax'],             score: 1 },
  },
  wellness: {
    indoor:      { keywords: ['studio', 'indoor', 'spa', 'room'],                         score: 1 },
    outdoor:     { keywords: ['outdoor', 'garden', 'nature', 'forest'],                   score: 1 },
    active:      { keywords: ['yoga', 'pilates', 'exercise', 'movement', 'stretch'],      score: 2 },
    restorative: { keywords: ['massage', 'spa', 'rest', 'relax', 'meditation'],           score: 2 },
    heat:        { keywords: ['sauna', 'hot', 'warm', 'thermal'],                         score: 1 },
    cold:        { keywords: ['cryo', 'cold', 'ice', 'plunge'],                           score: 1 },
  },
  creative: {
    hands_on:    { keywords: ['workshop', 'create', 'make', 'build', 'craft', 'paint', 'cook'], score: 2 },
    observing:   { keywords: ['tour', 'show', 'gallery', 'exhibit', 'performance', 'concert'],  score: 2 },
    traditional: { keywords: ['classic', 'traditional', 'heritage', 'artisan'],                score: 1 },
    modern:      { keywords: ['modern', 'contemporary', 'digital', 'tech'],                    score: 1 },
  },
};

/** Scores a single experience against the user's preference answers. */
function scoreExperience(
  exp: Experience,
  category: ExperienceCategory,
  preferences: Record<string, string>,
): number {
  const rules = SCORING_RULES[category];
  if (!rules) return 0;

  const blob = experienceSearchBlob(exp);
  let total = 0;

  for (const [questionId, answer] of Object.entries(preferences)) {
    // Only apply rules whose key matches the answer value (the quiz answer IS the rule key)
    const rule = rules[answer];
    if (rule && containsAny(blob, rule.keywords)) {
      total += rule.score;
    }
    // Also try matching questionId as the rule key in case the answer is a boolean-ish flag
    // (defensive: no-op when neither key resolves)
    void questionId;
  }

  return total;
}

/** Fisher-Yates shuffle — mutates and returns the array. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Snapshot of a discovered experience stored on the goal doc
// ---------------------------------------------------------------------------

type DiscoveredExperienceSnapshot = {
  experienceId: string;
  title: string;
  subtitle: string;
  description: string;
  category: ExperienceCategory;
  price: number;
  coverImageUrl: string;
  imageUrl: string[];
  partnerId: string;
  location?: string;
};

// ---------------------------------------------------------------------------
// DiscoveryService
// ---------------------------------------------------------------------------

class DiscoveryService {
  // -------------------------------------------------------------------------
  // saveQuizAnswer
  // -------------------------------------------------------------------------

  /**
   * Persists a single quiz answer on the goal document and updates the
   * running count of completed questions.
   *
   * @param goalId          - Firestore goal document ID
   * @param questionId      - Quiz question identifier (e.g. "terrain")
   * @param answer          - The user's chosen answer value (e.g. "beach")
   * @param totalCompleted  - Total number of questions answered so far (after this one)
   */
  async saveQuizAnswer(
    goalId: string,
    questionId: string,
    answer: string,
    totalCompleted: number,
  ): Promise<void> {
    try {
      const goalRef = doc(db, 'goals', goalId);
      await updateDoc(goalRef, {
        [`discoveryPreferences.${questionId}`]: answer,
        discoveryQuestionsCompleted: totalCompleted,
      });
      logger.log('[DiscoveryService] saveQuizAnswer:', goalId, questionId, answer);
    } catch (err: unknown) {
      logger.error('[DiscoveryService] saveQuizAnswer failed:', err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // canMatchExperience
  // -------------------------------------------------------------------------

  /**
   * Returns true when the user has answered enough questions for a reliable
   * match (minimum threshold: 3 answers).
   */
  canMatchExperience(questionsCompleted: number): boolean {
    return questionsCompleted >= 3;
  }

  // -------------------------------------------------------------------------
  // matchExperience
  // -------------------------------------------------------------------------

  /**
   * Fetches all published experiences in the given category, scores each one
   * against the user's preferences via keyword matching, picks the best match
   * (with random tie-breaking), saves it on the goal doc, and returns it.
   *
   * Falls back to the experience with the lowest `order` value when every
   * candidate scores zero.
   *
   * @returns The matched Experience, or null if the catalog is empty.
   */
  async matchExperience(
    goalId: string,
    category: ExperienceCategory,
    preferences: Record<string, string>,
  ): Promise<Experience | null> {
    try {
      logger.log('[DiscoveryService] matchExperience start:', goalId, category);

      // 1. Fetch all published experiences in this category
      const expQuery = query(
        collection(db, 'experiences'),
        where('category', '==', category),
        where('status', '==', 'published'),
      );
      const snapshot = await getDocs(expQuery);

      if (snapshot.empty) {
        logger.warn('[DiscoveryService] No published experiences found for category:', category);
        return null;
      }

      const experiences = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Experience));

      // 2. Score each experience
      const scored = experiences.map(exp => ({
        exp,
        score: scoreExperience(exp, category, preferences),
      }));

      logger.log(
        '[DiscoveryService] scores:',
        scored.map(s => ({ title: s.exp.title, score: s.score })),
      );

      // 3. Find the maximum score
      const maxScore = Math.max(...scored.map(s => s.score));

      let winner: Experience;

      if (maxScore === 0) {
        // No preference matches — fall back to lowest `order` (featured/default)
        const sorted = [...experiences].sort(
          (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
        );
        winner = sorted[0];
        logger.log('[DiscoveryService] fallback to lowest order:', winner.title);
      } else {
        // 4. Collect all experiences tied at the max score and shuffle for randomness
        const topTier = scored.filter(s => s.score === maxScore).map(s => s.exp);
        shuffle(topTier);
        winner = topTier[0];
        logger.log('[DiscoveryService] matched experience:', winner.title, '(score:', maxScore, ')');
      }

      // 5. Persist the discovered experience on the goal doc
      const snapshot_: DiscoveredExperienceSnapshot = {
        experienceId: winner.id,
        title: winner.title,
        subtitle: winner.subtitle,
        description: winner.description,
        category: winner.category,
        price: winner.price,
        coverImageUrl: winner.coverImageUrl,
        imageUrl: winner.imageUrl,
        partnerId: winner.partnerId,
        ...(winner.location !== undefined ? { location: winner.location } : {}),
      };

      const goalRef = doc(db, 'goals', goalId);
      await updateDoc(goalRef, {
        discoveredExperience: snapshot_,
        discoveredAt: serverTimestamp(),
      });

      return winner;
    } catch (err: unknown) {
      logger.error('[DiscoveryService] matchExperience failed:', err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // getDiscoveredExperience
  // -------------------------------------------------------------------------

  /**
   * Reads the goal document and returns the previously discovered experience
   * snapshot (cast to Experience), or null if none has been set yet.
   */
  async getDiscoveredExperience(goalId: string): Promise<Experience | null> {
    try {
      const goalRef = doc(db, 'goals', goalId);
      const snap = await getDoc(goalRef);

      if (!snap.exists()) {
        logger.warn('[DiscoveryService] getDiscoveredExperience: goal not found:', goalId);
        return null;
      }

      const data = snap.data();
      const discovered = data?.discoveredExperience as DiscoveredExperienceSnapshot | undefined;

      if (!discovered) return null;

      // Re-hydrate as an Experience using the stored snapshot
      return {
        id: discovered.experienceId,
        title: discovered.title,
        subtitle: discovered.subtitle,
        description: discovered.description,
        category: discovered.category,
        price: discovered.price,
        coverImageUrl: discovered.coverImageUrl,
        imageUrl: discovered.imageUrl,
        partnerId: discovered.partnerId,
        location: discovered.location,
        // Fields not stored in the snapshot default to safe values
        status: 'published',
      } satisfies Experience;
    } catch (err: unknown) {
      logger.error('[DiscoveryService] getDiscoveredExperience failed:', err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // needsDiscoveryQuiz
  // -------------------------------------------------------------------------

  /**
   * Returns true when the goal is on the category path, has a preferred
   * reward category set, but has not yet had an experience matched or pledged.
   */
  needsDiscoveryQuiz(goal: {
    isFreeGoal?: boolean;
    preferredRewardCategory?: string;
    discoveredExperience?: unknown;
    pledgedExperience?: unknown;
    experienceGiftId?: string;
  }): boolean {
    return Boolean(
      goal.isFreeGoal &&
        goal.preferredRewardCategory &&
        !goal.discoveredExperience &&
        !goal.pledgedExperience &&
        !goal.experienceGiftId,
    );
  }

  // -------------------------------------------------------------------------
  // isInQuizPhase
  // -------------------------------------------------------------------------

  /**
   * Returns true when the goal is early enough in its lifecycle that the
   * discovery quiz should be shown. Uses the larger of 15% of total sessions
   * or 5 sessions (ensures at least 5 quiz opportunities for short goals).
   */
  isInQuizPhase(sessionsDone: number, totalSessions: number): boolean {
    if (totalSessions <= 0) return false;
    const quizCutoff = Math.max(Math.ceil(totalSessions * 0.15), 5);
    return sessionsDone < quizCutoff;
  }

  // -------------------------------------------------------------------------
  // isReadyForReveal
  // -------------------------------------------------------------------------

  /**
   * Returns true when the goal has reached the reveal threshold (>= 75%
   * completion) and the experience has not been revealed to the user yet.
   */
  isReadyForReveal(
    sessionsDone: number,
    totalSessions: number,
    experienceRevealed?: boolean,
  ): boolean {
    if (totalSessions <= 0) return false;
    return sessionsDone / totalSessions >= 0.75 && !experienceRevealed;
  }

  // -------------------------------------------------------------------------
  // markExperienceRevealed
  // -------------------------------------------------------------------------

  /**
   * Marks the goal's discovered experience as revealed to the user.
   * Sets `experienceRevealed = true` and `experienceRevealedAt = now`.
   */
  async markExperienceRevealed(goalId: string): Promise<void> {
    try {
      const goalRef = doc(db, 'goals', goalId);
      await updateDoc(goalRef, {
        experienceRevealed: true,
        experienceRevealedAt: serverTimestamp(),
      });
      logger.log('[DiscoveryService] markExperienceRevealed:', goalId);
    } catch (err: unknown) {
      logger.error('[DiscoveryService] markExperienceRevealed failed:', err);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const discoveryService = new DiscoveryService();
