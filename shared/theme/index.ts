export { examProcess, EXAM_PROCESS_STEPS } from './examProcess';
export type { ExamProcessStepIndex } from './examProcess';
export * from './theme';

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
    primary: '#D28994',
    primaryDark: '#D28994',
    primarySoft: 'rgba(210, 137, 148, 0.15)',
    secondary: '#D2B889',
    secondarySoft: 'rgba(210, 184, 137, 0.15)',
    background: '#0B0D10',
    surface: '#13161B',
    surfaceMuted: '#1A1E25',
    surfaceModal: '#222730',
    ink: 'rgba(255, 255, 255, 0.87)',
    inkSecondary: 'rgba(255, 255, 255, 0.60)',
    inkMuted: 'rgba(255, 255, 255, 0.38)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    success: '#7FD8A4',
    warning: '#E2BA70',
    danger: '#E57B85',
    info: '#8AB8E6',
    white: 'rgba(255, 255, 255, 0.87)',
    overlay: 'rgba(0, 0, 0, 0.70)',
    heroGradient: 'none',
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
