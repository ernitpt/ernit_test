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
import { RecipientStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

type CouponEntryNavigationProp =
  NativeStackNavigationProp<RecipientStackParamList, 'CouponEntry'>;

const CouponEntryScreen = () => {
  const navigation = useNavigation<CouponEntryNavigationProp>();
  const route = useRoute();
  const { dispatch } = useApp();

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
  const modalScaleAnim = useRef(new Animated.Value(0)).current;
  const modalFadeAnim = useRef(new Animated.Value(0)).current;
  const modalBackdropAnim = useRef(new Animated.Value(0)).current;

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
      console.error('Error claiming experience gift:', error);
      setErrorMessage('An error occurred. Please try again.');
      triggerShake();
    } finally {
      setIsLoading(false);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Handle personalized message modal animation
  useEffect(() => {
    if (showPersonalizedMessage) {
      Animated.parallel([
        Animated.spring(modalScaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(modalFadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(modalBackdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(modalScaleAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(modalFadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(modalBackdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start(() => {
        // Reset values after animation
        modalScaleAnim.setValue(0);
        modalFadeAnim.setValue(0);
        modalBackdropAnim.setValue(0);
      });
    }
  }, [showPersonalizedMessage]);

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

  const backdropOpacity = modalBackdropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

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
                      3. Receive AI-generated hints as you progress
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
        animationType="none"
        onRequestClose={handleContinueFromMessage}
      >
        <Animated.View
          style={[
            styles.modalOverlay,
            {
              opacity: modalBackdropAnim,
            }
          ]}
        >
          {/* Web-specific blur effect */}
          {Platform.OS === 'web' && showPersonalizedMessage && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: modalBackdropAnim,
                  // @ts-ignore - web-specific style
                  backdropFilter: 'blur(10px)',
                  // @ts-ignore - web-specific style
                  WebkitBackdropFilter: 'blur(10px)',
                },
              ]}
            />
          )}

          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleContinueFromMessage}
          />

          <Animated.View
            style={[
              styles.modalContainer,
              {
                transform: [{ scale: modalScaleAnim }],
                opacity: modalFadeAnim,
              },
            ]}
            pointerEvents={showPersonalizedMessage ? "box-none" : "none"}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>A Message For You</Text>
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>"{personalizedMessage}"</Text>
              </View>
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinueFromMessage}
                activeOpacity={0.8}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
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
    fontSize: 28,
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