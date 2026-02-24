// screens/Recipient/PledgeGoalSettingScreen.tsx
// Simplified GoalSettingScreen for Free Goals (The Pledge) - no gift claim, no AI hints
import React, { useRef, useState } from 'react';
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
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Picker } from '@react-native-picker/picker';
import { CustomCalendar } from '../../components/CustomCalendar';
import { RootStackParamList, Experience, Goal } from '../../types';
import { useApp } from '../../context/AppContext';
import { goalService } from '../../services/GoalService';
import MainScreen from '../MainScreen';
import SharedHeader from '../../components/SharedHeader';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { commonStyles } from '../../styles/commonStyles';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import Colors from '../../config/colors';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PledgeGoalSetting'>;

const PledgeGoalSettingScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const routeParams = route.params as { experience?: Experience } | undefined;
  const experience = routeParams?.experience;

  const hasValidData = Boolean(experience?.id);

  // Redirect if data is missing (e.g., after page refresh)
  React.useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing experience on PledgeGoalSettingScreen, redirecting to CategorySelection');
      navigation.reset({
        index: 0,
        routes: [{ name: 'CategorySelection' }],
      });
    }
  }, [hasValidData, navigation]);

  if (!hasValidData || !experience) {
    return (
      <MainScreen activeRoute="Goals">
        <SharedHeader title="Set Your Goal" showBack={false} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.secondary} />
          <Text style={{ marginTop: 20, color: '#6b7280', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  const { state, dispatch } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<'weeks' | 'months'>('weeks');
  const [sessionsPerWeek, setSessionsPerWeek] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [plannedStartDate, setPlannedStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDurationWarning, setShowDurationWarning] = useState(false);
  const [showSessionsWarning, setShowSessionsWarning] = useState(false);
  const [showTimeWarning, setShowTimeWarning] = useState(false);

  const categories = [
    { icon: '\u{1F9D8}', name: 'Yoga' },
    { icon: '\u{1F3CB}\u{FE0F}', name: 'Gym' },
    { icon: '\u{1F3C3}\u{200D}\u{2640}\u{FE0F}', name: 'Running' },
    { icon: '\u{1F4BB}', name: 'Courses' },
    { icon: '\u{1F4DA}', name: 'Education' },
    { icon: '\u{1F3B9}', name: 'Piano' },
    { icon: '\u{270F}\u{FE0F}', name: 'Other' },
  ];

  const sanitizeNumericInput = (text: string) => text.replace(/[^0-9]/g, '');

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

    // No hint generation for free goals - open confirmation directly
    openModal();
  };

  const confirmCreateGoal = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

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

      const goalData: Omit<Goal, 'id'> & { sessionsPerWeek: number } = {
        userId: state.user?.id || '',
        experienceGiftId: '', // Empty for free goals
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
        plannedStartDate: plannedStartDate,
        isActive: true,
        isCompleted: false,
        isRevealed: false,
        location: experience.location || '',
        targetHours: hoursNum,
        targetMinutes: minutesNum,
        createdAt: now,
        weeklyLogDates: [],
        // Free goal specific
        isFreeGoal: true,
        pledgedExperience: {
          experienceId: experience.id,
          title: experience.title,
          subtitle: experience.subtitle,
          description: experience.description,
          category: experience.category,
          price: experience.price,
          coverImageUrl: experience.coverImageUrl,
          imageUrl: experience.imageUrl,
          partnerId: experience.partnerId,
          location: experience.location,
        },
        pledgedAt: now,
        empoweredBy: state.user?.id || '', // Self-empowered
        approvalStatus: 'approved', // Auto-approved (no giver)
        initialTargetCount: totalWeeks,
        initialSessionsPerWeek: sessionsPerWeekNum,
        approvalRequestedAt: now,
        approvalDeadline: now, // Not relevant for free goals
        giverActionTaken: true, // No giver action needed
      };

      const goal = await goalService.createFreeGoal(goalData as Goal);
      dispatch({ type: 'SET_GOAL', payload: goal });

      // Navigate to Roadmap
      setShowConfirm(false);
      navigation.reset({
        index: 1,
        routes: [
          { name: 'CategorySelection' },
          { name: 'Roadmap', params: { goal } },
        ],
      });

    } catch (error) {
      logger.error('Error creating free goal:', error);
      await logErrorToFirestore(error, {
        screenName: 'PledgeGoalSettingScreen',
        feature: 'CreateFreeGoal',
        userId: state.user?.id,
        additionalData: {
          experienceId: experience.id,
          category: selectedCategory === 'Other' ? customCategory : selectedCategory,
        },
      });
      Alert.alert('Error', 'Failed to create goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const slideAnim = useModalAnimation(showConfirm);
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

  const openModal = () => setShowConfirm(true);
  const closeModal = () => setShowConfirm(false);

  return (
    <MainScreen activeRoute="Goals">
      <SharedHeader
        title="Set Your Goal"
        subtitle={`Pledge: ${experience.title}`}
      />
      <ScrollView style={{ flex: 1, padding: 20 }}>

        {/* Pledged Experience Card */}
        <View style={styles.pledgeCard}>
          <Text style={styles.pledgeLabel}>Your Motivation</Text>
          <Text style={styles.pledgeTitle}>{experience.title}</Text>
          <Text style={styles.pledgeSubtitle}>{experience.subtitle}</Text>
        </View>

        {/* Category Selection */}
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
                    const weeksEquivalent = num * 4;
                    setShowDurationWarning(weeksEquivalent > 5);
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
                  const num = parseInt(duration || '0');
                  if (v === 'weeks' && num > 5) {
                    setShowDurationWarning(true);
                  } else if (v === 'months') {
                    setShowDurationWarning(num * 4 > 5);
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
                  setShowSessionsWarning(num > 7);
                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.timeLabel, { marginLeft: 12 }]}>times per week</Text>
          </View>

          {showSessionsWarning && (
            <Text style={styles.limitedNotice}>
              You can't plan more than <Text style={{ fontWeight: 'bold' }}>7 sessions</Text> per week.
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
                  const m = parseInt(minutes || '0');
                  setHours(clean);
                  setShowTimeWarning(h > 3 || (h === 3 && m > 0));
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
                  if (m > 59) m = 59;
                  setMinutes(m.toString());
                  setShowTimeWarning(h > 3 || (h === 3 && m > 0));
                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.timeLabel, { marginLeft: 12 }]}>Min</Text>
          </View>

          {showTimeWarning && (
            <Text style={styles.limitedNotice}>
              Each session can't exceed <Text style={{ fontWeight: 'bold' }}>3 hours</Text> total.
            </Text>
          )}
        </View>

        {/* Planned Start Date */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When do you want to start?</Text>
          <Text style={styles.sectionDescription}>
            This helps us send you reminders at the right time
          </Text>

          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={styles.dateButton}
            activeOpacity={0.7}
          >
            <Text style={styles.dateButtonText}>
              {plannedStartDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text style={{ fontSize: 20 }}>{'\u{1F4C5}'}</Text>
          </TouchableOpacity>

          <CustomCalendar
            visible={showDatePicker}
            selectedDate={plannedStartDate}
            onSelectDate={(date) => setPlannedStartDate(date)}
            onClose={() => setShowDatePicker(false)}
            minimumDate={new Date()}
          />
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Your Goal:</Text>
          <Text style={styles.summaryText}>
            {selectedCategory
              ? `Attend ${selectedCategory} for ${duration || '?'} ${durationUnit}, ${sessionsPerWeek || '?'}x/week, dedicating ${hours || '0'}h ${minutes || '0'}m each.`
              : 'Select a category and fill the details above.'}
          </Text>
        </View>

        <View style={{ paddingBottom: 30 }}>
          <TouchableOpacity onPress={handleNext} style={styles.nextButton} activeOpacity={0.85}>
            <Text style={styles.nextButtonText}>Create Goal</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity
          style={commonStyles.modalOverlay}
          activeOpacity={1}
          onPress={closeModal}
        >
          <Animated.View
            style={[
              styles.modalBox,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Confirm Your Goal</Text>
              <Text style={styles.modalSubtitle}>
                Make sure everything looks right before we set it in motion.
              </Text>

              <View style={styles.modalDetails}>
                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Motivation:</Text> {experience.title}
                </Text>
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

              <Text style={styles.pledgeNote}>
                Friends can track your progress and empower you by gifting this experience!
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={closeModal}
                  style={[styles.modalButton, styles.cancelButton]}
                  activeOpacity={0.8}
                  disabled={isSubmitting}
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
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

    </MainScreen>
  );
};

const styles = StyleSheet.create({
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
  selectedCategoryCard: { backgroundColor: Colors.primarySurface, borderColor: Colors.secondary },
  unselectedCategoryCard: { backgroundColor: '#f9fafb', borderColor: '#d1d5db' },
  categoryIcon: { fontSize: 32, marginBottom: 8 },
  categoryName: { fontWeight: '500', fontSize: 14 },
  selectedCategoryName: { color: Colors.primary },
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
    color: '#d48a1b',
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

  // Pledged experience card
  pledgeCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  pledgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  pledgeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#15803d',
    marginBottom: 2,
  },
  pledgeSubtitle: {
    fontSize: 14,
    color: '#4ade80',
  },

  summaryCard: { backgroundColor: Colors.primarySurface, padding: 16, borderRadius: 12, marginBottom: 20 },
  summaryTitle: { fontSize: 14, fontWeight: '500', color: Colors.primary, marginBottom: 4 },
  summaryText: { fontSize: 14, color: Colors.primary },

  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#374151',
  },

  nextButton: { backgroundColor: Colors.secondary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  nextButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },

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
  modalDetails: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
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
    color: Colors.primaryDeep,
  },
  pledgeNote: {
    fontSize: 13,
    color: '#16a34a',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
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
    backgroundColor: Colors.primary,
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

export default PledgeGoalSettingScreen;
