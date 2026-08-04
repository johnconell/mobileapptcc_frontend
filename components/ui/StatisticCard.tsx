import React from 'react';
import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import { Card } from './Card';
import { colors } from '@/theme';

interface StatisticCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'info';
  delay?: number;
  /** Optional short hint under the label */
  hint?: string;
}

/**
 * Compact metric tile. Stacks icon above text on narrow widths so 2–3
 * columns stay aligned without overlapping icons/labels.
 */
export function StatisticCard({
  label,
  value,
  icon,
  tone = 'default',
  delay = 0,
  hint,
}: StatisticCardProps) {
  const { width } = useWindowDimensions();
  const compact = width < 420;

  return (
    <Card delay={delay} style={{ ...styles.card, ...(compact ? styles.cardCompact : null) }}>
      <View style={[styles.inner, compact && styles.innerCompact]}>
        {icon ? (
          <View style={[styles.iconWrap, toneStyles[tone]]}>{icon}</View>
        ) : null}
        <View style={styles.meta}>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          {hint ? (
            <Text style={styles.hint} numberOfLines={2}>
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
  meta: { flex: 1, gap: 2, minWidth: 0 },
  value: { fontSize: 20, fontWeight: '800', color: colors.ink },
  label: { fontSize: 11, fontWeight: '700', color: colors.inkMuted, lineHeight: 14 },
  hint: { fontSize: 10, fontWeight: '500', color: colors.inkSecondary, lineHeight: 13 },
});

const toneStyles = StyleSheet.create({
  default: { backgroundColor: '#F0D9DC' },
  success: { backgroundColor: '#DCFCE7' },
  warning: { backgroundColor: '#FEF3C7' },
  info: { backgroundColor: '#DBEAFE' },
});
