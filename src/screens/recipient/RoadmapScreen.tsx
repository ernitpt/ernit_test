import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { RecipientStackParamList, Goal, ExperienceGift } from '../../types';
import MainScreen from '../MainScreen';
import DetailedGoalCard from './DetailedGoalCard';
import GoalChangeSuggestionModal from '../../components/GoalChangeSuggestionModal';
import { goalService } from '../../services/GoalService';
import { notificationService } from '../../services/NotificationService';
import { experienceGiftService } from '../../services/ExperienceGiftService';

type Nav = NativeStackNavigationProp<RecipientStackParamList, 'Roadmap'>;

const RoadmapScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const { goal } = route.params as { goal: Goal };
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [experienceGift, setExperienceGift] = useState<ExperienceGift | null>(null);

  // 🔹 Keep goal synced with Firestore
  useEffect(() => {
    const ref = doc(db, 'goals', goal.id);
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const updatedGoal = snap.data() as Goal;
        setCurrentGoal(updatedGoal);
        
        // Check for auto-approval
        if (updatedGoal.approvalStatus === 'pending' && updatedGoal.approvalDeadline) {
          const now = new Date();
          if (now >= updatedGoal.approvalDeadline && !updatedGoal.giverActionTaken) {
            await goalService.checkAndAutoApprove(goal.id);
          }
        }
      }
    });
    return () => unsub();
  }, [goal.id]);

  // 🔹 Fetch experience gift to get personalized message
  useEffect(() => {
    const fetchExperienceGift = async () => {
      if (goal.experienceGiftId) {
        try {
          const gift = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
          if (gift) {
            setExperienceGift(gift);
          }
        } catch (error) {
          console.error('Error fetching experience gift:', error);
        }
      }
    };
    fetchExperienceGift();
  }, [goal.experienceGiftId]);

  const headerColors = ['#462088ff', '#235c9eff'] as const;

  const fmtDateTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const hintsArray = Array.isArray(currentGoal.hints)
    ? currentGoal.hints
    : currentGoal.hints
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
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <Text style={{ fontWeight: '700', color: '#111827' }}>
          {fmtDateTime(hint.date)} {/*Session {hint.sessionNumber} — */}
        </Text>
        <Text style={{ marginTop: 6, color: '#111827' }}>{hint.hint}</Text>
      </Animated.View>
    );
  };

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <LinearGradient colors={headerColors} style={styles.gradientHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Roadmap</Text>
        </View>
      </LinearGradient>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: 20,
        paddingBottom: 20,
        alignItems: 'center', // centers horizontally
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 380,       // ✅ limit horizontal size
          paddingHorizontal: 16, // optional for margins
        }}
      >
        {/* Personalized Message Card */}
        {experienceGift?.personalizedMessage?.trim() && (
  <View style={styles.messageCard}>
    <Text style={styles.messageText}>
      “{experienceGift.personalizedMessage.trim()}”
    </Text>
    <Text style={styles.messageFrom}>— {experienceGift.giverName}</Text>
  </View>
)}



        <DetailedGoalCard goal={currentGoal} onFinish={(g) => setCurrentGoal(g)} />
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
                .sort((a, b) => Number(b.session) - Number(a.session))
                .map((h, i) => (
                  <HintItem key={`${h.session}-${h.date}`} hint={h} index={i} fmtDateTime={fmtDateTime} />
                ))}
            </View> 
          )}
        </View>
      </ScrollView>
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  gradientHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingTop: 28,
  },
  header: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 10 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
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
});

export default RoadmapScreen;
