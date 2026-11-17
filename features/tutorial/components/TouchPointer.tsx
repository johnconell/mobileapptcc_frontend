import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface TouchPointerProps {
  x: number; // percentage or px
  y: number; // percentage or px
  active?: boolean;
}

export const TouchPointer: React.FC<TouchPointerProps> = ({ x, y, active = true }) => {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.7);
  const pointerScale = useSharedValue(1);

  useEffect(() => {
    if (!active) return;

    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(2.4, { duration: 1200 }),
      ),
      -1,
      false,
    );

    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 0 }),
        withTiming(0, { duration: 1200 }),
      ),
      -1,
      false,
    );

    pointerScale.value = withRepeat(
      withSequence(
        withTiming(0.92, { duration: 400 }),
        withTiming(1.08, { duration: 400 }),
        withTiming(1.0, { duration: 400 }),
      ),
      -1,
      true,
    );
  }, [active, pulseScale, pulseOpacity, pointerScale]);

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const touchDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pointerScale.value }],
  }));

  if (!active) return null;

  return (
    <View style={[styles.container, { top: y, left: x }]} pointerEvents="none">
      {/* Outer Pulse Ripple Ring */}
      <Animated.View style={[styles.ripple, rippleStyle]} />
      {/* Touch Dot */}
      <Animated.View style={[styles.dot, touchDotStyle]}>
        <View style={styles.dotInner} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  ripple: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#FF7A00',
    backgroundColor: 'rgba(255, 122, 0, 0.25)',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF7A00',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF7A00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 8,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});
