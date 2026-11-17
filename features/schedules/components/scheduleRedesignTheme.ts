import { useMemo } from 'react';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

export const scheduleRedesignLight = {
  background: '#FAF6F0',
  surface: '#FFFFFF',
  border: '#E6DCCF',
  mutedSurface: '#F3ECE2',
  tabTrack: '#F0E8DD',
  primaryTint: '#F6E9EC',
  primary: '#7A1C2C',
  text: '#2A1F1C',
  secondaryText: '#6B5A52',
  doneText: '#4A3C36',
  successBackground: '#E3F3E6',
  successText: '#1B6B30',
  warningBackground: '#FFF1D6',
  warningText: '#7A4B00',
  dangerBackground: '#FDECEC',
  dangerBorder: '#F2C4C4',
  dangerText: '#9B1C1C',
  disabledBackground: '#EFE6DA',
} as const;

export type ScheduleRedesignTheme = {
  [Key in keyof typeof scheduleRedesignLight]: string;
};

export function useScheduleRedesignTheme(): ScheduleRedesignTheme {
  const { colors, isDark } = useAppTheme();
  return useMemo(
    () => (isDark
      ? {
          ...scheduleRedesignLight,
          background: colors.background,
          surface: colors.card,
          border: colors.cardBorder,
          mutedSurface: colors.cardMuted,
          tabTrack: colors.cardMuted,
          primaryTint: colors.accentMuted,
          primary: colors.accent,
          text: colors.textPrimary,
          secondaryText: colors.textSecondary,
          doneText: colors.textSecondary,
          successBackground: colors.successMuted,
          successText: colors.success,
          warningBackground: colors.warningMuted,
          warningText: colors.warning,
          dangerBackground: colors.dangerMuted,
          dangerBorder: colors.cardBorder,
          dangerText: colors.danger,
          disabledBackground: colors.cardMuted,
        }
      : scheduleRedesignLight),
    [colors, isDark],
  );
}

export const scheduleRedesignLayout = {
  pagePadding: 18,
  sectionGap: 16,
  cardRadius: 20,
  innerRadius: 14,
  pillRadius: 12,
  primaryButtonHeight: 54,
  fontFamily: 'Poppins',
} as const;
