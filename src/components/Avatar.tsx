import React, { useMemo } from 'react';
import { View, Text, ViewStyle, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 80,
  xl: 120,
};

const FONT_SIZES: Record<AvatarSize, number> = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 28,
  xl: 40,
};

export interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  style?: ViewStyle;
}

export const Avatar = React.memo<AvatarProps>(({
  uri,
  name,
  size = 'md',
  style,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const dimension = SIZES[size];
  const fontSize = FONT_SIZES[size];
  const borderRadius = dimension / 2;
  const initial = name?.[0]?.toUpperCase() || 'U';

  const sizeStyle: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius,
  };

  const accessibilityLabel = name ? `${name}'s avatar` : 'User avatar';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={[styles.image, sizeStyle, style] as any}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="image"
      />
    );
  }

  return (
    <View style={[styles.fallback, sizeStyle, style]} accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      <Text style={[styles.fallbackText, { fontSize }]}>{initial}</Text>
    </View>
  );
});

Avatar.displayName = 'Avatar';

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    image: {
      backgroundColor: colors.backgroundLight,
    },
    fallback: {
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackText: {
      color: colors.primary,
      fontWeight: '600',
    },
  });
