/**
 * Applicant examination-process UI tokens (join → passkey → lobby → exam → submit).
 * Cream canvas + maroon accents; soft Poppins typography applied in chrome.
 */
export const examProcess = {
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

export const EXAM_PROCESS_STEPS = [
  'Join',
  'Key',
  'Confirm',
  'Lobby',
  'Exam',
  'Done',
] as const;

export type ExamProcessStepIndex = 0 | 1 | 2 | 3 | 4 | 5;
