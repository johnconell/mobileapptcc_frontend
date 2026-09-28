export const lightTheme = {
  bg: '#F5F6FB', surface: '#FFFFFF', surfaceAlt: '#FFFFFF',
  border: '#D9DCEC', divider: '#E3E5F1',
  text: '#1B1D2B', textSecondary: '#5B6078', textMuted: '#7A7F96',
  accent: '#3B3F8F', accentSoft: '#F1F2FD', accentText: '#3B3F8F',
  optionLetterBg: '#EEF0FB', ring: '#3B3F8F', onAccent: '#FFFFFF',
  badgeBg: '#E1F4F8', badgeText: '#0B5D6E',
  notSure: { bg: '#FBE7B8', border: '#E0A91F', text: '#5C3D00', dot: '#C98A00', button: '#FDF1D3' },
  timer: {
    green:  { bg: '#EEF8F1', border: '#B9E0C4', text: '#237A45', track: '#CFE9D8', fill: '#2E9D5A' },
    orange: { bg: '#FFF4E5', border: '#F5D0A0', text: '#B45F06', track: '#F8E1BF', fill: '#E08A1E' },
    red:    { bg: '#FDECEC', border: '#F3B8B8', text: '#B42318', track: '#F6CFCB', fill: '#D92D20' },
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
