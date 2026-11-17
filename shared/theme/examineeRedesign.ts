import { useMemo } from 'react';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';

export const examineeRedesignLight = {
  background: '#FAF6F0',
  card: '#FFFDF8',
  cardBorder: '#E3D8CA',
  secondaryCard: '#F1E8DB',
  primarySoft: '#F3E4E7',
  text: '#2B2118',
  secondaryText: '#6B5E52',
  primary: '#7B1E2B',
  gold: '#D98F1E',
  orange: '#C2410C',
  successBackground: '#E7F3EA',
  successText: '#14612F',
  warningBackground: '#FFF3D6',
  warningBorder: '#E3B85A',
  cameraBackground: '#2B2118',
  error: '#9B1C1C',
  white: '#FFFFFF',
  overlay: 'rgba(43, 33, 24, 0.46)',
} as const;

export const examineeRedesignDark = {
  background: '#17130F',
  card: '#28211B',
  cardBorder: '#5B4B3C',
  secondaryCard: '#3A2F25',
  primarySoft: '#54222A',
  text: '#FFF7ED',
  secondaryText: '#D2C2B3',
  primary: '#A83A4A',
  gold: '#F0AC38',
  orange: '#F26A27',
  successBackground: '#173B25',
  successText: '#9CE6B0',
  warningBackground: '#4A391B',
  warningBorder: '#C49A4E',
  cameraBackground: '#0D0A07',
  error: '#FF9D9D',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.72)',
} as const;

export type ExamineeRedesignTheme = {
  [Key in keyof typeof examineeRedesignLight]: string;
};

export function getExamineeRedesignTheme(isDark: boolean): ExamineeRedesignTheme {
  return isDark ? examineeRedesignDark : examineeRedesignLight;
}

export function useExamineeRedesignTheme() {
  const { isDark } = useThemeTokens();
  return useMemo(() => getExamineeRedesignTheme(isDark), [isDark]);
}

export const examineeRedesignLayout = {
  screenPadding: 20,
  verticalPadding: 22,
  gap: 14,
  cardRadius: 18,
  cardPadding: 16,
  buttonHeight: 54,
  buttonRadius: 16,
} as const;
