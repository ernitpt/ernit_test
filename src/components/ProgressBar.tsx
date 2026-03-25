import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { useColors } from '../config';

interface ProgressBarProps {
  progress: number; // 0-1
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: ViewStyle;
}

export const ProgressBar = React.memo<ProgressBarProps>(({
  progress,
  height = 4,
  trackColor,
  fillColor,
  style,
}) => {
  const colors = useColors();

  // Resolve defaults inside component so they use the current color scheme
  const resolvedTrackColor = trackColor ?? colors.backgroundLight;
  const resolvedFillColor = fillColor ?? colors.secondary;

  const clampedProgress = Math.min(1, Math.max(0, progress));

  return (
    <View style={[styles.track, { height, backgroundColor: resolvedTrackColor, borderRadius: height / 2 }, style]}>
      <MotiView
        animate={{ width: `${clampedProgress * 100}%` }}
        transition={{ type: 'spring', damping: 100, stiffness: 320 }}
        style={[styles.fill, { height, backgroundColor: resolvedFillColor, borderRadius: height / 2 }]}
      />
    </View>
  );
});

ProgressBar.displayName = 'ProgressBar';

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
