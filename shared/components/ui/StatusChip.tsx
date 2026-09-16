import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors, radii } from '@/shared/theme';
import { STATUS_LABELS } from '@/shared/constants';

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
  disconnected: 'danger',
  finished: 'success',
  warning: 'danger',
  terminated: 'danger',
  scheduled: 'default',
  lobby_open: 'danger',
  in_progress: 'primary',
  ended: 'success',
};

export function StatusChip({ label, status, tone }: StatusChipProps) {
  const resolvedTone = tone ?? (status ? statusToneMap[status] ?? 'default' : 'default');
  const text = label ?? (status ? STATUS_LABELS[status] : '');

  return (
    <View style={[styles.chip, toneStyles[resolvedTone]]}>
      <View style={[styles.dot, { backgroundColor: textColors[resolvedTone] }]} />
      <Text
        style={[styles.text, { color: textColors[resolvedTone] }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {text}
      </Text>
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
  default: { backgroundColor: '#1A1A1A' },
  success: { backgroundColor: '#142918' },
  warning: { backgroundColor: '#291E0A' },
  danger: { backgroundColor: '#2A1414' },
  info: { backgroundColor: '#162238' },
  primary: { backgroundColor: '#2A1414' },
});

const textColors: Record<ChipTone, string> = {
  default: '#A1A1AA',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#7A1F2B',
  info: '#38BDF8',
  primary: '#7A1F2B',
};
