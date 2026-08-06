import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radii, spacing } from '@/theme';

/**
 * One shared clock drives every placeholder on screen so the pulses stay in
 * phase instead of shimmering independently.
 */
function useSkeletonPulse() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  return useAnimatedStyle(() => ({ opacity: 0.45 + progress.value * 0.35 }));
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const pulse = useSkeletonPulse();

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius: radius ?? Math.min(height / 2, radii.sm) },
        pulse,
        style,
      ]}
    />
  );
}

export function SkeletonCircle({ size = 44 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius={radii.full} />;
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  gap = spacing.sm,
}: {
  lines?: number;
  lastLineWidth?: DimensionValue;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={12}
          width={index === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** Rows with an avatar and two lines — schedules, sessions, rooms, rosters. */
export function SkeletonList({
  rows = 6,
  showAvatar = true,
}: {
  rows?: number;
  showAvatar?: boolean;
}) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonCard key={index}>
          <View style={styles.row}>
            {showAvatar ? <SkeletonCircle /> : null}
            <View style={styles.rowBody}>
              <Skeleton height={14} width="70%" />
              <Skeleton height={11} width="45%" />
            </View>
            <Skeleton height={22} width={64} radius={radii.full} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

/** Label + input pairs with a submit button — login, passkey, confirmation. */
export function SkeletonForm({ fields = 3 }: { fields?: number }) {
  return (
    <View style={styles.form}>
      <Skeleton height={22} width="55%" />
      <Skeleton height={12} width="80%" />
      <View style={styles.formFields}>
        {Array.from({ length: fields }).map((_, index) => (
          <View key={index} style={styles.field}>
            <Skeleton height={11} width="32%" />
            <Skeleton height={48} radius={radii.button} />
          </View>
        ))}
      </View>
      <Skeleton height={52} radius={radii.button} />
    </View>
  );
}

/** A single detail card above an action button — room detail, confirmation. */
export function SkeletonDetail() {
  return (
    <View style={styles.form}>
      <SkeletonCard>
        <View style={styles.row}>
          <SkeletonCircle size={52} />
          <View style={styles.rowBody}>
            <Skeleton height={16} width="65%" />
            <Skeleton height={11} width="40%" />
          </View>
        </View>
        <View style={styles.detailMeta}>
          <SkeletonText lines={3} />
        </View>
      </SkeletonCard>
      <Skeleton height={52} radius={radii.button} />
    </View>
  );
}

/** Full page: heading block, then rows. Used for list screens. */
export function SkeletonScreen({
  rows = 5,
  showAvatar = true,
}: {
  rows?: number;
  showAvatar?: boolean;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Skeleton height={24} width="58%" />
        <Skeleton height={12} width="80%" />
      </View>
      <SkeletonList rows={rows} showAvatar={showAvatar} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceMuted,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: spacing.sm,
  },
  detailMeta: {
    paddingTop: spacing.sm,
  },
  form: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  formFields: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
});
