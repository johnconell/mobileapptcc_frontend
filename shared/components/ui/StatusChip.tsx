import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { radii } from '@/shared/theme';
import { STATUS_LABELS } from '@/shared/constants';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

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
  not_arrived: 'default',
  finished: 'success',
  warning: 'danger',
  terminated: 'danger',
  scheduled: 'default',
  lobby_open: 'danger',
  in_progress: 'primary',
  ended: 'success',
};

export function StatusChip({ label, status, tone }: StatusChipProps) {
  const { colors: themeColors, isDark } = useAppTheme();
  const resolvedTone = tone ?? (status ? statusToneMap[status] ?? 'default' : 'default');
  const text = label ?? (status ? STATUS_LABELS[status] : '');

  const chipPalette = isDark
    ? {
        default: { bg: themeColors.cardMuted, text: themeColors.textSecondary },
        success: { bg: themeColors.successMuted, text: themeColors.success },
        warning: { bg: themeColors.warningMuted, text: themeColors.warning },
        danger: { bg: themeColors.dangerMuted, text: themeColors.danger },
        info: { bg: 'rgba(138, 184, 230, 0.15)', text: '#8AB8E6' },
        primary: { bg: themeColors.accentMuted, text: themeColors.accent },
      }
    : {
        default: { bg: '#EFEAE1', text: '#786B59' },
        success: { bg: themeColors.successMuted, text: themeColors.success },
        warning: { bg: themeColors.warningMuted, text: themeColors.warning },
        danger: { bg: themeColors.dangerMuted, text: themeColors.danger },
        info: { bg: '#E0EDFE', text: '#0055A4' },
        primary: { bg: themeColors.accentMuted, text: themeColors.accent },
      };

  const currentColors = chipPalette[resolvedTone];

  return (
    <View style={[styles.chip, { backgroundColor: currentColors.bg }]}>
      <View style={[styles.dot, { backgroundColor: currentColors.text }]} />
      <Text
        style={[styles.text, { color: currentColors.text }]}
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
