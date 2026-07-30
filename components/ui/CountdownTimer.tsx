import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { formatTime } from '@/utils';
import { colors, radii } from '@/theme';

interface CountdownTimerProps {
  remainingSeconds: number;
  compact?: boolean;
  warningThreshold?: number;
}

export function CountdownTimer({
  remainingSeconds,
  compact = false,
  warningThreshold = 300,
}: CountdownTimerProps) {
  const isWarning = remainingSeconds <= warningThreshold;

  return (
    <View style={[styles.wrap, compact && styles.compact, isWarning && styles.warning]}>
      <Clock size={compact ? 14 : 16} color={isWarning ? colors.danger : colors.primary} />
      <Text style={[styles.text, isWarning && styles.warningText]}>
        {formatTime(remainingSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0D9DC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  compact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  warning: {
    backgroundColor: '#FEE2E2',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  warningText: {
    color: colors.danger,
  },
});
