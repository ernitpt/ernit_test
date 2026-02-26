import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { MotiView } from 'moti';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Experience } from '../types';
import Colors from '../config/colors';

/**
 * Auto-playing animated demo showing the goal journey:
 *   Goal appears → Sessions fill → Empowerment → Complete → Experience carousel
 * Plays once and holds the final state. Used on ChallengeLandingScreen.
 */

// Step machine: -1 = hidden, 0-7 = visible steps
type Step = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ─── Experience Card (carousel item) ─────────────────────────────────

const ExperienceCard: React.FC<{
  experience: Experience;
  index: number;
}> = React.memo(({ experience, index }) => (
  <MotiView
    from={{ opacity: 0, translateX: 50 }}
    animate={{ opacity: 1, translateX: 0 }}
    transition={{ type: 'spring', damping: 28, stiffness: 160, delay: index * 120 }}
    style={s.expCard}
  >
    <Image
      source={{ uri: experience.coverImageUrl }}
      style={s.expImage}
      resizeMode="cover"
    />
    <View style={s.expOverlay}>
      <Text style={s.expTitle} numberOfLines={2}>{experience.title}</Text>
      {experience.subtitle ? (
        <Text style={s.expSubtitle} numberOfLines={1}>{experience.subtitle}</Text>
      ) : null}
    </View>
  </MotiView>
));

ExperienceCard.displayName = 'ExperienceCard';

// ─── JourneyDemo ─────────────────────────────────────────────────────

