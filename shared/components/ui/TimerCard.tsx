import React, { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { getTimerColors } from '@/shared/theme/theme';

interface TimerCardProps {
  remainingSeconds: number;
  totalDurationSeconds?: number;
}

function TimerCardComponent({
  remainingSeconds,
  totalDurationSeconds = 3600,
}: TimerCardProps) {
  const { theme } = useThemeTokens();

  const total = totalDurationSeconds > 0 ? totalDurationSeconds : 3600;
  const percentLeft = Math.max(0, Math.min(100, (remainingSeconds / total) * 100));
  const timerColors = getTimerColors(theme, percentLeft);

  const safeSec = Math.max(0, remainingSeconds);
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: timerColors.bg,
          borderColor: timerColors.border,
        },
      ]}
      accessibilityRole="timer"
      accessibilityLabel={`Exam timer: ${mins} minutes, ${secs} seconds remaining`}
    >
      <Text
        style={[
          styles.timeText,
          {
            color: timerColors.text,
          },
        ]}
      >
        {formatted}
      </Text>
      <View
        style={[
          styles.track,
          {
            backgroundColor: timerColors.track,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${percentLeft}%`,
              backgroundColor: timerColors.fill,
            },
          ]}
        />
      </View>
    </View>
  );
}

export const TimerCard = memo(TimerCardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  timeText: {
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: 1,
    lineHeight: 38,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  track: {
    height: 5,
    borderRadius: 3,
    width: '100%',
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
