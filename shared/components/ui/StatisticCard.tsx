import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, StyleProp, ViewStyle } from 'react-native';
import { Card } from '@/shared/components/ui/Card';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface StatisticCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'info';
  delay?: number;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function StatisticCard({
  label,
  value,
  icon,
  tone = 'default',
  delay = 0,
  hint,
  style,
  compact: explicitCompact,
}: StatisticCardProps) {
  const { width } = useWindowDimensions();
  const { colors: themeColors, isDark } = useAppTheme();
  const isCompact = explicitCompact ?? width < 420;

  const toneBg = isDark
    ? tone === 'success'
      ? '#142918'
      : tone === 'warning'
      ? '#291E0A'
      : tone === 'info'
      ? '#1A2035'
      : '#2A1818'
    : tone === 'success'
    ? themeColors.successMuted
    : tone === 'warning'
    ? themeColors.warningMuted
    : tone === 'info'
    ? '#E0EDFE'
    : themeColors.accentMuted;

  return (
    <Card
      delay={delay}
      style={{
        ...styles.card,
        backgroundColor: themeColors.card,
        borderColor: themeColors.cardBorder,
        ...(isCompact ? styles.cardCompact : null),
        ...(style as object),
      }}
    >
      <View style={[styles.inner, isCompact && styles.innerCompact]}>
        {icon ? (
          <View style={[styles.iconWrap, { backgroundColor: toneBg }]}>
            {icon}
          </View>
        ) : null}
        <View style={styles.meta}>
          <Text style={[styles.value, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {value}
          </Text>
          <Text style={[styles.label, { color: themeColors.textSecondary }]} numberOfLines={2}>
            {label}
          </Text>
          {hint ? (
            <Text style={[styles.hint, { color: themeColors.textMuted }]} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 104,
    maxWidth: '100%',
  },
  cardCompact: {
    flexBasis: '47%',
    minWidth: '46%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
  },
  innerCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  meta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  hint: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
  },
});
