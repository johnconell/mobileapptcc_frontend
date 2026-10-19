import React, { memo, useContext, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { SkeletonAnimationContext } from './SkeletonProvider';

export interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

const LIGHT_BASE = '#D6D3CC';
const LIGHT_HIGHLIGHT = '#E7E5E0';
const DARK_BASE = '#2A2D34';
const DARK_HIGHLIGHT = '#3A3E47';

export const SkeletonBox = memo(function SkeletonBox({
  width = '100%',
  height = 14,
  borderRadius = 7,
  style,
}: SkeletonBoxProps) {
  const animation = useContext(SkeletonAnimationContext);
  const { isDark } = useAppTheme();
  const highlightOpacity =
    animation?.reducedMotion === false ? animation.opacity : 0.7;

  useEffect(() => animation?.registerBlock(), [animation?.registerBlock]);

  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: isDark ? DARK_BASE : LIGHT_BASE,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: isDark ? DARK_HIGHLIGHT : LIGHT_HIGHLIGHT,
            opacity: highlightOpacity,
          },
        ]}
      />
    </View>
  );
});



const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
