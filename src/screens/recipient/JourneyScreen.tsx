import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, Image, TouchableOpacity
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { RecipientStackParamList, Goal, ExperienceGift, SessionRecord } from '../../types';
import MainScreen from '../MainScreen';
import DetailedGoalCard from './DetailedGoalCard';
import { goalService } from '../../services/GoalService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { sessionService } from '../../services/SessionService';
import SharedHeader from '../../components/SharedHeader';
import AudioPlayer from '../../components/AudioPlayer';
import ImageViewer from '../../components/ImageViewer';
import { Clock, PlayCircle, Gift, ShoppingBag, Check } from 'lucide-react-native';
import { logger } from '../../utils/logger';
import Colors from '../../config/colors';

type Nav = NativeStackNavigationProp<RecipientStackParamList, 'Journey'>;

// ─── Segmented Tab Control ───────────────────────────────────────────────────
const TAB_SESSIONS = 'Sessions';
const TAB_HINTS = 'Hints';
type TabKey = typeof TAB_SESSIONS | typeof TAB_HINTS;

const SegmentedControl = ({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) => {
  const slideAnim = useRef(new Animated.Value(activeTab === TAB_SESSIONS ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTab === TAB_SESSIONS ? 0 : 1,
      useNativeDriver: false,
      damping: 18,
      stiffness: 200,
    }).start();
  }, [activeTab]);

  return (
    <View style={segStyles.container}>
      <Animated.View
        style={[
          segStyles.slider,
          {
            left: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['2%', '50%'],
            }),
          },
        ]}
      />
      {[TAB_SESSIONS, TAB_HINTS].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={segStyles.tab}
          onPress={() => onTabChange(tab as TabKey)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              segStyles.tabLabel,
              activeTab === tab && segStyles.tabLabelActive,
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    position: 'relative',
  },
  slider: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
  },
  tabLabelActive: {
    color: Colors.primaryDark,
  },
});

