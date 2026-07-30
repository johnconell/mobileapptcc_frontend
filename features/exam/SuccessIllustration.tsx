import React, { useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

export function SuccessIllustration() {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTimingSafe(1);
    scale.value = withDelay(80, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, style]}>
      <View style={styles.circle}>
        <Svg width={72} height={72} viewBox="0 0 72 72">
          <Circle cx="36" cy="36" r="34" fill={colors.primary} />
          <Path
            d="M22 37.5 L31 46.5 L50 27"
            stroke={colors.secondary}
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      <Text style={styles.caption}>Submission confirmed</Text>
    </Animated.View>
  );
}

function withTimingSafe(to: number) {
  return withSpring(to, { damping: 18, stiffness: 120 });
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 40,
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
