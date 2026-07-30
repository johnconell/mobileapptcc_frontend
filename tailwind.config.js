/** @type {import('tailwindcss').Config} */
module.exports = {
  // Required for NativeWind web — avoids "dark mode is type 'media'" crash.
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './providers/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7A1F2B',
          50: '#F9F0F1',
          100: '#F0D9DC',
          200: '#E0B3B9',
          300: '#C97A86',
          400: '#A84555',
          500: '#7A1F2B',
          600: '#6A1B25',
          700: '#55161E',
          800: '#401117',
          900: '#2B0C0F',
        },
        secondary: {
          DEFAULT: '#D4AF37',
          50: '#FBF8EC',
          100: '#F5EDD0',
          200: '#EBDBA1',
          300: '#E0C972',
          400: '#D4AF37',
          500: '#B8942A',
          600: '#9A7A22',
          700: '#7C611B',
          800: '#5E4914',
          900: '#40310E',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F3F0EB',
          soft: '#FAF8F5',
        },
        ink: {
          DEFAULT: '#1C1917',
          secondary: '#57534E',
          muted: '#78716C',
          inverse: '#FAFAF9',
        },
        success: '#15803D',
        warning: '#B45309',
        danger: '#B91C1C',
        info: '#1D4ED8',
      },
      borderRadius: {
        card: '20px',
        button: '14px',
      },
      fontFamily: {
        sans: ['System'],
      },
      boxShadow: {
        soft: '0px 4px 16px rgba(28, 25, 23, 0.08)',
        card: '0px 8px 24px rgba(28, 25, 23, 0.06)',
      },
    },
  },
  plugins: [],
};
