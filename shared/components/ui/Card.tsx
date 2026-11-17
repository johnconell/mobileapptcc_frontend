import React, { PropsWithChildren } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radii, shadows } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
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
  const { colors: themeColors, isDark } = useAppTheme();

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.cardBorder,
        },
        isDark && styles.cardDark,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
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
  cardDark: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  padded: {
    padding: 18,
  },
});