// ─── Session Card ────────────────────────────────────────────────────────────
const SessionCard = ({ session, index }: { session: SessionRecord; index: number }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 80,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const fmtTime = (d: Date) =>
    new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  return (
    <Animated.View
      style={[
        sessStyles.card,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      {/* Left: session badge */}
      <View style={sessStyles.badge}>
        <Text style={sessStyles.badgeText}>#{session.sessionNumber}</Text>
      </View>

      {/* Middle: details */}
      <View style={sessStyles.details}>
        <Text style={sessStyles.date}>
          {fmtDate(session.timestamp)} · {fmtTime(session.timestamp)}
        </Text>
        <View style={sessStyles.metaRow}>
          <Clock size={13} color={Colors.textSecondary} />
          <Text style={sessStyles.metaText}>{fmtDuration(session.duration)}</Text>
          <Text style={sessStyles.weekBadge}>Week {session.weekNumber}</Text>
        </View>
      </View>

      {/* Right: media thumbnail (if any) */}
      {session.mediaUrl && (
        <View style={sessStyles.thumb}>
          <Image source={{ uri: session.mediaUrl }} style={sessStyles.thumbImg} />
          {session.mediaType === 'video' && (
            <View style={sessStyles.videoOverlay}>
              <PlayCircle size={18} color="#fff" />
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const sessStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  details: { flex: 1 },
  date: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  weekBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    marginLeft: 8,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
const JourneyScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const routeParams = route.params as { goal?: Goal } | undefined;
  const passedGoal = routeParams?.goal;

  const [currentGoal, setCurrentGoal] = useState<Goal | null>(passedGoal || null);
  const [experienceGift, setExperienceGift] = useState<ExperienceGift | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_SESSIONS);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Redirect if no goal
  useEffect(() => {
    if (!passedGoal) {
      logger.warn('No goal passed to JourneyScreen, redirecting to Goals');
      navigation.navigate('Goals' as any);
    }
  }, [passedGoal, navigation]);

  // Keep goal synced with Firestore
  useEffect(() => {
    if (!currentGoal?.id) return;
    const ref = doc(db, 'goals', currentGoal.id);
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const updatedGoal = { id: snap.id, ...snap.data() } as Goal;
        setCurrentGoal(updatedGoal);
        if (
          updatedGoal.approvalStatus === 'pending' &&
          updatedGoal.approvalDeadline
        ) {
          const now = new Date();
          if (now >= updatedGoal.approvalDeadline && !updatedGoal.giverActionTaken) {
            await goalService.checkAndAutoApprove(currentGoal.id);
          }
        }
      }
    });
    return () => unsub();
  }, [currentGoal?.id]);

  // Fetch experience gift
  useEffect(() => {
    const fetchExperienceGift = async () => {
      if (currentGoal?.experienceGiftId) {
        try {
          const gift = await experienceGiftService.getExperienceGiftById(
            currentGoal.experienceGiftId
          );
          if (gift) setExperienceGift(gift);
        } catch (error) {
          logger.error('Error fetching experience gift:', error);
        }
      }
    };
    fetchExperienceGift();
  }, [currentGoal?.experienceGiftId]);

  // Fetch sessions when tab changes to Sessions, or when screen refocuses
  const loadSessions = useCallback(async () => {
    if (!currentGoal?.id) return;
    setSessionsLoading(true);
    try {
      const data = await sessionService.getSessionsForGoal(currentGoal.id);
      setSessions(data);
    } catch (error) {
      logger.error('Error fetching sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  }, [currentGoal?.id]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === TAB_SESSIONS) {
        loadSessions();
      }
    }, [activeTab, loadSessions])
  );

  useEffect(() => {
    if (activeTab === TAB_SESSIONS) {
      loadSessions();
    }
  }, [activeTab]);

  // ─── Hints data ──────────────────────────────────────────────────────────
  const hintsArray =
    currentGoal && Array.isArray(currentGoal.hints)
      ? currentGoal.hints
      : currentGoal?.hints
        ? [currentGoal.hints]
        : [];

  const fmtDateTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  // ─── Hint Item subcomponent ──────────────────────────────────────────────
  const HintItem = ({ hint, index, fmtDateTime: fmt }: any) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: index * 100,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }, []);

    const isAudio = hint.type === 'audio' || hint.type === 'mixed';
    const hasImage = hint.imageUrl || (hint.type === 'mixed' && hint.imageUrl);
    const text = hint.text || hint.hint;

    let dateMs = 0;
    if (hint.createdAt) {
      if (typeof hint.createdAt.toMillis === 'function') {
        dateMs = hint.createdAt.toMillis();
      } else if (hint.createdAt instanceof Date) {
        dateMs = hint.createdAt.getTime();
      } else {
        dateMs = new Date(hint.createdAt).getTime();
      }
    } else if (hint.date) {
      dateMs = hint.date;
    }

    return (
      <Animated.View
        style={{
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <Text style={{ fontWeight: '700', color: '#111827', marginBottom: 4 }}>
          {fmt(dateMs)}
        </Text>

        {hasImage && hint.imageUrl && (
          <TouchableOpacity
            onPress={() => setSelectedImageUri(hint.imageUrl)}
            activeOpacity={0.9}
          >
            <Image source={{ uri: hint.imageUrl }} style={styles.hintImage} />
          </TouchableOpacity>
        )}

        {text && (
          <Text
            style={{
              color: '#374151',
              fontSize: 15,
              lineHeight: 22,
              marginBottom: isAudio ? 8 : 0,
            }}
          >
            {text}
          </Text>
        )}

        {isAudio && hint.audioUrl && (
          <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
        )}
      </Animated.View>
    );
  };

  // ─── Sessions Tab Content ────────────────────────────────────────────────
  const renderSessionsTab = () => {
    if (sessionsLoading && sessions.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading sessions…</Text>
        </View>
      );
    }

    if (sessions.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🏃</Text>
          <Text style={styles.emptyText}>No sessions yet</Text>
          <Text style={styles.emptySubText}>
            Complete your first session and it will show up here.
          </Text>
        </View>
      );
    }

    return (
      <View>
        {sessions.map((s, i) => (
          <SessionCard key={s.id} session={s} index={i} />
        ))}
      </View>
    );
  };

  // ─── Hints Tab Content ───────────────────────────────────────────────────
  const renderHintsTab = () => {
    if (hintsArray.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💡</Text>
          <Text style={styles.emptyText}>No hints revealed yet</Text>
          <Text style={styles.emptySubText}>
            Hints will appear here as you progress through your sessions.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.timeline}>
        {hintsArray
          .slice()
          .sort((a: any, b: any) => {
            const sessionA = a.forSessionNumber || a.session || 0;
            const sessionB = b.forSessionNumber || b.session || 0;
            return Number(sessionB) - Number(sessionA);
          })
          .map((h: any, i) => {
            const session = h.forSessionNumber || h.session || 0;
            let dateMs = 0;
            if (h.createdAt) {
              if (
                h.createdAt &&
                typeof h.createdAt === 'object' &&
                'toMillis' in h.createdAt &&
                typeof h.createdAt.toMillis === 'function'
              ) {
                dateMs = h.createdAt.toMillis();
              } else if (h.createdAt instanceof Date) {
                dateMs = h.createdAt.getTime();
              } else {
                dateMs = new Date(h.createdAt).getTime();
              }
            } else if (h.date) {
              dateMs = h.date;
            }
            return (
              <HintItem
                key={`${session}-${dateMs}`}
                hint={h}
                index={i}
                fmtDateTime={fmtDateTime}
              />
            );
          })}
      </View>
    );
  };

  // ─── Loading / redirect state ────────────────────────────────────────────
  if (!currentGoal) {
    return (
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <SharedHeader title="Journey" showBack />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#6b7280', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <SharedHeader title="Journey" showBack />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 20,
          alignItems: 'center',
        }}
      >
        <View
          pointerEvents="box-none"
          style={{ width: '100%', maxWidth: 380, paddingHorizontal: 16 }}
        >
          {/* Personalized Message Card */}
          {experienceGift?.personalizedMessage?.trim() && (
            <View style={styles.messageCard}>
              <Text style={styles.messageText}>
                "{experienceGift.personalizedMessage.trim()}"
              </Text>
              <Text style={styles.messageFrom}>— {experienceGift.giverName}</Text>
            </View>
          )}

          {/* DetailedGoalCard */}
          <View pointerEvents="box-none">
            <DetailedGoalCard goal={currentGoal} onFinish={(g) => setCurrentGoal(g)} />
          </View>
        </View>

        {/* ─── Pledged Experience Showcase (free goals) ──────────────── */}
        {currentGoal.isFreeGoal && currentGoal.pledgedExperience && (
          <View style={styles.experienceShowcase}>
            {currentGoal.pledgedExperience.coverImageUrl ? (
              <Image
                source={{ uri: currentGoal.pledgedExperience.coverImageUrl }}
                style={styles.experienceCover}
              />
            ) : null}
            <View style={styles.experienceInfo}>
              <View style={styles.experienceHeader}>
                <Text style={styles.experienceLabel}>Your Reward</Text>
                {currentGoal.pledgedExperience.price > 0 && (
                  <Text style={styles.experiencePrice}>
                    ${currentGoal.pledgedExperience.price}
                  </Text>
                )}
              </View>
              <Text style={styles.experienceTitle} numberOfLines={2}>
                {currentGoal.pledgedExperience.title}
              </Text>
              {(() => {
                const total = currentGoal.targetCount * currentGoal.sessionsPerWeek;
                const done = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
                const pct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
                return (
                  <View style={styles.experienceProgressArea}>
                    <View style={styles.experienceProgressTrack}>
                      <View style={[styles.experienceProgressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.experienceProgressLabel}>
                      {done}/{total} sessions to earn this
                    </Text>
                  </View>
                );
              })()}

              {/* Buy / Gift Received button */}
              {currentGoal.giftAttachedAt ? (
                <View style={styles.giftReceivedBadge}>
                  <Check size={14} color={Colors.primary} strokeWidth={3} />
                  <Text style={styles.giftReceivedText}>Gift Received</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.buyButton}
                  activeOpacity={0.8}
                  onPress={() => (navigation as any).navigate('ExperienceCheckout', {
                    cartItems: [{ experienceId: currentGoal.pledgedExperience!.experienceId, quantity: 1 }],
                    goalId: currentGoal.id,
                  })}
                >
                  <ShoppingBag size={15} color="#fff" />
                  <Text style={styles.buyButtonText}>
                    {currentGoal.pledgedExperience!.price > 0
                      ? `Buy Now · €${currentGoal.pledgedExperience!.price}`
                      : 'Get This Experience'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ─── Segmented Tabs Section ──────────────────────────────────── */}
        <View style={styles.tabSection}>
          <SegmentedControl activeTab={activeTab} onTabChange={setActiveTab} />

          <View style={styles.tabContent}>
            {activeTab === TAB_SESSIONS ? renderSessionsTab() : renderHintsTab()}
          </View>
        </View>

      </ScrollView>

      {/* Fullscreen Image Viewer */}
      {selectedImageUri && (
        <ImageViewer
          visible={!!selectedImageUri}
          imageUri={selectedImageUri}
          onClose={() => setSelectedImageUri(null)}
        />
      )}
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  messageCard: {
    backgroundColor: Colors.primarySurface,
    padding: 20,
    borderRadius: 18,
    marginBottom: 20,
  },
  messageText: {
    fontSize: 17,
    color: '#4c1d95',
    lineHeight: 26,
    fontWeight: '500',
  },
  messageFrom: {
    fontSize: 14,
    color: Colors.primaryDeep,
    marginTop: 10,
    fontWeight: '600',
  },
  tabSection: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  tabContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  timeline: {
    marginTop: 4,
  },
  hintImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
  },
  // ── Experience Showcase ──
  experienceShowcase: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  experienceCover: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  experienceInfo: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#e5e7eb',
  },
  experienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  experienceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  experiencePrice: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  experienceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    lineHeight: 22,
  },
  experienceProgressArea: {
    gap: 4,
  },
  experienceProgressTrack: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  experienceProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  experienceProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.secondary,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  giftReceivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primarySurface,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  giftReceivedText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
});

export default JourneyScreen;
