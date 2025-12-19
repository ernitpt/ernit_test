// components/HintPopup.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Animated, Pressable, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import { commonStyles } from '../styles/commonStyles';
import AudioPlayer from './AudioPlayer';


interface Props {
  visible: boolean;
  hint: any; // string or PersonalizedHint object
  sessionNumber: number;
  totalSessions: number;
  onClose: () => void;
}

const HintPopup: React.FC<Props> = ({ visible, hint, sessionNumber, totalSessions, onClose }) => {
  const confettiRef = useRef<any>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.8)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const hintSlideY = useRef(new Animated.Value(20)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const buttonSlideY = useRef(new Animated.Value(20)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;

  // Swipe-to-reveal animation value (0 = obscured, 1 = revealed)
  const revealProgress = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset revealed state
      setIsRevealed(false);
      revealProgress.setValue(0);
      totalScratchDistance.current = 0;

      // Reset all animations
      backdropOpacity.setValue(0);
      cardScale.setValue(0.8);
      cardOpacity.setValue(0);
      iconScale.setValue(0);
      headerOpacity.setValue(0);
      hintSlideY.setValue(20);
      hintOpacity.setValue(0);
      buttonSlideY.setValue(20);
      buttonOpacity.setValue(0);

      // Staggered entrance animations
      Animated.sequence([
        // First: Fade in backdrop
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        // Then: Spring in card with scale
        Animated.parallel([
          Animated.spring(cardScale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(cardOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // Icon pops in after card appears
      setTimeout(() => {
        Animated.spring(iconScale, {
          toValue: 1,
          tension: 100,
          friction: 5,
          useNativeDriver: true,
        }).start();
      }, 100);

      // Header fades in
      setTimeout(() => {
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 200);

      // Hint container slides up and fades in (but content still blurred)
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(hintSlideY, {
            toValue: 0,
            tension: 60,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(hintOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      }, 300);

      // Button slides up and fades in
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(buttonSlideY, {
            toValue: 0,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(buttonOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }, 500);
    } else {
      // Exit animation
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);


  // Handle scratch gesture - accumulate distance moved
  const lastPosition = useRef({ x: 0, y: 0 });
  const totalScratchDistance = useRef(0);

  const onGestureEvent = (event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      const { translationX, translationY } = event.nativeEvent;

      // Calculate distance moved since last update
      const dx = translationX - lastPosition.current.x;
      const dy = translationY - lastPosition.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Accumulate scratch distance
      totalScratchDistance.current += distance;

      // Update reveal progress based on total scratch distance
      // Need ~250px of scratch movement to fully reveal
      const FULL_REVEAL_DISTANCE = 250;
      const progress = Math.min(totalScratchDistance.current / FULL_REVEAL_DISTANCE, 1);
      revealProgress.setValue(progress);

      // Store current position
      lastPosition.current = { x: translationX, y: translationY };

      // If fully revealed, trigger haptic and confetti
      if (progress >= 1 && !isRevealed) {
        setIsRevealed(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTimeout(() => confettiRef.current?.start(), 100);
      }
    }
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.BEGAN) {
      // Reset position tracking when touch begins
      lastPosition.current = { x: 0, y: 0 };
    } else if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
      // Keep the reveal progress (don't snap back)
      // User can continue scratching on next touch
    }
  };

  // Determine content
  const isObj = typeof hint === 'object' && hint !== null;
  const text = isObj ? (hint.text || hint.hint) : hint;
  const audioUrl = isObj ? hint.audioUrl : null;
  const imageUrl = isObj ? hint.imageUrl : null;
  const duration = isObj ? hint.duration : 0;
  const giverName = isObj ? hint.giverName : null;

  // Interpolate blur overlay opacity (1 = fully obscured, 0 = fully revealed)
  const blurOpacity = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <>
      <Modal visible={visible} transparent onRequestClose={onClose}>
        <Animated.View
          style={[
            commonStyles.modalOverlay,
            {
              padding: 24,
              opacity: backdropOpacity,
            }
          ]}
        >
          <TouchableOpacity
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            activeOpacity={1}
            onPress={onClose}
          >
            <Animated.View
              style={[
                styles.card,
                {
                  opacity: cardOpacity,
                  transform: [{ scale: cardScale }]
                }
              ]}
            >
              <Pressable style={{ width: '100%', alignItems: 'center' }} onPress={(e) => e.stopPropagation()}>

                <Animated.View
                  style={[
                    styles.iconContainer,
                    {
                      transform: [{ scale: iconScale }]
                    }
                  ]}
                >
                  <Text style={{ fontSize: 32 }}>✨</Text>
                </Animated.View>

                <Animated.View style={{ opacity: headerOpacity, alignItems: 'center' }}>
                  <Text style={styles.h1}>Your Hint!</Text>

                  {giverName && (
                    <Text style={styles.subHeader}>
                      {giverName} left you a hint
                    </Text>
                  )}

                  {/* Instruction text that disappears when revealed */}
                  {!isRevealed && (
                    <Text style={styles.instructionText}>
                      Swipe below to reveal your hint
                    </Text>
                  )}
                </Animated.View>

                <Animated.View
                  style={[
                    styles.hintOuterContainer,
                    {
                      opacity: hintOpacity,
                      transform: [{ translateY: hintSlideY }]
                    }
                  ]}
                >
                  <PanGestureHandler
                    onGestureEvent={onGestureEvent}
                    onHandlerStateChange={onHandlerStateChange}
                    enabled={!isRevealed}
                  >
                    <Animated.View style={styles.hintContainer}>
                      {/* Hint Content */}
                      <View style={styles.hintContent}>
                        {text ? <Text style={styles.hint}>{text}</Text> : null}

                        {imageUrl && (
                          <Image
                            source={{ uri: imageUrl }}
                            style={styles.hintImage}
                            resizeMode="cover"
                          />
                        )}

                        {audioUrl && (
                          <View style={styles.audioContainer}>
                            <AudioPlayer uri={audioUrl} duration={duration} variant="popup" />
                          </View>
                        )}

                        {giverName && (
                          <View style={styles.signatureContainer}>
                            <Text style={styles.signatureText}>– {giverName}</Text>
                          </View>
                        )}
                      </View>

                      {/* Blur Overlay - Cross Platform */}
                      <Animated.View
                        style={[
                          styles.blurOverlay,
                          { opacity: blurOpacity }
                        ]}
                        pointerEvents={isRevealed ? 'none' : 'auto'}
                      >
                        {/* Multi-layer blur effect */}
                        <View style={styles.blurLayer1} />
                        <View style={styles.blurLayer2} />
                        <View style={styles.blurLayer3} />
                      </Animated.View>
                    </Animated.View>
                  </PanGestureHandler>
                </Animated.View>

                <Animated.View
                  style={{
                    width: '100%',
                    opacity: buttonOpacity,
                    transform: [{ translateY: buttonSlideY }]
                  }}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.btn,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
                    ]}
                    onPress={onClose}
                  >
                    <Text style={styles.btnText}>Awesome!</Text>
                  </Pressable>
                </Animated.View>

                <ConfettiCannon
                  ref={confettiRef}
                  autoStart={false}
                  count={80}
                  explosionSpeed={420}
                  fallSpeed={2600}
                  origin={{ x: 150, y: -10 }}
                  fadeOut
                />
              </Pressable>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#FAF5FF',
  },
  h1: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subHeader: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 18,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  hintOuterContainer: {
    width: '100%',
    marginBottom: 24,
  },
  hintContainer: {
    width: '100%',
    maxHeight: 400,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    position: 'relative',
  },
  hintContent: {
    padding: 16,
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 4,
  },
  hintImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#f3f4f6',
  },
  audioContainer: {
    width: '100%',
    alignItems: 'center',
  },
  signatureContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    width: '100%',
    alignItems: 'flex-end',
  },
  signatureText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    fontStyle: 'italic',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    // @ts-ignore - backdropFilter works on web
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)', // Safari support
  },
  blurLayer1: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  blurLayer2: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(240, 242, 245, 0.3)',
  },
  blurLayer3: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 251, 252, 0.2)',
  },
  swipeInstruction: {
    position: 'absolute',
    zIndex: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  swipeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7C3AED',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  btn: {
    width: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.5,
  },
});

export default HintPopup;
