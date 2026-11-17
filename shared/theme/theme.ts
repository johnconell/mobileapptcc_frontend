export const lightTheme = {
  // Surface levels 0..3 (Rule 1 & 2)
  surface0: '#FAF7F2',
  surface1: '#FFFDF8',
  surface2: '#F5EFE6',
  surface3: '#FFFFFF',

  // Exam screen specific palette (kept 100% exact for light mode)
  bg: '#E8EAF2',
  surface: '#F4F5F9',
  surfaceAlt: '#EDEEF4',
  border: '#C4C9DE',
  borderEmphasized: '#D7D0C5',
  divider: '#D9DCEA',

  // Text hierarchy (Rule 3)
  text: '#1B1D2B',
  textPrimary: '#2C241C',
  textSecondary: '#474C63',
  textMuted: '#545970',
  textDisabled: '#9A8E82',

  // Brand accents & buttons (Rule 4)
  accent: '#3B3F8F',
  accentMaroon: '#7A1F2B',
  accentGold: '#D8901F',
  accentSoft: '#E1E4F7',
  accentText: '#3B3F8F',
  optionLetterBg: '#D9DDF2',
  ring: '#3B3F8F',
  onAccent: '#FFFFFF',
  badgeBg: '#D8EEF3',
  badgeText: '#0B5D6E',

  // Semantic states
  success: '#1B6B3A',
  warning: '#B45309',
  danger: '#9B1C1C',
  info: '#3B6EA5',
  overlay: 'rgba(44, 36, 28, 0.45)',

  // Inputs
  inputBg: '#FFFDF8',
  inputBorder: '#DDD2C4',

  // Exam interactive tokens
  notSure: { bg: '#F8EBC4', border: '#DDA51E', text: '#5C3D00', dot: '#C98A00', button: '#F8EBC4' },
  timer: {
    green:  { bg: '#E7F2E9', border: '#9FD4AF', text: '#1D6A3A', track: '#C7E3D0', fill: '#2E9D5A' },
    orange: { bg: '#FBEEDB', border: '#F0C88F', text: '#8D4903', track: '#F1DDBE', fill: '#E08A1E' },
    red:    { bg: '#F9E6E6', border: '#EDB1B1', text: '#B42318', track: '#F0CFCC', fill: '#D92D20' },
  },
};

export const darkTheme = {
  // Surface levels 0..3 (Rule 1 & 2: never pure black #000, page is near-black #0B0D10)
  surface0: '#0B0D10',    // level 0 page
  surface1: '#13161B',    // level 1 card
  surface2: '#1A1E25',    // level 2 menu / dropdown / popover
  surface3: '#222730',    // level 3 modal / drawer / bottom sheet

  // Surfaces for exam & screens
  bg: '#0B0D10',
  surface: '#13161B',
  surfaceAlt: '#1A1E25',

  // Hairlines (Rule 5: white alpha, no fixed gray)
  border: 'rgba(255, 255, 255, 0.08)',
  borderEmphasized: 'rgba(255, 255, 255, 0.15)',
  divider: 'rgba(255, 255, 255, 0.08)',

  // Typography (Rule 3: one white at three alphas)
  text: 'rgba(255, 255, 255, 0.87)',
  textPrimary: 'rgba(255, 255, 255, 0.87)',
  textSecondary: 'rgba(255, 255, 255, 0.60)',
  textMuted: 'rgba(255, 255, 255, 0.60)',
  textDisabled: 'rgba(255, 255, 255, 0.38)',

  // Brand accents & buttons (Rule 4: calmed hues, lightness 65-72%, saturation ~45%)
  accent: '#D28994',
  accentMaroon: '#D28994',
  accentGold: '#D2B889',
  accentSoft: 'rgba(210, 137, 148, 0.15)',
  accentText: '#D28994',
  optionLetterBg: '#1A1E25',
  ring: '#D28994',
  onAccent: '#13161B', // contrast ratio 6.84:1 >= 4.5:1 with #D28994
  badgeBg: 'rgba(138, 184, 230, 0.15)',
  badgeText: '#8AB8E6',

  // Semantic states softened similarly
  success: '#7FD8A4',
  warning: '#E2BA70',
  danger: '#E57B85',
  info: '#8AB8E6',
  overlay: 'rgba(0, 0, 0, 0.70)',

  // Inputs
  inputBg: '#1A1E25',
  inputBorder: 'rgba(255, 255, 255, 0.08)',

  // Exam interactive tokens softened for dark mode
  notSure: {
    bg: 'rgba(226, 186, 112, 0.15)',
    border: '#E2BA70',
    text: '#E2BA70',
    dot: '#E2BA70',
    button: 'rgba(226, 186, 112, 0.15)',
  },
  timer: {
    green:  { bg: '#12241A', border: 'rgba(127, 216, 164, 0.3)', text: '#7FD8A4', track: '#183824', fill: '#7FD8A4' },
    orange: { bg: '#2B2011', border: 'rgba(226, 186, 112, 0.3)', text: '#E2BA70', track: '#403018', fill: '#E2BA70' },
    red:    { bg: '#2C1417', border: 'rgba(229, 123, 133, 0.3)', text: '#E57B85', track: '#461D22', fill: '#E57B85' },
  },
};

export const getTimerColors = (theme: typeof lightTheme, percentLeft: number) =>
  percentLeft > 50 ? theme.timer.green : percentLeft > 15 ? theme.timer.orange : theme.timer.red;

export type ExamTheme = typeof lightTheme;
export type TimerTone = typeof lightTheme.timer.green;
