import { useColorScheme } from 'react-native';
import { useSettingsStore, type ThemeMode, type AppFontSize } from '@/stores/settingsStore';

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

// Light theme colors - clean executive navy & slate
const lightColors: AppThemeColors = {
  background: '#F5F7FA',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  cardMuted: '#F8FAFC',
  textPrimary: '#003366',
  textSecondary: '#475569',
  textMuted: '#64748B',
  accent: '#0055A4',
  accentMuted: '#EBF3FE',
  success: '#28A745',
  successMuted: '#E6F4EA',
  danger: '#DC3545',
  dangerMuted: '#FEE2E2',
  warning: '#D97706',
  warningMuted: '#FEF3C7',
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabBarActive: '#003366',
  tabBarInactive: '#64748B',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  searchBg: '#FFFFFF',
};

// High-contrast dark theme colors - NEVER blends into background!
// Uses crisp elevated slate cards with distinct borders and bright text
const darkColors: AppThemeColors = {
  background: '#0B1120',
  card: '#1E293B',
  cardBorder: '#334155',
  cardMuted: '#0F172A',
  textPrimary: '#F8FAFC',     // Pure high-contrast white
  textSecondary: '#CBD5E1',   // Bright legible slate
  textMuted: '#94A3B8',       // Medium legible slate
  accent: '#38BDF8',         // Vivid sky blue
  accentMuted: '#0369A130',
  success: '#4ADE80',        // Vivid emerald green
  successMuted: '#14532D40',
  danger: '#F87171',         // Vivid coral red
  dangerMuted: '#7F1D1D40',
  warning: '#FBBF24',        // Bright amber
  warningMuted: '#78350F40',
  tabBarBg: '#0F172A',
  tabBarBorder: '#1E293B',
  tabBarActive: '#38BDF8',
  tabBarInactive: '#94A3B8',
  inputBg: '#0F172A',
  inputBorder: '#475569',
  searchBg: '#1E293B',
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
