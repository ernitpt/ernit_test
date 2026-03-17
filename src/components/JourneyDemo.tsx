import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Platform, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, AnimatePresence } from 'moti';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Experience } from '../types';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 48, 400);

// Step machine: -1 = hidden, 0-9 = visible steps
type Step = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Phase labels
const PHASES = ['Set Goal', 'Build Habit', 'Get Reward'] as const;

// ─── JourneyDemo ─────────────────────────────────────────────────────
const JourneyDemo: React.FC = React.memo(() => {
  const [step, setStep] = useState<Step>(-1);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [barProgress, setBarProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const wrapperRef = useRef<View>(null);

  // Pick one random experience to reveal
  const rewardExperience = useMemo(() => {
    if (experiences.length === 0) return null;
    return experiences[Math.floor(Math.random() * experiences.length)];
  }, [experiences]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    if (Platform.OS === 'web') {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setHasStarted(true);
            observer.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      observer.observe(node as unknown as Element);
      return () => observer.disconnect();
    }
    setHasStarted(true);
  }, []);

  useEffect(() => {
    const fetchExperiences = async () => {
      try {
        const q = query(collection(db, 'experiences'), limit(8));
        const snapshot = await getDocs(q);
        setExperiences(
          snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Experience))
            .filter(exp => exp.status !== 'draft')
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        );
      } catch {
        // Silently fail
      }
    };
    fetchExperiences();
  }, []);

  // Step machine timing
  useEffect(() => {
    if (!hasStarted) return;
    let timeout: ReturnType<typeof setTimeout>;
    const next = (s: Step, delay: number) => {
      timeout = setTimeout(() => setStep(s), delay);
    };

    switch (step) {
      case -1: next(0, 500); break;   // card fades in
      case 0: next(1, 800); break;    // goal header appears
      case 1: next(2, 1200); break;   // capsule 1 fills — Week 1
      case 2: next(3, 1200); break;   // capsule 2 fills — Week 2 + streak
      case 3: next(4, 1400); break;   // empowerment slides in
      case 4: next(5, 2800); break;   // hold on Sarah's message
      case 5: next(6, 1000); break;   // "Goal Complete" text
      case 6: next(7, 1000); break;   // reward appears
      case 7:                         // hold on reward, then show replay
        timeout = setTimeout(() => setFinished(true), 3000);
        break;
    }
    return () => clearTimeout(timeout);
  }, [step, hasStarted]);

  // Gradual progress bar — fills independently, snaps to 100% on reward unlock
  useEffect(() => {
    if (step < 0) {
      setBarProgress(0);
      return;
    }
    if (step >= 7) {
      // Reward unlocked — snap to 100%
      setBarProgress(1);
      return;
    }
    // Gradually fill from 0 to ~90% over the animation
    const interval = setInterval(() => {
      setBarProgress(prev => Math.min(prev + 0.008, 0.98));
    }, 80);
    return () => clearInterval(interval);
  }, [step]);

  // Derived state
  const visible = step >= 0;

  // Phase
  let phase = 0;
  if (step >= 2) phase = 1;
  if (step >= 6) phase = 2;


  const showGoal = step >= 1 && step < 9;
  const capsuleFilled = [step >= 2, step >= 3, step >= 5];
  const filledCount = capsuleFilled.filter(Boolean).length;

  // Week subtitle
  let weekText = 'Week 1 of 3';
  if (step >= 5) weekText = 'Week 3 of 3 ✓';
  else if (step >= 3) weekText = 'Week 2 of 3';
  else if (step >= 2) weekText = 'Week 1 of 3';

  const showStreak = step >= 3 && step < 7;
  const showEmpower = step >= 4 && step < 9;
  const showCapsules = step >= 1 && step < 7;
  const showReward = step >= 7 && step < 9;

  return (
    <View ref={wrapperRef} style={s.wrapper}>
      {/* Demo Card */}
      <MotiView
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible ? 1 : 0.95,
        }}
        transition={{ type: 'timing', duration: 400 }}
        style={s.card}
      >
        {/* Progress Bar inside card */}
        <View style={s.progressTrack}>
          <MotiView
            animate={{ width: `${barProgress * 100}%` as any }}
            transition={barProgress === 1
              ? { type: 'spring', damping: 100, stiffness: 320 }
              : { type: 'timing', duration: 80 }
            }
            style={s.progressFill}
          />
        </View>

        {/* Phase Label */}
        <AnimatePresence exitBeforeEnter>
          <MotiView
            key={`phase-${phase}`}
            from={{ opacity: 0, translateY: -8 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: 8 }}
            transition={{ type: 'timing', duration: 250 }}
            style={s.phaseLabel}
          >
            <Text style={s.phaseLabelText}>{PHASES[phase]}</Text>
          </MotiView>
        </AnimatePresence>

        {/* Goal Header */}
        <MotiView
          animate={{
            opacity: showGoal ? 1 : 0,
            translateX: showGoal ? 0 : -20,
          }}
          transition={{ type: 'spring', damping: 28, stiffness: 160 }}
          style={s.goalHeader}
        >
          <View style={s.goalEmojiBox}>
            <Text style={s.goalEmoji}>🏃</Text>
          </View>
          <View style={s.goalInfo}>
            <Text style={s.goalTitle}>Run 3x/week</Text>
            <AnimatePresence exitBeforeEnter>
              <MotiView
                key={weekText}
                from={{ opacity: 0, translateY: 6 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -6 }}
                transition={{ type: 'timing', duration: 200 }}
              >
                <Text style={[s.goalSubtitle, phase === 2 && s.goalSubtitleComplete]}>
                  {weekText}
                </Text>
              </MotiView>
            </AnimatePresence>
          </View>

        </MotiView>

        {/* Middle Content: Capsules + Sarah's message */}
        <AnimatePresence>
          {showCapsules && (
            <MotiView
              key="capsules"
              from={{ opacity: 0, maxHeight: 0, marginTop: 0 }}
              animate={{ opacity: 1, maxHeight: 100, marginTop: 20 }}
              exit={{ opacity: 0, maxHeight: 0, marginTop: 0 }}
              transition={{ type: 'timing', duration: 400 }}
              style={s.middleContentAnimated}
            >
              {/* Progress capsules + streak */}
              <View style={s.progressStreakRow}>
                <View style={s.progressWrap}>
                  <View style={s.capsuleContainer}>
                    {capsuleFilled.map((filled, i) => (
                      <View key={i} style={s.capsule}>
                        <MotiView
                          animate={{ opacity: filled ? 1 : 0 }}
                          transition={{ type: 'timing', duration: 400 }}
                          style={s.capsuleFill}
                        />
                      </View>
                    ))}
                  </View>
                  <Text style={s.progressCount}>{filledCount}/3</Text>
                </View>

                <MotiView
                  animate={{
                    opacity: showStreak ? 1 : 0,
                    scale: showStreak ? 1 : 0.5,
                  }}
                  transition={{ type: 'spring', damping: 18, stiffness: 140 }}
                  style={s.streakBadge}
                >
                  <Text style={s.streakFlame}>🔥</Text>
                  <Text style={s.streakNum}>{Math.max(filledCount, 1)}</Text>
                </MotiView>
              </View>
            </MotiView>
          )}
        </AnimatePresence>

        {/* Sarah's message — persists through reward phase */}
        <AnimatePresence>
          {showEmpower && (
            <MotiView
              key="empower"
              from={{ opacity: 0, translateY: 16, maxHeight: 0, marginTop: 0 }}
              animate={{ opacity: 1, translateY: 0, maxHeight: 150, marginTop: 16 }}
              exit={{ opacity: 0, translateY: -8, maxHeight: 0, marginTop: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 120 }}
              style={s.empowerCardAnimated}
            >
              <Text style={s.empowerMessage}>"I got you that experience you wanted! Finish your goal to earn it" ❤️</Text>
              <Text style={s.empowerAttribution}>— Sarah</Text>
            </MotiView>
          )}
        </AnimatePresence>

        {/* Reward Reveal — single experience card */}
        <AnimatePresence>
          {showReward && rewardExperience && (
            <MotiView
              key="reward"
              from={{ opacity: 0, scale: 0.92, maxHeight: 0, marginTop: 0 }}
              animate={{ opacity: 1, scale: 1, maxHeight: 300, marginTop: 20 }}
              exit={{ opacity: 0, scale: 0.92, maxHeight: 0, marginTop: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 120, delay: 100 }}
              style={s.rewardWrapAnimated}
            >
              <Text style={s.rewardTitle}>You unlocked your reward!</Text>

              <View style={s.rewardCard}>
                <Image
                  source={{ uri: rewardExperience.coverImageUrl }}
                  style={s.rewardImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['transparent', Colors.overlayHeavy]}
                  start={{ x: 0, y: 0.3 }}
                  end={{ x: 0, y: 1 }}
                  style={s.rewardGradient}
                >
                  <View style={s.earnedTag}>
                    <Text style={s.earnedTagText}>You've earned</Text>
                  </View>
                  <Text style={s.rewardExpTitle} numberOfLines={2}>
                    {rewardExperience.title}
                  </Text>
                </LinearGradient>
              </View>

              <Text style={s.scheduleText}>You're ready to schedule your experience</Text>
            </MotiView>
          )}
        </AnimatePresence>

      </MotiView>

      {/* Replay button — appears after animation finishes */}
      <AnimatePresence>
        {finished && (
          <MotiView
            key="replay"
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 140 }}
            style={s.replayRow}
          >
            <TouchableOpacity
              style={s.replayButton}
              activeOpacity={0.75}
              onPress={() => {
                setFinished(false);
                setStep(-1);
                setBarProgress(0);
              }}
            >
              <Text style={s.replayIcon}>↻</Text>
              <Text style={s.replayText}>Replay</Text>
            </TouchableOpacity>
          </MotiView>
        )}
      </AnimatePresence>
    </View >
  );
});

