import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, radii } from '@/theme';

interface ProgressBarProps {
  progress: number;
  height?: number;
  color?: string;
  trackColor?: string;
}

export function ProgressBar({
  progress,
  height = 8,
  color = colors.primary,
  trackColor = colors.surfaceMuted,
}: ProgressBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 450 });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height }]}>
      <Animated.View
        style={[
          styles.fill,
          fillStyle,
          { backgroundColor: color, borderRadius: height },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
