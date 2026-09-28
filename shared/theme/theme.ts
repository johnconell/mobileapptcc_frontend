export const lightTheme = {
  bg: '#E8EAF2', surface: '#F4F5F9', surfaceAlt: '#EDEEF4',
  border: '#C4C9DE', divider: '#D9DCEA',
  text: '#1B1D2B', textSecondary: '#474C63', textMuted: '#545970',
  accent: '#3B3F8F', accentSoft: '#E1E4F7', accentText: '#3B3F8F',
  optionLetterBg: '#D9DDF2', ring: '#3B3F8F', onAccent: '#FFFFFF',
  badgeBg: '#D8EEF3', badgeText: '#0B5D6E',
  notSure: { bg: '#F8EBC4', border: '#DDA51E', text: '#5C3D00', dot: '#C98A00', button: '#F8EBC4' },
  timer: {
    green:  { bg: '#E7F2E9', border: '#9FD4AF', text: '#1D6A3A', track: '#C7E3D0', fill: '#2E9D5A' },
    orange: { bg: '#FBEEDB', border: '#F0C88F', text: '#8D4903', track: '#F1DDBE', fill: '#E08A1E' },
    red:    { bg: '#F9E6E6', border: '#EDB1B1', text: '#B42318', track: '#F0CFCC', fill: '#D92D20' },
  },
};

export const darkTheme = {
  bg: '#0F1220', surface: '#171B2E', surfaceAlt: '#1E2338',
  border: '#2B3150', divider: '#242944',
  text: '#E8EAF6', textSecondary: '#B4BAD8', textMuted: '#98A0C0',
  accent: '#5F64E6', accentSoft: '#23284A', accentText: '#B9BDFF',
  optionLetterBg: '#23284A', ring: '#8B8FF2', onAccent: '#FFFFFF',
  badgeBg: '#12333B', badgeText: '#7FD8E8',
  notSure: { bg: '#3A2E0E', border: '#C99A1E', text: '#F5D27A', dot: '#F0B429', button: '#3A2E0E' },
  timer: {
    green:  { bg: '#12281C', border: '#235A38', text: '#5FD68A', track: '#1D4530', fill: '#3CC46F' },
    orange: { bg: '#2E2010', border: '#7A5217', text: '#F2A649', track: '#4A3418', fill: '#E8912B' },
    red:    { bg: '#2E1414', border: '#7A2A26', text: '#FF8A80', track: '#4A1F1D', fill: '#F04438' },
  },
};

export const getTimerColors = (theme: typeof lightTheme, percentLeft: number) =>
  percentLeft > 50 ? theme.timer.green : percentLeft > 15 ? theme.timer.orange : theme.timer.red;

export type ExamTheme = typeof lightTheme;
export type TimerTone = typeof lightTheme.timer.green;
