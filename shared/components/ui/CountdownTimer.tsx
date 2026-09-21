import React from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { Clock } from 'lucide-react-native';
import { formatTime } from '@/shared/utils';
import { examUi } from '@/shared/theme/examUi';
import { examProcess } from '@/shared/theme/examProcess';

interface CountdownTimerProps {
  remainingSeconds: number;
  compact?: boolean;
  /** Seconds remaining at which amber warning starts (default 5 minutes). */
  warningThreshold?: number;
  /** Seconds remaining at which red danger starts (default 1 minute). */
  dangerThreshold?: number;
  darkMode?: boolean;
}

export function CountdownTimer({
  remainingSeconds,
  compact = false,
  warningThreshold = 300,
  dangerThreshold = 60,
  darkMode = false,
}: CountdownTimerProps) {
  const isDanger = remainingSeconds <= dangerThreshold;
  const isWarning = !isDanger && remainingSeconds <= warningThreshold;

  const tone = isDanger
    ? darkMode
      ? examUi.timerDanger.dark
      : examUi.timerDanger.light
    : isWarning
      ? darkMode
        ? examUi.timerWarn.dark
        : examUi.timerWarn.light
      : darkMode
        ? examUi.dark.ink
        : examUi.light.ink;

  const bg = isDanger
    ? 'rgba(231, 76, 60, 0.18)'
    : isWarning
      ? 'rgba(245, 166, 35, 0.18)'
      : darkMode
        ? examUi.dark.pill
        : examUi.light.pill;

  return (
    <View style={[styles.wrap, compact && styles.compact, { backgroundColor: bg }]}>
      <Clock size={compact ? 13 : 15} color={tone} />
      <Text style={[styles.text, compact && styles.textCompact, { color: tone }]}>
        {formatTime(remainingSeconds) || '00:00'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  text: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.6,
  },
  textCompact: {
    fontSize: 13,
  },
});
