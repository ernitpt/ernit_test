// screens/Recipient/GoalSettingScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  Animated,
  Easing
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Picker } from '@react-native-picker/picker';
import {
  RecipientStackParamList,
  ExperienceGift,
  Goal,
  GoalSegment,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { goalService } from '../../services/GoalService';
import { notificationService } from '../../services/NotificationService';
import { userService } from '../../services/userService';
import MainScreen from '../MainScreen';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator } from 'react-native';
import { experienceService } from '../../services/ExperienceService';

type NavProp = NativeStackNavigationProp<RecipientStackParamList, 'GoalSetting'>;

const GoalSettingScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const { experienceGift } = route.params as { experienceGift: ExperienceGift };
  const { state, dispatch } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [duration, setDuration] = useState(''); // number of weeks or months
  const [durationUnit, setDurationUnit] = useState<'weeks' | 'months'>('weeks');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(''); // required weekly sessions
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // 👈 add this if missing
  const [showConfirm, setShowConfirm] = useState(false);
  const categories = [
    { icon: '🧘', name: 'Yoga' },
    { icon: '🏋️', name: 'Gym' },
    { icon: '🏃‍♀️', name: 'Running' },
    { icon: '💻', name: 'Courses' },
    { icon: '📚', name: 'Education' },
    { icon: '🎹', name: 'Piano' },
    { icon: '✏️', name: 'Other' },
  ];
  const [showDurationWarning, setShowDurationWarning] = useState(false);
  const [showSessionsWarning, setShowSessionsWarning] = useState(false);
  const [showTimeWarning, setShowTimeWarning] = useState(false);

  const sanitizeNumericInput = (text: string) => text.replace(/[^0-9]/g, '');

  const updateGiftStatus = async (experienceGiftId: string) => {
    try {
      const qGift = query(collection(db, 'experienceGifts'), where('id', '==', experienceGiftId));
      const snap = await getDocs(qGift);
      if (snap.empty) return;
      const giftDoc = snap.docs[0];
      await updateDoc(doc(db, 'experienceGifts', giftDoc.id), {
        status: 'claimed',
        recipientId: state.user?.id,
        claimedAt: new Date(),
      });
    } catch (e) {
      console.error('updateGiftStatus error', e);
    }
  };
  const [experience, setExperience] = useState<any>(null);

  useEffect(() => {
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        setExperience(exp);
      } catch (error) {
        console.error("Error fetching experience:", error);
        Alert.alert("Error", "Could not load experience details.");
      }
    };
    fetchExperience();
  }, [experienceGift.experienceId]);
  // 1. Trigger modal first
  const handleNext = () => {
    const finalCategory =
      selectedCategory === 'Other' ? customCategory.trim() : selectedCategory;

    const isTimeCommitmentSet = hours.trim() !== '' || minutes.trim() !== '';
    const durationNum = parseInt(duration);
    const sessionsPerWeekNum = parseInt(sessionsPerWeek);
    const hoursNum = parseInt(hours || '0');
    const minutesNum = parseInt(minutes || '0');

    if (
      !finalCategory ||
      !duration ||
      !sessionsPerWeek ||
      !isTimeCommitmentSet ||
      durationNum <= 0 ||
      sessionsPerWeekNum <= 0 ||
      (hoursNum === 0 && minutesNum === 0)
    ) {
      Alert.alert('Error', 'Please complete all fields before continuing.');
      return;
    }

    // Validate limits: 5 weeks max, 7 sessions/week max
    const totalWeeks = durationUnit === 'weeks' ? durationNum : durationNum * 4;
    if (totalWeeks > 5) {
      Alert.alert('Error', 'The maximum duration is 5 weeks.');
      return;
    }
    if (sessionsPerWeekNum > 7) {
      Alert.alert('Error', 'The maximum is 7 sessions per week.');
      return;
    }
    if (showTimeWarning) {
      Alert.alert('Error', 'Each session cannot exceed 3 hours.');
      return;
    }

    openModal();
  };

  // 2. Run your original logic here
  const confirmCreateGoal = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true); // start loading

    try {
      const finalCategory =
        selectedCategory === 'Other' ? customCategory.trim() : selectedCategory;

      const durationNum = parseInt(duration);
      const sessionsPerWeekNum = parseInt(sessionsPerWeek);
      const hoursNum = parseInt(hours || '0');
      const minutesNum = parseInt(minutes || '0');

      const now = new Date();
      const totalWeeks = durationUnit === 'weeks' ? durationNum : durationNum * 4;
      const durationInDays = totalWeeks * 7;
      const endDate = new Date(now);
      endDate.setDate(now.getDate() + durationInDays);

      // Set approval deadline to 24 hours from now
      const approvalDeadline = new Date(now);
      approvalDeadline.setHours(approvalDeadline.getHours() + 24);

      const goalData: Omit<Goal, 'id'> & { sessionsPerWeek: number } = {
        userId: state.user?.id || 'recipient',
        experienceGiftId: experienceGift.id,
        title: `Attend ${finalCategory} Sessions`,
        description: `Work on ${finalCategory} for ${totalWeeks} weeks, ${sessionsPerWeekNum} times per week.`,
        targetCount: totalWeeks,
        currentCount: 0,
        weeklyCount: 0,
        sessionsPerWeek: sessionsPerWeekNum,
        frequency: 'weekly',
        duration: durationInDays,
        startDate: now,
        endDate,
        weekStartAt: null,
        isActive: true,
        isCompleted: false,
        isRevealed: false,
        location: experience.location || 'Unknown location',
        targetHours: hoursNum,
        targetMinutes: minutesNum,
        segments: [],
        createdAt: now,
        weeklyLogDates: [],
        empoweredBy: experienceGift.giverId,
        // Approval fields
        approvalStatus: 'pending',
        initialTargetCount: totalWeeks,
        initialSessionsPerWeek: sessionsPerWeekNum,
        approvalRequestedAt: now,
        approvalDeadline,
        giverActionTaken: false,
      };

      const goal = await goalService.createGoal(goalData as Goal);
      const recipientName = await userService.getUserName(goalData.userId);

      // Create non-clearable notification for giver
      await notificationService.createNotification(
        goalData.empoweredBy! || '',
        'goal_approval_request',
        `🎯 ${recipientName} set a goal for ${experience.title}`,
        `Goal: ${goalData.description}`,
        {
          giftId: goalData.experienceGiftId,
          goalId: goal.id,
          giverId: goalData.empoweredBy,
          recipientId: goalData.userId,
          experienceTitle: experience.title,
          initialTargetCount: totalWeeks,
          initialSessionsPerWeek: sessionsPerWeekNum,
        },
        false // Not clearable
      );

      await updateGiftStatus(experienceGift.id);
      dispatch({ type: 'SET_GOAL', payload: goal });

      // ✅ Keep modal open until navigation
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Goals' },
          { name: 'Roadmap', params: { goal } },
        ],
      });
    } catch (error) {
      console.error('Error creating goal:', error);
      Alert.alert('Error', 'Failed to create goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const modalAnim = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (isSubmitting) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSubmitting]);

  const openModal = () => {
    setShowConfirm(true);
    Animated.parallel([
      Animated.timing(modalAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(modalScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(modalScale, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => setShowConfirm(false));
  };

  const headerColors = ['#462088ff', '#235c9eff'] as const;
  return (
    <MainScreen activeRoute="Goals">
      <LinearGradient colors={headerColors} style={styles.gradientHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Set Your Goal ✨</Text>
          <Text style={styles.headerSubtitle}>Choose your goal category to get started</Text>

        </View>
      </LinearGradient>
      <ScrollView style={{ flex: 1, padding: 20 }} >

        <View style={styles.categoriesContainer}>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <TouchableOpacity
                key={cat.name}
                onPress={() => setSelectedCategory(cat.name)}
                style={[
                  styles.categoryCard,
                  isSelected ? styles.selectedCategoryCard : styles.unselectedCategoryCard,
                ]}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.categoryName,
                    isSelected ? styles.selectedCategoryName : styles.unselectedCategoryName,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedCategory === 'Other' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Enter your custom goal category</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Painting, Meditation, Learning Guitar..."
              value={customCategory}
              onChangeText={setCustomCategory}
            />
          </View>
        )}

        {/* Duration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Total Duration</Text>
          <Text style={styles.sectionDescription}>How long will you work on this goal?</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }, showDurationWarning && { borderColor: '#d48a1b' }]}
                placeholder="Total"
                value={duration}
                onChangeText={(t) => {
                  const clean = sanitizeNumericInput(t);
                  const num = parseInt(clean || '0');
                  setDuration(clean);

                  if (durationUnit === 'weeks' && num > 5) {
                    setShowDurationWarning(true);
                  } else if (durationUnit === 'months') {
                    // Convert months to weeks: 1 month = 4 weeks, so 5 weeks = 1.25 months
                    // But we'll allow months, just warn if it exceeds 5 weeks equivalent
                    const weeksEquivalent = num * 4;
                    if (weeksEquivalent > 5) {
                      setShowDurationWarning(true);
                    } else {
                      setShowDurationWarning(false);
                    }
                  } else {
                    setShowDurationWarning(false);
                  }
                }}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.dropdownContainer, { flex: 1 }]}>
              <Picker
                selectedValue={durationUnit}
                onValueChange={(v) => {
                  setDurationUnit(v);
                  // Re-check warning when switching units
                  const num = parseInt(duration || '0');
                  if (v === 'weeks' && num > 5) {
                    setShowDurationWarning(true);
                  } else if (v === 'months') {
                    const weeksEquivalent = num * 4;
                    if (weeksEquivalent > 5) {
                      setShowDurationWarning(true);
                    } else {
                      setShowDurationWarning(false);
                    }
                  } else {
                    setShowDurationWarning(false);
                  }
                }}
                style={styles.picker}
              >
                <Picker.Item label="Weeks" value="weeks" />
                <Picker.Item label="Months" value="months" />
              </Picker>
            </View>
          </View>

          {showDurationWarning && (
            <Text style={styles.limitedNotice}>
              The maximum duration is <Text style={{ fontWeight: 'bold' }}>5 weeks</Text>.
            </Text>
          )}
        </View>



        {/* Sessions per week */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sessions per Week</Text>
          <Text style={styles.sectionDescription}>How many times will you do it weekly?</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, showSessionsWarning && { borderColor: '#d48a1b' }]}
                placeholder="Times"
                value={sessionsPerWeek}
                onChangeText={(t) => {
                  const clean = sanitizeNumericInput(t);
                  const num = parseInt(clean || '0');
                  setSessionsPerWeek(clean);

                  if (num > 7) setShowSessionsWarning(true);
                  else setShowSessionsWarning(false);
                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.timeLabel, { marginLeft: 12 }]}>times per week</Text>
          </View>

          {showSessionsWarning && (
            <Text style={styles.limitedNotice}>
              You can’t plan more than <Text style={{ fontWeight: 'bold' }}>7 sessions</Text> per week.
            </Text>
          )}
        </View>


        {/* Time commitment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time Commitment</Text>
          <Text style={styles.sectionDescription}>How long is each session?</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, showTimeWarning && { borderColor: '#d48a1b' }]}
                value={hours}
                onChangeText={(t) => {
                  const clean = sanitizeNumericInput(t);
                  const h = parseInt(clean || '0');
                  let m = parseInt(minutes || '0');
                  setHours(clean);

                  if (h > 3 || (h === 3 && m > 0)) setShowTimeWarning(true);
                  else setShowTimeWarning(false);

                  // Clamp minutes to 0–59
                  if (m > 59) m = 59;
                  setMinutes(m.toString());

                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.timeLabel, { margin: 12 }]}>Hour</Text>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={minutes}
                onChangeText={(t) => {
                  const clean = sanitizeNumericInput(t);
                  const h = parseInt(hours || '0');
                  let m = parseInt(clean || '0');
                  setMinutes(clean);

                  if (h > 3 || (h === 3 && m > 0)) setShowTimeWarning(true);
                  else setShowTimeWarning(false);

                  // Clamp minutes to 0–59
                  if (m > 59) m = 59;
                  setMinutes(m.toString());

                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.timeLabel, { marginLeft: 12 }]}>Min</Text>
          </View>

          {showTimeWarning && (
            <Text style={styles.limitedNotice}>
              Each session can’t exceed <Text style={{ fontWeight: 'bold' }}>3 hours</Text> total.
            </Text>
          )}
        </View>


        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Your Goal:</Text>
          <Text style={styles.summaryText}>
            {selectedCategory
              ? `Attend ${selectedCategory} for ${duration || '?'} ${durationUnit}, ${sessionsPerWeek || '?'}×/week, dedicating ${hours || '0'}h ${minutes || '0'}m each.`
              : 'Select a category and fill the details above.'}
          </Text>
        </View>

        <View style={{ paddingBottom: 30 }}>
          <TouchableOpacity onPress={handleNext} style={styles.nextButton} activeOpacity={0.85}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </View>


      </ScrollView>

      {/* Confirmation Modal */}
      {showConfirm && (
        <Animated.View
          style={[
            styles.modalOverlay,
            { opacity: modalAnim, transform: [{ scale: modalScale }] },
          ]}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Your Goal</Text>
            <Text style={styles.modalSubtitle}>
              Make sure everything looks right before we set it in motion.
            </Text>

            <View style={styles.modalDetails}>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Goal:</Text> {selectedCategory}
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Duration: </Text>
                {duration} {durationUnit}
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Sessions/week: </Text>
                {sessionsPerWeek}
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Per session: </Text>
                {hours || '0'}h {minutes || '0'}m
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={closeModal}
                style={[styles.modalButton, styles.cancelButton]}
                activeOpacity={0.8}
                disabled={isSubmitting} // disable while submitting
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  onPress={confirmCreateGoal}
                  style={[styles.modalButton, styles.confirmButton, isSubmitting && { opacity: 0.9 }]}
                  activeOpacity={0.8}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmText}>Confirm</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </Animated.View>
      )}


    </MainScreen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 24, paddingVertical: 24 },
  gradientHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingTop: 28,
  },
  header: { paddingHorizontal: 24, paddingBottom: 10 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  headerSubtitle: {
    fontSize: 15,
    color: '#e0e7ff',
    // marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6b7280', marginBottom: 24 },
  categoriesContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  categoryCard: {
    width: '30%',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedCategoryCard: { backgroundColor: '#ede9fe', borderColor: '#8b5cf6' },
  unselectedCategoryCard: { backgroundColor: '#f9fafb', borderColor: '#d1d5db' },
  categoryIcon: { fontSize: 32, marginBottom: 8 },
  categoryName: { fontWeight: '500', fontSize: 14 },
  selectedCategoryName: { color: '#7c3aed' },
  unselectedCategoryName: { color: '#374151' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  sectionDescription: { fontSize: 14, color: '#6b7280', marginBottom: 12 },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },

  timeLabel: {
    fontSize: 15,
    color: '#374151',
    alignSelf: 'center',
  },

  row: { flexDirection: 'row', alignItems: 'center' },

  limitedNotice: {
    color: '#d48a1bff', // red-600
    fontSize: 13,
    marginTop: 6,
  },

  dropdownContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    height: 48,
    justifyContent: 'center',
  },
  picker: {
    height: Platform.OS === 'ios' ? 48 : 50,
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    color: '#374151',
    fontSize: 14,
    backgroundColor: '#fff',
  },

  summaryCard: { backgroundColor: '#ede9fe', padding: 16, borderRadius: 12, marginBottom: 20 },
  summaryTitle: { fontSize: 14, fontWeight: '500', color: '#7c3aed', marginBottom: 4 },
  summaryText: { fontSize: 14, color: '#7c3aed' },

  nextButton: { backgroundColor: '#8b5cf6', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  nextButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 999,
  },

  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxWidth: 360,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4c1d95',
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    textAlign: 'center',
  },

  modalGoal: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0e0718ff',
    textAlign: 'center',
    marginBottom: 10,
  },

  modalDetails: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  modalRow: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 4,
  },

  modalLabel: {
    fontWeight: '600',
    color: '#6d28d9',
  },

  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 10,
  },

  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },

  cancelButton: {
    backgroundColor: '#f3f4f6',
  },

  confirmButton: {
    backgroundColor: '#7c3aed',
  },

  cancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
  },

  confirmText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },

});

export default GoalSettingScreen;
