import React, { memo } from 'react';
import { SkeletonBox } from './SkeletonBox';

export const SkeletonCircle = memo(function SkeletonCircle({
  size = 44,
}: {
  size?: number;
}) {
  return <SkeletonBox width={size} height={size} borderRadius={size / 2} />;
});