JourneyDemo.displayName = 'JourneyDemo';
export default JourneyDemo;

// ─── Styles ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginVertical: Spacing.huge,
    width: '100%',
  },

  // Replay button
  replayRow: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  replayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.backgroundLight,
  },
  replayIcon: {
    ...Typography.subheading,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  replayText: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Demo card
  card: {
    width: CARD_W,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl,
    paddingTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.backgroundLight,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 8,
    overflow: 'hidden',
    minHeight: 200,
  },

  // Progress bar (inside card, at top)
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.backgroundLight,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.secondary,
  },

  // Phase label
  phaseLabel: {
    marginBottom: Spacing.lg,
  },
  phaseLabelText: {
    ...Typography.tiny,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // Goal header
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  goalEmojiBox: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.infoLight,
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
    ...Typography.heading3,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  goalSubtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  goalSubtitleComplete: {
    color: Colors.primary,
    fontWeight: '700',
  },


  // Middle content (animated)
  middleContentAnimated: {
    overflow: 'hidden',
  },

  // Progress & Streak Row
  progressStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  progressWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  capsuleContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.xxs,
  },
  capsule: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  capsuleFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
  progressCount: {
    ...Typography.caption,
    fontWeight: '800',
    color: Colors.textSecondary,
  },

  // Streak badge
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warningLighter,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  streakFlame: {
    ...Typography.caption,
  },
  streakNum: {
    ...Typography.caption,
    fontWeight: '800',
    color: Colors.warningDark,
  },

  // Empowerment card (animated)
  empowerCardAnimated: {
    backgroundColor: Colors.primarySurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    overflow: 'hidden',
  },
  empowerMessage: {
    ...Typography.small,
    fontStyle: 'italic',
    color: Colors.gray700,
  },
  empowerAttribution: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.primaryDeep,
    marginTop: Spacing.sm,
    textAlign: 'right',
  },

  // Reward reveal (animated)
  rewardWrapAnimated: {
    overflow: 'hidden',
  },
  rewardTitle: {
    ...Typography.body,
    fontWeight: '800',
    color: Colors.primaryDeep,
    textAlign: 'center',
    marginBottom: 14,
  },
  rewardCard: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  rewardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  rewardGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  earnedTag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.whiteAlpha25,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha40,
  },
  earnedTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.3,
  },
  rewardExpTitle: {
    ...Typography.subheading,
    fontWeight: '800',
    color: Colors.white,
    textShadowColor: Colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scheduleText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
    fontStyle: 'italic',
  },
});
