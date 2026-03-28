// components/HintPopup.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, Pressable, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import type { GestureEvent, HandlerStateChangeEvent } from 'react-native-gesture-handler';
import type { PanGestureHandlerEventPayload } from 'react-native-gesture-handler';
import ConfettiCannon from 'react-native-confetti-cannon';
import type ConfettiCannonType from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import { createCommonStyles } from '../styles/commonStyles';
import AudioPlayer from './AudioPlayer';
import { BaseModal } from './BaseModal';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import type { PersonalizedHint } from '../types';
import { vh } from '../utils/responsive';


interface Props {
  visible: boolean;
  hint: PersonalizedHint | string;
  sessionNumber: number;
  totalSessions: number;
  onClose: () => void;
  isFirstHint?: boolean; // Indicates this is the very first hint after goal creation
  additionalMessage?: string; // Optional message to display (e.g., when they'll get next hint)
}

const HintPopup: React.FC<Props> = ({ visible, hint, sessionNumber, totalSessions, onClose, isFirstHint = false, additionalMessage }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const commonStyles = useMemo(() => createCommonStyles(colors), [colors]);

  const confettiRef = useRef<ConfettiCannonType>(null);
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

  // Timer management for memory leak prevention
  const timers = useRef<NodeJS.Timeout[]>([]);

  // Determine content type
  const isObj = typeof hint === 'object' && hint !== null;
  const hintObj = isObj ? hint as PersonalizedHint : null;
  const text = hintObj ? hintObj.text : (hint as string);
  const audioUrl = hintObj ? hintObj.audioUrl : null;
  const imageUrl = hintObj ? hintObj.imageUrl : null;
  const duration = hintObj ? hintObj.duration : 0;
  const giverName = hintObj ? hintObj.giverName : null;

  // Only require scratch for image hints
  const requiresScratch = !!imageUrl;

  useEffect(() => {
    if (visible) {
      // Clear any pending timers
      timers.current.forEach(clearTimeout);
      timers.current = [];

      // Reset revealed state based on hint type
      if (requiresScratch) {
        setIsRevealed(false);
        revealProgress.setValue(0);
        totalScratchDistance.current = 0;
      } else {
        // Auto-reveal text and audio hints
        setIsRevealed(true);
        revealProgress.setValue(1);
        totalScratchDistance.current = 0;
      }

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
      timers.current.push(setTimeout(() => {
        Animated.spring(iconScale, {
          toValue: 1,
          tension: 100,
          friction: 5,
          useNativeDriver: true,
        }).start();
      }, 100));

      // Header fades in
      timers.current.push(setTimeout(() => {
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 200));

      // Hint container slides up and fades in (but content still blurred)
      timers.current.push(setTimeout(() => {
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
      }, 300));

      // Button slides up and fades in
      timers.current.push(setTimeout(() => {
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
      }, 500));
    } else {
      // Clear any pending timers
      timers.current.forEach(clearTimeout);
      timers.current = [];

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

    // Cleanup on unmount or when visible changes
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [visible]);


  // Handle scratch gesture - accumulate distance moved
  const lastPosition = useRef({ x: 0, y: 0 });
  const totalScratchDistance = useRef(0);

  const onGestureEvent = (event: GestureEvent<PanGestureHandlerEventPayload>) => {
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
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        timers.current.push(setTimeout(() => confettiRef.current?.start(), 100));
      }
    }
  };

  const onHandlerStateChange = (event: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
    if (event.nativeEvent.state === State.BEGAN) {
      // Reset position tracking when touch begins
      lastPosition.current = { x: 0, y: 0 };
    } else if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
      // Keep the reveal progress (don't snap back)
      // User can continue scratching on next touch
    }
  };



  // Interpolate blur overlay opacity (1 = fully obscured, 0 = fully revealed)
  const blurOpacity = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <>
      <BaseModal visible={visible} onClose={onClose}>
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
                  <Text style={{ fontSize: Typography.display.fontSize }}>✨</Text>
                </Animated.View>

                <Animated.View style={{ opacity: headerOpacity, alignItems: 'center' }}>
                  <Text style={styles.h1}>Your Hint!</Text>

                  {giverName && (
                    <Text style={styles.subHeader}>
                      {giverName} left you a hint
                    </Text>
                  )}

                  {/* Instruction text that disappears when revealed - only for image hints */}
                  {!isRevealed && requiresScratch && (
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
                    enabled={requiresScratch && !isRevealed}
                  >
                    <Animated.View style={styles.hintContainer}>
                      {/* Hint Content */}
                      <View style={styles.hintContent}>
                        {text ? <Text style={styles.hint}>{text}</Text> : null}

                        {imageUrl && (
                          <Image
                            source={{ uri: imageUrl }}
                            style={styles.hintImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            accessibilityLabel="Hint image"
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

                {/* Additional message for first hint */}
                {isFirstHint && additionalMessage && (
                  <View style={styles.firstHintMessageContainer}>
                    <Text style={styles.firstHintMessage}>{additionalMessage}</Text>
                  </View>
                )}

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
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss hint"
                  >
                    <Text style={styles.btnText}>Awesome!</Text>
                  </Pressable>
                </Animated.View>

                <ConfettiCannon
                  ref={confettiRef}
                  autoStart={false}
                  count={Platform.OS === 'android' ? 48 : 80}
                  explosionSpeed={420}
                  fallSpeed={2600}
                  origin={{ x: 150, y: -10 }}
                  fadeOut
                />
              </Pressable>
            </Animated.View>
      </BaseModal>
    </>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    card: {
      width: '100%',
      maxWidth: 340,
      borderRadius: BorderRadius.xxl,
      padding: Spacing.xxl,
      backgroundColor: colors.white,
      alignItems: 'center',
      shadowColor: colors.black,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: BorderRadius.circle,
      backgroundColor: colors.primarySurface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
      borderWidth: 4,
      borderColor: colors.primaryTint,
    },
    h1: {
      ...Typography.heading2,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: Spacing.sm,
      textAlign: 'center',
    },
    subHeader: {
      ...Typography.small,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: Spacing.xl,
      textAlign: 'center',
    },
    instructionText: {
      ...Typography.caption,
      fontWeight: '600',
      color: colors.primary,
      marginTop: Spacing.sm,
      marginBottom: Spacing.md,
      textAlign: 'center',
    },
    hintOuterContainer: {
      width: '100%',
      marginBottom: Spacing.xxl,
    },
    hintContainer: {
      width: '100%',
      maxHeight: 400,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      position: 'relative',
    },
    hintContent: {
      padding: Spacing.lg,
      alignItems: 'center',
    },
    hint: {
      ...Typography.subheading,
      lineHeight: 24,
      color: colors.gray700,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },
    hintImage: {
      width: '100%',
      height: vh(200),
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.md,
      backgroundColor: colors.backgroundLight,
    },
    audioContainer: {
      width: '100%',
      alignItems: 'center',
    },
    signatureContainer: {
      marginTop: Spacing.lg,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      width: '100%',
      alignItems: 'flex-end',
    },
    signatureText: {
      ...Typography.small,
      fontWeight: '500',
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    blurOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      ...(Platform.OS === 'web' ? {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      } as Record<string, string> : {}),
    },
    blurLayer1: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.whiteAlpha40,
    },
    blurLayer2: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.whiteAlpha25,
    },
    blurLayer3: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.whiteAlpha15,
    },
    btn: {
      width: '100%',
      backgroundColor: colors.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    btnText: {
      color: colors.white,
      fontWeight: '700',
      ...Typography.subheading,
      letterSpacing: 0.5,
    },
    firstHintMessageContainer: {
      width: '100%',
      backgroundColor: colors.primarySurface,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.lg,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.primaryTint,
    },
    firstHintMessage: {
      ...Typography.small,
      fontWeight: '600',
      color: colors.primary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });

export default React.memo(HintPopup);
