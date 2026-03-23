import React, { useRef, useCallback, useMemo } from 'react';
import { View, Pressable, Animated, ViewStyle, StyleSheet, AccessibilityRole } from 'react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import { Animations } from '../config/animations';

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'glassmorphism';

export interface CardProps {
  variant?: CardVariant;
  style?: ViewStyle;
  children: React.ReactNode;
  noPadding?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const Card = React.memo<CardProps>(({
  variant = 'default',
  style,
  children,
  noPadding = false,
  onPress,
  accessibilityLabel,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97,
      ...Animations.springs.bouncy,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      ...Animations.springs.bouncy,
    }).start();
  }, [scale]);

  const variantStyle = getVariantStyle(variant, styles);
  const paddingStyle = noPadding ? null : styles.padding;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole={'button' as AccessibilityRole}
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <View style={[styles.base, variantStyle, paddingStyle]}>
            {children}
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.base, variantStyle, paddingStyle, style]}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
});

Card.displayName = 'Card';

function getVariantStyle(variant: CardVariant, styles: ReturnType<typeof createStyles>): ViewStyle {
  switch (variant) {
    case 'elevated':
      return styles.elevated;
    case 'outlined':
      return styles.outlined;
    case 'glassmorphism':
      return styles.glassmorphism;
    case 'default':
    default:
      return styles.default;
  }
}

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    base: {
      backgroundColor: colors.white,
      borderRadius: BorderRadius.lg,
    },
    padding: {
      padding: Spacing.cardPadding,
    },
    default: {
      ...Shadows.sm,
    },
    elevated: {
      ...Shadows.md,
    },
    outlined: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    glassmorphism: {
      backgroundColor: colors.surfaceFrosted,
      borderWidth: 1,
      borderColor: colors.whiteAlpha40,
      ...Shadows.sm,
    },
  });
