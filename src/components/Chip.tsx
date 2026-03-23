import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Typography } from '../config/typography';

interface ChipProps {
  label: string;
  color?: string;
  backgroundColor?: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export const Chip = React.memo<ChipProps>(({
  label,
  color,
  backgroundColor,
  selected = false,
  onPress,
  icon,
  size = 'sm',
  style,
}) => {
  const colors = useColors();

  // Resolve defaults inside component so they use the current color scheme
  const resolvedColor = color ?? colors.textSecondary;
  const resolvedBg = backgroundColor ?? colors.backgroundLight;

  const isSmall = size === 'sm';
  const containerStyle: ViewStyle = {
    backgroundColor: selected ? colors.primaryTint : resolvedBg,
    paddingVertical: isSmall ? Spacing.xs : Spacing.sm,
    paddingHorizontal: isSmall ? Spacing.sm : Spacing.md,
    borderRadius: BorderRadius.pill,
    borderWidth: selected ? 1 : 0,
    borderColor: selected ? colors.primaryBorder : 'transparent',
  };

  const textStyle: TextStyle = {
    ...(isSmall ? Typography.caption : Typography.small),
    color: selected ? colors.primaryDark : resolvedColor,
    fontWeight: selected ? '600' : '500',
  };

  const content = (
    <View style={[styles.container, containerStyle, style]}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={textStyle}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
});

Chip.displayName = 'Chip';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  iconContainer: {
    marginRight: Spacing.xs,
  },
});
