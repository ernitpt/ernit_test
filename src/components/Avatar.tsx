import React from 'react';
import { View, Image, Text, ViewStyle, StyleSheet } from 'react-native';
import { Colors } from '../config/colors';
import { Typography } from '../config/typography';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 80,
};

const FONT_SIZES: Record<AvatarSize, number> = {
  sm: 14,
  md: 18,
  lg: 28,
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
        style={[styles.image, sizeStyle, style]}
        resizeMode="cover"
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

const styles = StyleSheet.create({
  image: {
    backgroundColor: Colors.backgroundLight,
  },
  fallback: {
    backgroundColor: Colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
