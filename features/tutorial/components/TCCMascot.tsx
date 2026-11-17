import React, { useEffect } from 'react';
import { StyleSheet, View, Image, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { MascotMood } from '../types';

interface TCCMascotProps {
  mood: MascotMood;
  size?: number;
}

export const TCCMascot: React.FC<TCCMascotProps> = ({ mood, size = 84 }) => {
  const floatAnim = useSharedValue(0);

  useEffect(() => {
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 1400 }),
        withTiming(4, { duration: 1400 }),
      ),
      -1,
      true,
    );
  }, [floatAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value }],
  }));

  const getMoodBadge = () => {
    switch (mood) {
      case 'network':
        return '📶';
      case 'scanner':
        return '📷';
      case 'passkey':
        return '🔑';
      case 'id_check':
        return '🪪';
      case 'waiting':
        return '⏳';
      case 'ready':
        return '🔒';
      case 'answering':
        return '📜';
      case 'navigating':
        return '🧭';
      case 'submitting':
        return '📤';
      case 'success':
        return '🎉';
      case 'welcome':
      default:
        return '👋';
    }
  };

  const badgeOffset = Math.round(size * 0.04);
  const badgeSize = Math.round(size * 0.34);

  return (
    <Animated.View style={[styles.container, { width: size, height: size }, animatedStyle]}>
      {/* Golden Aura Glow */}
      <View
        style={[
          styles.glowRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />

      {/* Official 3D Chippy the Fox Mascot Avatar Badge */}
      <Image
        source={require('@/assets/tutorial/chippy-badge.png')}
        style={[
          styles.mascotImage,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        resizeMode="cover"
      />

      {/* Interactive Mood Pill Overlay */}
      <View
        style={[
          styles.moodPill,
          {
            bottom: badgeOffset,
            right: badgeOffset,
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
          },
        ]}
      >
        <Text style={[styles.moodEmoji, { fontSize: Math.round(badgeSize * 0.58) }]}>
          {getMoodBadge()}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    backgroundColor: '#FACC15',
    opacity: 0.25,
    transform: [{ scale: 1.08 }],
  },
  mascotImage: {
    borderWidth: 2.5,
    borderColor: '#FACC15',
    backgroundColor: '#881337',
  },
  moodPill: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  moodEmoji: {
    textAlign: 'center',
    lineHeight: 18,
  },
});
