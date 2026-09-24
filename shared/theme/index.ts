export { examProcess, EXAM_PROCESS_STEPS } from './examProcess';
export type { ExamProcessStepIndex } from './examProcess';

export const designTokens = {
  light: {
    primary: '#7A1F2B',
    primaryDark: '#5C1620',
    primarySoft: '#F5E8EA',
    secondary: '#D8901F',
    secondarySoft: '#F5E4C3',
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
    heroGradient: 'radial-gradient(ellipse 60% 45% at 50% 25%, rgba(216, 144, 31, 0.18) 0%, rgba(123, 16, 32, 0.08) 40%, rgba(253, 242, 248, 0.15) 65%, transparent 80%)',
  },
  dark: {
    primary: '#A63A4A',
    primaryDark: '#C05D68',
    primarySoft: 'rgba(166, 58, 74, 0.14)',
    secondary: '#D3902A',
    secondarySoft: 'rgba(211, 144, 42, 0.2)',
    background: '#14110F',
    surface: '#1E1A17',
    surfaceMuted: '#25201C',
    ink: '#FAF7F2',
    inkSecondary: '#C9BDB0',
    inkMuted: '#9A8E82',
    border: '#322C27',
    success: '#3D9B5F',
    warning: '#D97706',
    danger: '#C45A5A',
    info: '#7EA9D8',
    white: '#FFFFFF',
    overlay: 'rgba(14, 10, 9, 0.66)',
    heroGradient: 'radial-gradient(ellipse 60% 45% at 50% 25%, rgba(211, 144, 42, 0.22) 0%, rgba(166, 58, 74, 0.14) 38%, rgba(20, 17, 15, 0.1) 65%, transparent 80%)',
  },
} as const;

/** TCC brand: cream canvas + maroon (not bright red). */
export const colors = designTokens.light;
export const darkColors = designTokens.dark;

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
