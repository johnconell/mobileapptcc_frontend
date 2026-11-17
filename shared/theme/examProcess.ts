import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { useMemo } from 'react';

/**
 * Applicant examination-process UI tokens (join → passkey → lobby → exam → submit).
 * Light: Cream canvas + maroon accents.
 * Dark: System surface 0..3, calmed brand maroon, one white at three alphas, white-alpha hairlines.
 */
export const examProcessLight = {
  pageBg: '#FAF7F2',
  ink: '#2C241C',
  muted: '#7A6E62',
  cardBg: '#FFFDF8',
  cardBorder: '#E8DFD3',
  cardElevated: '#F5EFE6',
  inputBg: '#FFFDF8',
  inputBorder: '#DDD2C4',
  accent: '#7A1F2B',
  accentSoft: '#F5E8EA',
  accentMuted: '#C4A0A6',
  progressActive: '#7A1F2B',
  progressTrack: '#E5DDD2',
  progressInactive: '#C9BDB0',
  error: '#9B1C1C',
  danger: '#9B1C1C',
  dangerSoft: '#F8E8E8',
  okBg: '#EAF5EE',
  okText: '#1B6B3A',
  white: '#FFFFFF',
  black: '#1A1410',
  overlay: 'rgba(44, 36, 28, 0.4)',
  radiusCard: 16,
  radiusControl: 12,
  radiusProgress: 999,
  padPage: 16,
  padCard: 20,
  fontRegular: 'Poppins_400Regular',
  fontMedium: 'Poppins_500Medium',
  fontSemiBold: 'Poppins_600SemiBold',
} as const;

export const examProcessDark = {
  // Surface levels 0..3
  pageBg: '#0B0D10',          // Level 0
  cardBg: '#13161B',          // Level 1
  cardElevated: '#1A1E25',    // Level 2
  inputBg: '#1A1E25',         // Level 2
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  inputBorder: 'rgba(255, 255, 255, 0.08)',

  // Typography (Rule 3)
  ink: 'rgba(255, 255, 255, 0.87)',
  muted: 'rgba(255, 255, 255, 0.60)',

  // Accents (Rule 4)
  accent: '#D28994',
  accentSoft: 'rgba(210, 137, 148, 0.15)',
  accentMuted: 'rgba(210, 137, 148, 0.35)',
  progressActive: '#D28994',
  progressTrack: 'rgba(255, 255, 255, 0.08)',
  progressInactive: 'rgba(255, 255, 255, 0.38)',

  // Semantics
  error: '#E57B85',
  danger: '#E57B85',
  dangerSoft: 'rgba(229, 123, 133, 0.15)',
  okBg: 'rgba(127, 216, 164, 0.15)',
  okText: '#7FD8A4',

  white: 'rgba(255, 255, 255, 0.87)',
  black: '#0B0D10',
  overlay: 'rgba(0, 0, 0, 0.70)',

  radiusCard: 16,
  radiusControl: 12,
  radiusProgress: 999,
  padPage: 16,
  padCard: 20,
  fontRegular: 'Poppins_400Regular',
  fontMedium: 'Poppins_500Medium',
  fontSemiBold: 'Poppins_600SemiBold',
} as const;

export const examProcess = examProcessLight;

export function getExamProcessTokens(isDark: boolean) {
  return isDark ? examProcessDark : examProcessLight;
}

export function useExamProcess() {
  const { isDark } = useThemeTokens();
  return useMemo(() => getExamProcessTokens(isDark), [isDark]);
}

export const EXAM_PROCESS_STEPS = [
  'Join',
  'Key',
  'Confirm',
  'Lobby',
  'Exam',
  'Done',
] as const;

export type ExamProcessStepIndex = 0 | 1 | 2 | 3 | 4 | 5;
