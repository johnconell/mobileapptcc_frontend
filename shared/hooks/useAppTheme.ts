import { useSettingsStore, type ThemeMode, type AppFontSize } from '@/features/settings/stores/settingsStore';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { useMemo } from 'react';

export type AppThemeColors = {
  background: string;
  card: string;
  cardBorder: string;
  cardMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  accentGold: string;
  success: string;
  successMuted: string;
  danger: string;
  dangerMuted: string;
  warning: string;
  warningMuted: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  inputBg: string;
  inputBorder: string;
  searchBg: string;
  modal: string;
  overlay: string;
};

export const lightColors: AppThemeColors = {
  background: '#FAF7F2',
  card: '#FFFDF8',
  cardBorder: '#E8DFD3',
  cardMuted: '#F5EFE6',
  textPrimary: '#2C241C',
  textSecondary: '#7A6E62',
  textMuted: '#9A8E82',
  accent: '#7A1F2B',
  accentMuted: '#F5E8EA',
  accentGold: '#D8901F',
  success: '#1B6B3A',
  successMuted: '#EAF5EE',
  danger: '#9B1C1C',
  dangerMuted: '#F8E8E8',
  warning: '#B45309',
  warningMuted: '#FEF3C7',
  tabBarBg: '#FFFDF8',
  tabBarBorder: '#E8DFD3',
  tabBarActive: '#7A1F2B',
  tabBarInactive: '#9A8E82',
  inputBg: '#FFFDF8',
  inputBorder: '#DDD2C4',
  searchBg: '#FFFDF8',
  modal: '#FFFFFF',
  overlay: 'rgba(44, 36, 28, 0.45)',
};

export const darkColors: AppThemeColors = {
  // Surface levels 0..3 (Rule 1 & 2: page #0B0D10, card #13161B, popover #1A1E25, modal #222730)
  background: '#0B0D10',
  card: '#13161B',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  cardMuted: '#1A1E25',

  // Typography (Rule 3: one white at three alphas)
  textPrimary: 'rgba(255, 255, 255, 0.87)',
  textSecondary: 'rgba(255, 255, 255, 0.60)',
  textMuted: 'rgba(255, 255, 255, 0.38)',

  // Accents (Rule 4: calmed maroon & gold)
  accent: '#D28994',
  accentMuted: 'rgba(210, 137, 148, 0.15)',
  accentGold: '#D2B889',

  // Semantics softened similarly
  success: '#7FD8A4',
  successMuted: 'rgba(127, 216, 164, 0.15)',
  danger: '#E57B85',
  dangerMuted: 'rgba(229, 123, 133, 0.15)',
  warning: '#E2BA70',
  warningMuted: 'rgba(226, 186, 112, 0.15)',

  // Navigation & inputs
  tabBarBg: '#13161B',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  tabBarActive: '#D28994',
  tabBarInactive: 'rgba(255, 255, 255, 0.38)',
  inputBg: '#1A1E25',
  inputBorder: 'rgba(255, 255, 255, 0.08)',
  searchBg: '#1A1E25',
  modal: '#222730',
  overlay: 'rgba(0, 0, 0, 0.70)',
};

export function useAppTheme() {
  const { isDark, themeMode, setThemeMode, theme } = useThemeTokens();
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const fontMultiplier = fontSize === 'small' ? 0.88 : fontSize === 'large' ? 1.20 : 1.0;
  const scaleFont = (basePx: number) => Math.round(basePx * fontMultiplier);

  return {
    isDark,
    themeMode,
    fontSize,
    setThemeMode,
    setFontSize,
    colors,
    theme,
    fontMultiplier,
    scaleFont,
  };
}
