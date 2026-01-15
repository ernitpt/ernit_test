import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, Image, TouchableOpacity
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { RecipientStackParamList, Goal, ExperienceGift } from '../../types';
import MainScreen from '../MainScreen';
import DetailedGoalCard from './DetailedGoalCard';
import GoalChangeSuggestionModal from '../../components/GoalChangeSuggestionModal';
import { goalService } from '../../services/GoalService';
import { notificationService } from '../../services/NotificationService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import SharedHeader from '../../components/SharedHeader';
import HintPopup from '../../components/HintPopup';
import AudioPlayer from '../../components/AudioPlayer';
import ImageViewer from '../../components/ImageViewer';
import { logger } from '../../utils/logger';

type Nav = NativeStackNavigationProp<RecipientStackParamList, 'Roadmap'>;

const RoadmapScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { goal?: Goal } | undefined;
  const passedGoal = routeParams?.goal;

  const [currentGoal, setCurrentGoal] = useState<Goal | null>(passedGoal || null);
  const [experienceGift, setExperienceGift] = useState<ExperienceGift | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // 🔹 Redirect if no goal passed (e.g., on browser refresh)
  useEffect(() => {
    if (!passedGoal) {
      logger.warn('No goal passed to RoadmapScreen, redirecting to Goals');
      navigation.navigate('Goals' as any);
    }
  }, [passedGoal, navigation]);

  // 🔹 Keep goal synced with Firestore
  useEffect(() => {
    if (!currentGoal?.id) return;

    const ref = doc(db, 'goals', currentGoal.id);
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const updatedGoal = { id: snap.id, ...snap.data() } as Goal;
        setCurrentGoal(updatedGoal);

        // Check for auto-approval
        if (updatedGoal.approvalStatus === 'pending' && updatedGoal.approvalDeadline) {
          const now = new Date();
          if (now >= updatedGoal.approvalDeadline && !updatedGoal.giverActionTaken) {
            await goalService.checkAndAutoApprove(currentGoal.id);
          }
        }
      }
    });
    return () => unsub();
  }, [currentGoal?.id]);

  // 🔹 Fetch experience gift to get personalized message
  useEffect(() => {
    const fetchExperienceGift = async () => {
      if (currentGoal?.experienceGiftId) {
        try {
          const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
          if (gift) {
            setExperienceGift(gift);
          }
        } catch (error) {
          logger.error('Error fetching experience gift:', error);
        }
      }
    };
    fetchExperienceGift();
  }, [currentGoal?.experienceGiftId]);

  const fmtDateTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const hintsArray = currentGoal && Array.isArray(currentGoal.hints)
    ? currentGoal.hints
    : currentGoal?.hints
      ? [currentGoal.hints]
      : [];

  const HintItem = ({ hint, index, fmtDateTime }: any) => {
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

    // Determine hint content
    const isAudio = hint.type === 'audio' || hint.type === 'mixed';
    const hasImage = hint.imageUrl || (hint.type === 'mixed' && hint.imageUrl);
    const text = hint.text || hint.hint; // Fallback to old 'hint' field

    // Handle date
    let dateMs = 0;
    if (hint.createdAt) {
      if (typeof hint.createdAt.toMillis === 'function') {
        dateMs = hint.createdAt.toMillis();
      } else if (hint.createdAt instanceof Date) {
        dateMs = hint.createdAt.getTime();
      } else {
        // Fallback if it's a string or number
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
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <Text style={{ fontWeight: '700', color: '#111827', marginBottom: 4 }}>
          {fmtDateTime(dateMs)}
        </Text>

        {hasImage && hint.imageUrl && (
          <TouchableOpacity
            onPress={() => setSelectedImageUri(hint.imageUrl)}
            activeOpacity={0.9}
          >
            <Image source={{ uri: hint.imageUrl }} style={styles.hintImage} />
          </TouchableOpacity>
        )}

        {text && <Text style={{ color: '#374151', fontSize: 15, lineHeight: 22, marginBottom: isAudio ? 8 : 0 }}>{text}</Text>}

        {isAudio && hint.audioUrl && (
          <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
        )}
      </Animated.View>
    );
  };

  // Show loading/redirect state when goal is not available
  if (!currentGoal) {
    return (
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <SharedHeader title="Roadmap" showBack />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#6b7280', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <SharedHeader
        title="Roadmap"
        showBack
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 20,
          alignItems: 'center', // centers horizontally
        }}
      >
        <View
          pointerEvents="box-none"
          style={{
            width: '100%',
            maxWidth: 380,
            paddingHorizontal: 16,
          }}
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

          {/* DetailedGoalCard with pointerEvents to allow button touches */}
          <View pointerEvents="box-none">
            <DetailedGoalCard goal={currentGoal} onFinish={(g) => setCurrentGoal(g)} />
          </View>
        </View>


        <View style={styles.card}>
          <Text style={styles.title}>Hint History</Text>

          {hintsArray.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💡</Text>
              <Text style={styles.emptyText}>No hints revealed yet</Text>
              <Text style={styles.emptySubText}>
                Hints will appear here as you progress through your sessions.
              </Text>
            </View>
          ) : (
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
                    // Proper type guard instead of @ts-ignore
                    if (h.createdAt && typeof h.createdAt === 'object' && 'toMillis' in h.createdAt && typeof h.createdAt.toMillis === 'function') {
                      dateMs = h.createdAt.toMillis();
                    } else if (h.createdAt instanceof Date) {
                      dateMs = h.createdAt.getTime();
                    } else {
                      dateMs = new Date(h.createdAt).getTime();
                    }
                  } else if (h.date) {
                    dateMs = h.date;
                  }
                  return <HintItem key={`${session}-${dateMs}`} hint={h} index={i} fmtDateTime={fmtDateTime} />;
                })}
            </View>
          )}
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
  cardWrapper: { marginTop: 16, marginBottom: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  messageCard: {
    backgroundColor: '#ede9fe',
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
    color: '#6d28d9',
    marginTop: 10,
    fontWeight: '600',
  },


  title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  // emptyText: {
  //   textAlign: 'center',
  //   color: '#6b7280',
  //   marginTop: 10,
  //   fontSize: 16,
  // },
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
    marginTop: 10,
    position: 'relative',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
    position: 'relative',
  },
  timelineDotContainer: {
    width: 26,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8b5cf6',
    borderWidth: 2,
    borderColor: '#ede9fe',
  },
  timelineLine: {
    position: 'absolute',
    left: 13,
    top: 10,
    bottom: -8,
    width: 2,
    backgroundColor: '#e5e7eb',
  },
  hintCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  hintTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#111827',
    marginBottom: 4,
  },
  hintDate: {
    fontWeight: '400',
    fontSize: 13,
    color: '#6b7280',
  },
  hintText: {
    fontSize: 15,
    color: '#374151',
    fontStyle: 'italic',
  },
  approvalBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  approvalBannerText: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 20,
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    borderRadius: 20,
    padding: 8,
    paddingRight: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioProgress: {
    width: 100,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginRight: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
  },
  audioDuration: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  hintImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
  },
});

export default RoadmapScreen;
