import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { Colors } from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';

export type CardVariant = 'default' | 'elevated' | 'outlined';

export interface CardProps {
  variant?: CardVariant;
  style?: ViewStyle;
  children: React.ReactNode;
  noPadding?: boolean;
}

export const Card = React.memo<CardProps>(({
  variant = 'default',
  style,
  children,
  noPadding = false
}) => {
  const variantStyle = getVariantStyle(variant);
  const paddingStyle = noPadding ? null : styles.padding;

  return (
    <View style={[styles.base, variantStyle, paddingStyle, style]}>
      {children}
    </View>
  );
});

Card.displayName = 'Card';

function getVariantStyle(variant: CardVariant): ViewStyle {
  switch (variant) {
    case 'elevated':
      return styles.elevated;
    case 'outlined':
      return styles.outlined;
    case 'default':
    default:
      return styles.default;
  }
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.white,
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
    borderColor: Colors.border,
  },
});
