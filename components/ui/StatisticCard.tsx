import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Card } from './Card';
import { colors } from '@/theme';

interface StatisticCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'info';
  delay?: number;
}

export function StatisticCard({
  label,
  value,
  icon,
  tone = 'default',
  delay = 0,
}: StatisticCardProps) {
  return (
    <Card delay={delay} style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, toneStyles[tone]]}>{icon}</View>
        <View style={styles.meta}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: '46%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  meta: { flex: 1, gap: 2 },
  value: { fontSize: 22, fontWeight: '700', color: colors.ink },
  label: { fontSize: 12, fontWeight: '600', color: colors.inkMuted },
});

const toneStyles = StyleSheet.create({
  default: { backgroundColor: '#F0D9DC' },
  success: { backgroundColor: '#DCFCE7' },
  warning: { backgroundColor: '#FEF3C7' },
  info: { backgroundColor: '#DBEAFE' },
});
