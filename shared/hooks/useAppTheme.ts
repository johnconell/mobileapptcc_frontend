import { useColorScheme } from 'react-native';
import { useSettingsStore, type ThemeMode, type AppFontSize } from '@/features/settings/stores/settingsStore';

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
};

// Light theme — cream canvas + maroon accents (not bright red)
const lightColors: AppThemeColors = {
  background: '#FAF7F2',
  card: '#FFFDF8',
  cardBorder: '#E8DFD3',
  cardMuted: '#F5EFE6',
  textPrimary: '#2C241C',
  textSecondary: '#7A6E62',
  textMuted: '#9A8E82',
  accent: '#7A1F2B',
  accentMuted: '#F5E8EA',
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
};

// Dark theme — deep charcoal with maroon accents
const darkColors: AppThemeColors = {
  background: '#14110F',
  card: '#1E1A17',
  cardBorder: '#322C27',
  cardMuted: '#25201C',
  textPrimary: '#FAF7F2',
  textSecondary: '#C9BDB0',
  textMuted: '#9A8E82',
  accent: '#A63A4A',
  accentMuted: '#3A1C22',
  success: '#3D9B5F',
  successMuted: '#1A2E22',
  danger: '#C45A5A',
  dangerMuted: '#3A1C1C',
  warning: '#D97706',
  warningMuted: '#3A2A12',
  tabBarBg: '#14110F',
  tabBarBorder: '#322C27',
  tabBarActive: '#A63A4A',
  tabBarInactive: '#9A8E82',
  inputBg: '#25201C',
  inputBorder: '#3A322C',
  searchBg: '#1E1A17',
};

export function useAppTheme() {
  const systemColorScheme = useColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const setFontSize = useSettingsStore((s) => s.setFontSize);

  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  const colors = isDark ? darkColors : lightColors;

  // Font scale multipliers for user friendly reading across the entire frontend
  const fontMultiplier = fontSize === 'small' ? 0.88 : fontSize === 'large' ? 1.20 : 1.0;

  const scaleFont = (basePx: number) => Math.round(basePx * fontMultiplier);

  return {
    isDark,
    themeMode,
    fontSize,
    setThemeMode,
    setFontSize,
    colors,
    fontMultiplier,
    scaleFont,
  };
}
