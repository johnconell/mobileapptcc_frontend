import React, { PropsWithChildren } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radii, shadows } from '@/theme';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  padded?: boolean;
  animated?: boolean;
  delay?: number;
}

export function Card({
  children,
  style,
  padded = true,
  animated = true,
  delay = 0,
}: CardProps) {
  const content = (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );

  if (!animated) return content;

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)}>
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(231, 229, 228, 0.9)',
    ...shadows.card,
  },
  padded: {
    padding: 18,
  },
});
