import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react-native';

export interface PracticePointerArrowProps {
  direction?: 'down' | 'up' | 'left' | 'right';
  label: string;
  sublabel?: string;
  color?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function PracticePointerArrow({
  direction = 'down',
  label,
  sublabel,
  color = '#F59E0B',
  textColor = '#000000',
  style,
}: PracticePointerArrowProps) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounceAnim]);

  // Translate range for bouncing effect
  const translateY = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: direction === 'up' ? [0, -7] : [0, 7],
  });

  const translateX = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: direction === 'left' ? [0, -7] : [0, 7],
  });

  const isVertical = direction === 'down' || direction === 'up';

  return (
    <Animated.View
      style={[
        styles.container,
        { pointerEvents: 'none' },
        isVertical
          ? { transform: [{ translateY }] }
          : { transform: [{ translateX }] },
        style,
      ]}
    >
      {/* If pointing UP, show arrow first, then badge below */}
      {direction === 'up' && (
        <View style={styles.arrowIconWrap}>
          <ArrowUp size={20} color={color} strokeWidth={3.5} />
        </View>
      )}

      {/* If pointing LEFT, show arrow on left */}
      {direction === 'left' && (
        <View style={styles.arrowIconWrap}>
          <ArrowLeft size={20} color={color} strokeWidth={3.5} />
        </View>
      )}

      {/* Pill Badge */}
      <View style={[styles.badge, { backgroundColor: color }]}>
        <Text numberOfLines={1} style={[styles.label, { color: textColor }]}>
          {label}
        </Text>
        {sublabel ? (
          <Text numberOfLines={1} style={[styles.sublabel, { color: textColor }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      {/* If pointing DOWN, show arrow below badge */}
      {direction === 'down' && (
        <View style={styles.arrowIconWrap}>
          <ArrowDown size={20} color={color} strokeWidth={3.5} />
        </View>
      )}

      {/* If pointing RIGHT, show arrow on right */}
      {direction === 'right' && (
        <View style={styles.arrowIconWrap}>
          <ArrowRight size={20} color={color} strokeWidth={3.5} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  arrowIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sublabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.85,
  },
});
