import React, { memo } from 'react';
import type { DimensionValue, ViewStyle } from 'react-native';
import { SkeletonBox } from './SkeletonBox';

export const SkeletonText = memo(function SkeletonText({
  width = '100%',
  height = 12,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: ViewStyle;
}) {
  return <SkeletonBox width={width} height={height} borderRadius={height / 2} style={style} />;
});
