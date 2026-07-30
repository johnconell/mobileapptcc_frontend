import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/theme';

interface LoaderProps {
  label?: string;
  fullscreen?: boolean;
}

export function Loader({ label = 'Loading…', fullscreen = false }: LoaderProps) {
  const pulse = useSharedValue(0.92);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.7 + (pulse.value - 0.92) * 2,
  }));

  return (
    <View style={[styles.wrap, fullscreen && styles.fullscreen]}>
      <Animated.View style={[styles.badge, animatedStyle]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.inkSecondary,
  },
});
