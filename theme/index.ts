export const colors = {
  primary: '#7A1F2B',
  primaryDark: '#55161E',
  secondary: '#D4AF37',
  background: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F0EB',
  ink: '#1C1917',
  inkSecondary: '#57534E',
  inkMuted: '#78716C',
  border: '#E7E5E4',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#1D4ED8',
  white: '#FFFFFF',
  overlay: 'rgba(28, 25, 23, 0.45)',
} as const;

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
  sm: 8,
  md: 12,
  lg: 16,
  card: 20,
  button: 14,
  full: 999,
} as const;

export const shadows = {
  soft: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  card: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
} as const;

export const typography = {
  hero: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  subtitle: { fontSize: 17, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
};