const JourneyDemo: React.FC = React.memo(() => {
  const [step, setStep] = useState<Step>(-1);
  const [experiences, setExperiences] = useState<Experience[]>([]);

  // Fetch real experiences on mount (will be ready by step 7)
  useEffect(() => {
    const fetchExperiences = async () => {
      try {
        const q = query(collection(db, 'experiences'), limit(8));
        const snapshot = await getDocs(q);
        setExperiences(
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Experience))
        );
      } catch {
        // Silently fail — carousel just won't show
      }
    };
    fetchExperiences();
  }, []);

  // Step machine
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const next = (s: Step, delay: number) => {
      timeout = setTimeout(() => setStep(s), delay);
    };

    switch (step) {
      case -1: next(0, 700);  break; // pause before starting
      case 0:  next(1, 400);  break; // card visible → goal slides in
      case 1:  next(2, 900);  break; // goal → capsule 1
      case 2:  next(3, 700);  break; // capsule 1 → capsule 2 + streak
      case 3:  next(4, 900);  break; // capsule 2 → empowerment notification
      case 4:  next(5, 1200); break; // empowerment → capsule 3 fills
      case 5:  next(6, 700);  break; // capsule 3 → completion
      case 6:  next(7, 900);  break; // completion → carousel reveals
      case 7:  break;                // hold forever
    }

    return () => clearTimeout(timeout);
  }, [step]);

  // Derived state
  const visible = step >= 0;
  const showGoal = step >= 1;
  const capsuleFilled = [step >= 2, step >= 3, step >= 5];
  const filledCount = capsuleFilled.filter(Boolean).length;
  const showStreak = step >= 3;
  const showEmpower = step >= 4;
  const weekLabel = step >= 6 ? 'Week 3 of 3 ✓' : 'Week 1 of 3';
  const showComplete = step >= 6;
  const showCarousel = step >= 7;

  // Low-bounce transitions
  const slideSide = { type: 'spring' as const, damping: 28, stiffness: 160 };
  const slideUp = { type: 'spring' as const, damping: 28, stiffness: 160 };
  const popIn = { type: 'spring' as const, damping: 24, stiffness: 180 };

  return (
    <View style={s.wrapper}>
      <Text style={s.label}>See how it works</Text>

      {/* ── Demo card ── */}
      <MotiView
        animate={{
          opacity: visible ? 1 : 0,
          translateY: visible ? 0 : 10,
        }}
        transition={{ type: 'timing', duration: 400 }}
        style={s.card}
      >
        {/* Goal header — slides from left */}
        <MotiView
          animate={{
            opacity: showGoal ? 1 : 0,
            translateX: showGoal ? 0 : -24,
          }}
          transition={slideSide}
          style={s.goalHeader}
        >
          <View style={s.goalEmojiBox}>
            <Text style={s.goalEmoji}>🏃</Text>
          </View>
          <View style={s.goalInfo}>
            <Text style={s.goalTitle}>Run 3x/week</Text>
            <MotiView
              animate={{ opacity: showGoal ? 1 : 0 }}
              transition={{ type: 'timing', duration: 300 }}
            >
              <Text
                style={[
                  s.goalSubtitle,
                  step >= 6 && s.goalSubtitleComplete,
                ]}
              >
                {weekLabel}
              </Text>
            </MotiView>
          </View>
        </MotiView>

        {/* Progress capsules */}
        <MotiView
          animate={{ opacity: showGoal ? 1 : 0 }}
          transition={{ type: 'timing', duration: 300 }}
          style={s.progressRow}
        >
          <View style={s.capsuleContainer}>
            {capsuleFilled.map((filled, i) => (
              <View key={i} style={s.capsule}>
                <MotiView
                  animate={{ opacity: filled ? 1 : 0 }}
                  transition={{ type: 'timing', duration: 450 }}
                  style={s.capsuleFill}
                />
              </View>
            ))}
          </View>
          <Text style={s.progressCount}>{filledCount}/3</Text>
        </MotiView>

        {/* Streak badge */}
        <MotiView
          animate={{
            opacity: showStreak ? 1 : 0,
            scale: showStreak ? 1 : 0.6,
          }}
          transition={popIn}
          style={s.streakBadge}
        >
          <Text style={s.streakFlame}>🔥</Text>
          <Text style={s.streakNum}>{Math.max(filledCount, 1)}</Text>
        </MotiView>

        {/* Empowerment notification — slides from right */}
        <MotiView
          animate={{
            opacity: showEmpower ? 1 : 0,
            translateX: showEmpower ? 0 : 32,
          }}
          transition={slideSide}
          style={s.empowerBubble}
        >
          <Text style={s.empowerIcon}>🎁</Text>
          <View style={s.empowerTextCol}>
            <Text style={s.empowerTitle}>Sarah empowered you!</Text>
            <Text style={s.empowerSub}>Finish your goal to unlock your gift</Text>
          </View>
        </MotiView>

        {/* Goal Complete — slides up */}
        <MotiView
          animate={{
            opacity: showComplete ? 1 : 0,
            translateY: showComplete ? 0 : 16,
          }}
          transition={slideUp}
          style={s.completionRow}
        >
          <Text style={s.completionText}>✅ Goal Complete!</Text>
        </MotiView>
      </MotiView>

      {/* ── Experience carousel — reveals after completion ── */}
      {showCarousel && experiences.length > 0 && (
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 140 }}
          style={s.carouselSection}
        >
          <Text style={s.carouselTitle}>You've earned:</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carouselScroll}
          >
            {experiences.map((exp, i) => (
              <ExperienceCard
                key={exp.id}
                experience={exp}
                index={i}
              />
            ))}
          </ScrollView>
        </MotiView>
      )}
    </View>
  );
});

JourneyDemo.displayName = 'JourneyDemo';
export default JourneyDemo;

// ─── Styles ─────────────────────────────────────────────────────────

const CARD_W = 180;
const IMG_H = 140;

const s = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginTop: 32,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 16,
  },

  // Demo card
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
    gap: 14,
    overflow: 'hidden',
  },

  // Goal header
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goalEmojiBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalEmoji: {
    fontSize: 24,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  goalSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 2,
  },
  goalSubtitleComplete: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Progress capsules
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  capsuleContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  capsule: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  capsuleFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 5,
    backgroundColor: Colors.secondary,
  },
  progressCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },

  // Streak badge
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  streakFlame: {
    fontSize: 12,
  },
  streakNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EA580C',
  },

  // Empowerment notification
  empowerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FDF4FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  empowerIcon: {
    fontSize: 24,
  },
  empowerTextCol: {
    flex: 1,
  },
  empowerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },
  empowerSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  // Completion
  completionRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  completionText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
  },

  // ── Experience carousel ──
  carouselSection: {
    width: '100%',
    marginTop: 24,
  },
  carouselTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 14,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  carouselScroll: {
    paddingHorizontal: 4,
    gap: 10,
  },

  // Experience card
  expCard: {
    width: CARD_W,
    height: IMG_H,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  expImage: {
    width: '100%',
    height: '100%',
  },
  expOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  expTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  expSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
