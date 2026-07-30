import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, shadows } from '@/theme';

interface FloatingButtonProps {
  onPress: () => void;
  label?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FloatingButton({ onPress, label, icon, style }: FloatingButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[styles.fab, !label && styles.iconOnly, animatedStyle, style]}
    >
      {icon}
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    minHeight: 56,
    paddingHorizontal: 24,
    borderRadius: 28,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...shadows.soft,
  },
  iconOnly: {
    width: 56,
    paddingHorizontal: 0,
  },
  label: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
