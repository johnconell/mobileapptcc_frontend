import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors, radii } from '@/theme';
import { STATUS_LABELS } from '@/constants';

type ChipTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

interface StatusChipProps {
  label?: string;
  status?: keyof typeof STATUS_LABELS;
  tone?: ChipTone;
}

const statusToneMap: Record<string, ChipTone> = {
  connected: 'info',
  waiting: 'warning',
  taking_exam: 'primary',
  finished: 'success',
  scheduled: 'default',
  lobby_open: 'warning',
  in_progress: 'primary',
  ended: 'success',
};

export function StatusChip({ label, status, tone }: StatusChipProps) {
  const resolvedTone = tone ?? (status ? statusToneMap[status] ?? 'default' : 'default');
  const text = label ?? (status ? STATUS_LABELS[status] : '');

  return (
    <View style={[styles.chip, toneStyles[resolvedTone]]}>
      <View style={[styles.dot, { backgroundColor: textColors[resolvedTone] }]} />
      <Text style={[styles.text, { color: textColors[resolvedTone] }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '700' },
});

const toneStyles = StyleSheet.create({
  default: { backgroundColor: colors.surfaceMuted },
  success: { backgroundColor: '#DCFCE7' },
  warning: { backgroundColor: '#FEF3C7' },
  danger: { backgroundColor: '#FEE2E2' },
  info: { backgroundColor: '#DBEAFE' },
  primary: { backgroundColor: '#F0D9DC' },
});

const textColors: Record<ChipTone, string> = {
  default: colors.inkSecondary,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  primary: colors.primary,
};
