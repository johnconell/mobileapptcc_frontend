import React, { memo } from 'react';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SkeletonBox } from './SkeletonBox';
import { SkeletonCircle } from './SkeletonCircle';
import { SkeletonText } from './SkeletonText';

export const SkeletonCard = memo(function SkeletonCard({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.card, style]}>
      {children ?? (
        <>
          <View style={styles.row}>
            <SkeletonCircle size={42} />
            <View style={styles.textGroup}>
              <SkeletonText width="64%" height={14} />
              <SkeletonText width="42%" height={11} />
            </View>
            <SkeletonBox width={58} height={24} borderRadius={12} />
          </View>
          <SkeletonText width="72%" height={11} />
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
    backgroundColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textGroup: { flex: 1, gap: 8 },
});
