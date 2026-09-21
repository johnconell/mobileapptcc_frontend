/**
 * Examination UI design tokens — dark / light (mobile exam screen).
 */
export const examUi = {
  accent: '#7C6CF6',
  accentSoftDark: '#2B254A',
  accentSoftLight: '#F3F0FF',
  timerWarn: { dark: '#F5A623', light: '#E8940B' },
  timerDanger: { dark: '#E74C3C', light: '#D64545' },
  violationLow: '#F5C518',
  violationHigh: '#E74C3C',
  dark: {
    page: '#131622',
    topBar: '#131622',
    card: '#1D2132',
    pill: '#272B3E',
    pillPressed: '#32374E',
    ink: '#FFFFFF',
    muted: '#94A3B8',
    border: '#2A3048',
    shadow: 'rgba(0,0,0,0.35)',
  },
  light: {
    page: '#F0F2F8',
    topBar: '#F0F2F8',
    card: '#FFFFFF',
    pill: '#ECEEF2',
    pillPressed: '#DFE2EB',
    ink: '#1E293B',
    muted: '#64748B',
    border: '#E5E7EB',
    shadow: 'rgba(15,23,42,0.06)',
  },
} as const;

export type ExamUiPalette = typeof examUi.dark | typeof examUi.light;

export function examUiPalette(darkMode: boolean): ExamUiPalette {
  return darkMode ? examUi.dark : examUi.light;
}
