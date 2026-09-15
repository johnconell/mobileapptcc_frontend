/**
 * Applicant examination-process UI tokens (join → passkey → lobby → exam → submit).
 * Scoped to the student flow; does not replace the global TCC brand theme.
 */
export const examProcess = {
  pageBg: '#F5F6F8',
  ink: '#10141A',
  muted: '#5B616B',
  cardBg: '#FFFFFF',
  cardBorder: '#DDE1E7',
  cardElevated: '#EEF1FD',
  inputBg: '#F5F6F8',
  inputBorder: '#C5CAD3',
  accent: '#2F49E8',
  accentSoft: '#EEF1FD',
  accentMuted: '#A8B4F5',
  progressTrack: '#DDE1E7',
  error: '#B42318',
  danger: '#B42318',
  dangerSoft: '#FEE4E2',
  okBg: '#E7F5F1',
  okText: '#0E7C66',
  white: '#FFFFFF',
  black: '#0B0B0B',
  overlay: 'rgba(16, 20, 26, 0.45)',
  radiusCard: 10,
  radiusControl: 6,
  radiusProgress: 2,
  padPage: 16,
  padCard: 20,
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
