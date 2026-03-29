import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';

interface SpriteAnimationProps {
  /** The sprite sheet image source (require or uri) */
  source: any;
  /** Number of columns in the sprite grid */
  columns: number;
  /** Number of rows in the sprite grid */
  rows: number;
  /** Total number of frames (may be less than columns * rows if last row isn't full) */
  frameCount: number;
  /** Display size of a single frame */
  frameWidth: number;
  /** Display size of a single frame */
  frameHeight: number;
  /** Milliseconds per frame (default: 60 = ~16fps) */
  frameDuration?: number;
  /** Loop the animation (default: true) */
  loop?: boolean;
  /** Auto-play on mount (default: true) */
  autoPlay?: boolean;
  /** Called when animation completes one cycle */
  onComplete?: () => void;
}

const SpriteAnimation: React.FC<SpriteAnimationProps> = ({
  source,
  columns,
  rows,
  frameCount,
  frameWidth,
  frameHeight,
  frameDuration = 60,
  loop = true,
  autoPlay = true,
  onComplete,
}) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    stop();
    timerRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        const next = prev + 1;
        if (next >= frameCount) {
          if (loop) {
            return 0;
          } else {
            stop();
            onComplete?.();
            return prev;
          }
        }
        return next;
      });
    }, frameDuration);
  }, [frameCount, frameDuration, loop, stop, onComplete]);

  useEffect(() => {
    if (autoPlay) {
      play();
    }
    return stop;
  }, [autoPlay, play, stop]);

  // Calculate the position of the current frame in the grid
  const col = currentFrame % columns;
  const row = Math.floor(currentFrame / columns);

  // The full sprite sheet dimensions
  const sheetWidth = frameWidth * columns;
  const sheetHeight = frameHeight * rows;

  return (
    <View style={[styles.container, { width: frameWidth, height: frameHeight }]}>
      <Image
        source={source}
        style={[
          styles.sheet,
          {
            width: sheetWidth,
            height: sheetHeight,
            left: -col * frameWidth,
            top: -row * frameHeight,
          },
        ]}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
  },
});

export default SpriteAnimation;
