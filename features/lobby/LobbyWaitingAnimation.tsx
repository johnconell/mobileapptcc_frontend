import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Wifi } from 'lucide-react-native';
import { colors } from '@/theme';

export function LobbyWaitingAnimation() {
  const pulse = useSharedValue(0.85);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    ring1.value = withRepeat(withTiming(1, { duration: 2200 }), -1, false);
    ring2.value = withDelay(700, withRepeat(withTiming(1, { duration: 2200 }), -1, false));
  }, [pulse, ring1, ring2]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const ringStyle1 = useAnimatedStyle(() => ({
    opacity: 1 - ring1.value,
    transform: [{ scale: 1 + ring1.value * 0.85 }],
  }));

  const ringStyle2 = useAnimatedStyle(() => ({
    opacity: 1 - ring2.value,
    transform: [{ scale: 1 + ring2.value * 0.85 }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, ringStyle1]} />
      <Animated.View style={[styles.ring, ringStyle2]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <Wifi size={28} color={colors.white} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  core: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
