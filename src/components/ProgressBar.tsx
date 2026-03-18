import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Colors } from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';

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
  trackColor = Colors.backgroundLight,
  fillColor = Colors.secondary,
  style,
}) => {
  const clampedProgress = Math.min(1, Math.max(0, progress));

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height / 2 }, style]}>
      <MotiView
        animate={{ width: `${clampedProgress * 100}%` }}
        transition={{ type: 'spring', damping: 100, stiffness: 320 }}
        style={[styles.fill, { height, backgroundColor: fillColor, borderRadius: height / 2 }]}
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
