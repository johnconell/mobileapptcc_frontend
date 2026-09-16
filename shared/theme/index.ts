export { examProcess, EXAM_PROCESS_STEPS } from './examProcess';
export type { ExamProcessStepIndex } from './examProcess';

/** TCC brand: cream canvas + maroon (not bright red). */
export const colors = {
  primary: '#7A1F2B',
  primaryDark: '#5C1620',
  secondary: '#C4A35A',
  background: '#FAF7F2',
  surface: '#FFFDF8',
  surfaceMuted: '#F5EFE6',
  ink: '#2C241C',
  inkSecondary: '#7A6E62',
  inkMuted: '#9A8E82',
  border: '#E8DFD3',
  success: '#1B6B3A',
  warning: '#B45309',
  danger: '#9B1C1C',
  info: '#3B6EA5',
  white: '#FFFFFF',
  overlay: 'rgba(44, 36, 28, 0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  card: 20,
  button: 14,
  full: 999,
} as const;

export const shadows = {
  soft: {
    shadowColor: '#2C241C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  card: {
    shadowColor: '#2C241C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
} as const;

export const typography = {
  hero: {
    fontSize: 26,
    fontWeight: '600' as const,
    lineHeight: 34,
    fontFamily: 'Poppins_600SemiBold',
  },
  title: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
    fontFamily: 'Poppins_600SemiBold',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 24,
    fontFamily: 'Poppins_500Medium',
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  label: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    fontFamily: 'Poppins_500Medium',
  },
};
