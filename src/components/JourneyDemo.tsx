import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, AnimatePresence } from 'moti';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Experience } from '../types';
import Colors from '../config/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 48, 400);

// Step machine: -1 = hidden, 0-9 = visible steps
type Step = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// Phase labels
const PHASES = ['Set Goal', 'Build Habit', 'Get Reward'] as const;

// ─── JourneyDemo ─────────────────────────────────────────────────────
const JourneyDemo: React.FC = React.memo(() => {
  const [step, setStep] = useState<Step>(-1);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [barProgress, setBarProgress] = useState(0);
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
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Experience))
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
      case 6: next(7, 1000); break;   // middle content fades, reward appears
      case 7: next(8, 5000); break;   // hold on reward
      case 8: next(9, 600); break;    // fade everything out
      case 9:                         // reset for next loop
        timeout = setTimeout(() => setStep(-1), 1000);
        break;
    }
    return () => clearTimeout(timeout);
  }, [step, hasStarted]);

  // Gradual progress bar — fills independently, snaps to 100% on reward unlock
  useEffect(() => {
    if (step < 0 || step >= 8) {
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
  const visible = step >= 0 && step < 9;
  const fading = step === 9;

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
          opacity: fading ? 0 : (visible ? 1 : 0),
          scale: fading ? 0.95 : (visible ? 1 : 0.95),
        }}
        transition={{ type: 'timing', duration: fading ? 500 : 400 }}
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
        {showCapsules && (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 300 }}
            style={s.middleContent}
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
                style={s.streakBadge}
              >
                <Text style={s.streakFlame}>🔥</Text>
                <Text style={s.streakNum}>{Math.max(filledCount, 1)}</Text>
              </MotiView>
            </View>
          </MotiView>
        )}

        {/* Sarah's message — persists through reward phase */}
        {showEmpower && (
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 120 }}
            style={s.empowerCard}
          >
            <Text style={s.empowerMessage}>"I got you that experience you wanted! Finish your goal to earn it" ❤️</Text>
            <Text style={s.empowerAttribution}>— Sarah</Text>
          </MotiView>
        )}

        {/* Reward Reveal — single experience card */}
        {showReward && rewardExperience && (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 22, stiffness: 120, delay: 200 }}
            style={s.rewardWrap}
          >
            <Text style={s.rewardTitle}>You unlocked your reward!</Text>

            <View style={s.rewardCard}>
              <Image
                source={{ uri: rewardExperience.coverImageUrl }}
                style={s.rewardImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)']}
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

      </MotiView>
    </View >
  );
});

JourneyDemo.displayName = 'JourneyDemo';
export default JourneyDemo;

// ─── Styles ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginVertical: 40,
    width: '100%',
  },

  // Demo card
  card: {
    width: CARD_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
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
    backgroundColor: '#F3F4F6',
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.secondary,
  },

  // Phase label
  phaseLabel: {
    marginBottom: 16,
  },
  phaseLabelText: {
    fontSize: 11,
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


  // Middle content
  middleContent: {
    marginTop: 20,
    gap: 16,
  },

  // Progress & Streak Row
  progressStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  capsuleContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
  },
  capsule: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  capsuleFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
  progressCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
  },

  // Streak badge
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 5,
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

  // Empowerment card
  empowerCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  empowerMessage: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#374151',
    lineHeight: 20,
  },
  empowerAttribution: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDeep,
    marginTop: 8,
    textAlign: 'right',
  },

  // Reward reveal
  rewardWrap: {
    marginTop: 20,
  },
  rewardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primaryDeep,
    textAlign: 'center',
    marginBottom: 14,
  },
  rewardCard: {
    width: '100%',
    height: 160,
    borderRadius: 16,
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
    padding: 16,
    gap: 6,
  },
  earnedTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  earnedTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  rewardExpTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scheduleText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
