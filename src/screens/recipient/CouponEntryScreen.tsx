import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RecipientStackParamList, ExperienceGift, ValentineChallenge } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { commonStyles } from '../../styles/commonStyles';
import { logger } from '../../utils/logger';

type CouponEntryNavigationProp =
  NativeStackNavigationProp<RecipientStackParamList, 'CouponEntry'>;

const CouponEntryScreen = () => {
  const navigation = useNavigation<CouponEntryNavigationProp>();
  const route = useRoute();
  const { state, dispatch } = useApp();

  const params = route.params as { code?: string } | undefined;
  const initialCode = (params?.code || '').toUpperCase();

  const [claimCode, setClaimCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPersonalizedMessage, setShowPersonalizedMessage] = useState(false);
  const [personalizedMessage, setPersonalizedMessage] = useState('');
  const [pendingExperienceGift, setPendingExperienceGift] = useState<ExperienceGift | null>(null);

  // Shake animation for error feedback
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Modal animation values
  const slideAnim = useModalAnimation(showPersonalizedMessage);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const validateClaimCode = (code: string) => /^[A-Z0-9]{12}$/.test(code);

  const handleClaimCode = async (codeOverride?: string) => {
    if (isLoading) return;

    const trimmedCode = (codeOverride || claimCode).trim().toUpperCase();
    setErrorMessage('');

    if (!trimmedCode) {
      setErrorMessage('Please enter a claim code');
      triggerShake();
      return;
    }

    if (!validateClaimCode(trimmedCode)) {
      setErrorMessage('Please enter a valid 12-character code');
      triggerShake();
      return;
    }

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      // ✅ FIRST: Check if it's a Valentine challenge code
      const valentineRef = collection(db, 'valentineChallenges');
      const valentineQuery = query(
        valentineRef,
        where('purchaserCode', '==', trimmedCode)
      );
      const valentineQuerySnapshot = await getDocs(valentineQuery);

      if (!valentineQuerySnapshot.empty) {
        // It's a Valentine purchaser code
        const challengeDoc = valentineQuerySnapshot.docs[0];
        const challenge = { id: challengeDoc.id, ...challengeDoc.data() } as ValentineChallenge;

        logger.log('💘 Valentine purchaser code detected:', challenge.id);

        // ✅ SECURITY: Validate user can redeem this code
        const userId = state.user?.id;

        if (!userId) {
          setErrorMessage('Please sign in to redeem this code');
          triggerShake();
          return;
        }

        // Check if this specific code already redeemed
        if (challenge.purchaserCodeRedeemed) {
          setErrorMessage('This code has already been redeemed');
          triggerShake();
          return;
        }

        // ✅ NEW: Prevent same user from redeeming BOTH codes for this challenge
        // Query to check if user already has a goal for this Valentine challenge
        const goalsRef = collection(db, 'goals');
        const existingGoalQuery = query(
          goalsRef,
          where('userId', '==', userId),
          where('valentineChallengeId', '==', challenge.id)
        );
        const existingGoalSnapshot = await getDocs(existingGoalQuery);

        if (!existingGoalSnapshot.empty) {
          setErrorMessage('You have already redeemed a code for this challenge!');
          triggerShake();
          return;
        }

        // Navigate to Valentine goal setting
        navigation.reset({
          index: 0,
          routes: [{
            name: 'ValentineGoalSetting' as any,
            params: { challenge, isPurchaser: true }
          }],
        });
        return;
      }

      // Check if it's a Valentine partner code
      const partnerQuery = query(
        valentineRef,
        where('partnerCode', '==', trimmedCode)
      );
      const partnerQuerySnapshot = await getDocs(partnerQuery);

      if (!partnerQuerySnapshot.empty) {
        // It's a Valentine partner code
        const challengeDoc = partnerQuerySnapshot.docs[0];
        const challenge = { id: challengeDoc.id, ...challengeDoc.data() } as ValentineChallenge;

        logger.log('💘 Valentine partner code detected:', challenge.id);

        // ✅ SECURITY: Validate user can redeem this code
        const userId = state.user?.id;

        if (!userId) {
          setErrorMessage('Please sign in to redeem this code');
          triggerShake();
          return;
        }

        // Check if this specific code already redeemed
        if (challenge.partnerCodeRedeemed) {
          setErrorMessage('This code has already been redeemed');
          triggerShake();
          return;
        }

        // ✅ NEW: Prevent same user from redeeming BOTH codes for this challenge
        // Query to check if user already has a goal for this Valentine challenge
        const goalsRef = collection(db, 'goals');
        const existingGoalQuery = query(
          goalsRef,
          where('userId', '==', userId),
          where('valentineChallengeId', '==', challenge.id)
        );
        const existingGoalSnapshot = await getDocs(existingGoalQuery);

        if (!existingGoalSnapshot.empty) {
          setErrorMessage('You have already redeemed a code for this challenge!');
          triggerShake();
          return;
        }

        // Navigate to Valentine goal setting
        navigation.reset({
          index: 0,
          routes: [{
            name: 'ValentineGoalSetting' as any,
            params: { challenge, isPurchaser: false }
          }],
        });
        return;
      }

      // ✅ FALLBACK: Check regular experience gifts
      const giftsRef = collection(db, 'experienceGifts');
      const q = query(
        giftsRef,
        where('claimCode', '==', trimmedCode),
        where('status', '==', 'pending')
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setErrorMessage('This claim code is invalid or already claimed');
        triggerShake();
        return;
      }

      const giftDoc = querySnapshot.docs[0];
      const experienceGift = {
        id: giftDoc.id,
        ...(giftDoc.data() as ExperienceGift),
      };

      dispatch({ type: 'SET_EXPERIENCE_GIFT', payload: experienceGift });

      // If there's a personalized message, show it in a popup first
      if (experienceGift.personalizedMessage && experienceGift.personalizedMessage.trim()) {
        setPersonalizedMessage(experienceGift.personalizedMessage.trim());
        setPendingExperienceGift(experienceGift);
        setShowPersonalizedMessage(true);
      } else {
        // No message, proceed directly to GoalSetting
        navigation.reset({
          index: 0,
          routes: [{ name: 'GoalSetting', params: { experienceGift } }],
        });
      }
    } catch (error) {
      logger.error('Error claiming experience gift:', error);
      setErrorMessage('An error occurred. Please try again.');
      triggerShake();
    } finally {
      setIsLoading(false);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleContinueFromMessage = () => {
    setShowPersonalizedMessage(false);
    // Small delay to let animation complete
    setTimeout(() => {
      if (pendingExperienceGift) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'GoalSetting', params: { experienceGift: pendingExperienceGift } }],
        });
      }
    }, 200);
  };

  return (
    <MainScreen activeRoute="Goals">
      <LinearGradient colors={['#7C3AED', '#3B82F6']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar style="light" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                paddingTop: 45,
                flexGrow: 1,
                justifyContent: 'center',
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 32,
                }}
              >
                {/* Favicon Logo */}
                <View style={{ marginBottom: 24, alignItems: 'center' }}>
                  <Image
                    source={require('../../assets/favicon.png')}
                    style={{ width: 80, height: 80 }}
                    resizeMode="contain"
                  />
                </View>

                {/* Header */}
                <View style={{ marginBottom: 36, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: 40,
                      fontWeight: 'bold',
                      color: 'white',
                      textAlign: 'center',
                      marginBottom: 20,
                    }}
                  >
                    Claim your
                  </Text>
                  <Text
                    style={{
                      fontSize: 40,
                      fontWeight: 'bold',
                      color: 'white',
                      textAlign: 'center',
                      marginTop: -28,
                      marginBottom: 12,
                    }}
                  >
                    Ernit
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      color: '#E9D5FF',
                      textAlign: 'center',
                      maxWidth: 300,
                    }}
                  >
                    Enter the code you got below and start earning your reward
                  </Text>
                </View>

                {/* Code Input & Button */}
                <View style={{ width: '100%', maxWidth: 400, alignItems: 'center' }}>
                  <Animated.View
                    style={{
                      width: '100%',
                      transform: [{ translateX: shakeAnim }],
                    }}
                  >
                    <TextInput
                      style={{
                        backgroundColor: 'white',
                        borderRadius: 16,
                        paddingHorizontal: 20,
                        paddingVertical: 16,
                        fontSize: 18,
                        textAlign: 'center',
                        letterSpacing: 4,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 3,
                        borderWidth: errorMessage ? 2 : 0,
                        borderColor: errorMessage ? '#EF4444' : 'transparent',
                        width: '100%',
                      }}
                      placeholder="ABC123DEF456"
                      placeholderTextColor="#9CA3AF"
                      value={claimCode}
                      onChangeText={(text) => {
                        const clean = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                        setClaimCode(clean);
                        if (errorMessage) setErrorMessage('');

                        // Auto-submit when 12 valid chars - pass the fresh code value
                        if (clean.length === 12 && validateClaimCode(clean) && !isLoading) {
                          setTimeout(() => handleClaimCode(clean), 50);
                        }
                      }}
                      maxLength={12}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoFocus
                      editable={!isLoading}
                      returnKeyType="done"
                      onSubmitEditing={() => handleClaimCode()}
                    />
                  </Animated.View>

                  {/* Error message (fixed height to avoid layout jump and overlap) */}
                  <View style={{ height: 40, marginTop: 12, marginBottom: 8, justifyContent: 'center' }}>
                    {errorMessage ? (
                      <Text
                        style={{
                          color: 'white',
                          fontSize: 14,
                          textAlign: 'center',
                          fontWeight: '500',
                        }}
                      >
                        {errorMessage}
                      </Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    onPress={() => handleClaimCode()}
                    disabled={isLoading || claimCode.length < 6}
                    activeOpacity={0.8}
                    style={{
                      width: '100%',
                      backgroundColor:
                        isLoading || claimCode.length < 6 ? '#D1D5DB' : 'white',
                      paddingVertical: 18,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      elevation: 5,
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#7C3AED" />
                    ) : (
                      <Text
                        style={{
                          color: '#7C3AED',
                          fontSize: 18,
                          fontWeight: 'bold',
                        }}
                      >
                        Claim Reward
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Info Box */}
                <View
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 20,
                    padding: 24,
                    width: '100%',
                    maxWidth: 400,
                    marginTop: 36,
                  }}
                >
                  <Text
                    style={{
                      color: 'white',
                      fontSize: 18,
                      fontWeight: 'bold',
                      marginBottom: 16,
                      textAlign: 'center',
                    }}
                  >
                    How it works:
                  </Text>
                  <View style={{ gap: 8 }}>
                    <Text
                      style={{ color: '#E9D5FF', fontSize: 16, textAlign: 'center' }}
                    >
                      1. Enter your claim code
                    </Text>
                    <Text
                      style={{ color: '#E9D5FF', fontSize: 16, textAlign: 'center' }}
                    >
                      2. Set personal goals to earn the reward
                    </Text>
                    <Text
                      style={{ color: '#E9D5FF', fontSize: 16, textAlign: 'center' }}
                    >
                      3. Receive hints as you progress
                    </Text>
                    <Text
                      style={{ color: '#E9D5FF', fontSize: 16, textAlign: 'center' }}
                    >
                      4. Achieve your goals and claim your reward!
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>

      {/* Personalized Message Modal */}
      <Modal
        visible={showPersonalizedMessage}
        transparent
        animationType="fade"
        onRequestClose={handleContinueFromMessage}
      >
        <TouchableOpacity
          style={commonStyles.modalOverlay}
          activeOpacity={1}
          onPress={handleContinueFromMessage}
        >
          <Animated.View
            style={[
              styles.modalContainer,
              {
                transform: [{ translateY: slideAnim }],
              },
            ]}
            pointerEvents={showPersonalizedMessage ? "box-none" : "none"}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>A Message For You</Text>
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>"{personalizedMessage}"</Text>
                </View>
                {pendingExperienceGift?.giverName && (
                  <Text style={styles.signatureText}>
                    - from {pendingExperienceGift.giverName}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={handleContinueFromMessage}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    marginHorizontal: 20,
  },
  modalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  messageBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  signatureText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'right',
    marginBottom: 20,
    marginTop: -8,
  },
  continueButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.3,
  },
});

export default CouponEntryScreen;