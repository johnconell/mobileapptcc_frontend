import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { lightTheme, darkTheme, type ExamTheme } from '@/shared/theme/theme';
import { appStorage } from '@/shared/services/storage';

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.35;
export const FONT_SCALE_STEP = 0.1;

export interface ThemeContextValue {
  theme: ExamTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: 'light' | 'dark') => void;
  fontScale: number;
  setFontScale: (scale: number | ((prev: number) => number)) => void;
  stepFontScale: (delta: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialDark?: boolean;
  initialFontScale?: number;
}

export function ThemeProvider({
  children,
  initialDark = false,
  initialFontScale = 1.0,
}: ThemeProviderProps) {
  // Light is the default theme
  const [isDark, setIsDark] = useState<boolean>(initialDark);
  const [fontScale, setFontScaleState] = useState<number>(initialFontScale);

  // Restore persisted preferences on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedTheme = await appStorage.getItem('tcc.settings.exam.dark_mode');
        if (active && storedTheme !== null) {
          setIsDark(storedTheme === 'true');
        }
        const storedScale = await appStorage.getItem('tcc.settings.exam.font_scale');
        if (active && storedScale !== null) {
          const parsed = parseFloat(storedScale);
          if (!isNaN(parsed) && parsed >= FONT_SCALE_MIN && parsed <= FONT_SCALE_MAX) {
            setFontScaleState(parsed);
          }
        }
      } catch {
        /* fallback to defaults */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((mode: 'light' | 'dark') => {
    const nextDark = mode === 'dark';
    setIsDark(nextDark);
    void appStorage.setItem('tcc.settings.exam.dark_mode', String(nextDark));
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      void appStorage.setItem('tcc.settings.exam.dark_mode', String(next));
      return next;
    });
  }, []);

  const setFontScale = useCallback((scaleOrFn: number | ((prev: number) => number)) => {
    setFontScaleState((prev) => {
      const nextVal = typeof scaleOrFn === 'function' ? scaleOrFn(prev) : scaleOrFn;
      const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number(nextVal.toFixed(2))));
      void appStorage.setItem('tcc.settings.exam.font_scale', String(clamped));
      return clamped;
    });
  }, []);

  const stepFontScale = useCallback((delta: number) => {
    setFontScaleState((prev) => {
      const target = Number((prev + delta).toFixed(2));
      const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, target));
      void appStorage.setItem('tcc.settings.exam.font_scale', String(clamped));
      return clamped;
    });
  }, []);

  const theme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  const value = useMemo(
    () => ({
      theme,
      isDark,
      toggleTheme,
      setTheme,
      fontScale,
      setFontScale,
      stepFontScale,
    }),
    [theme, isDark, toggleTheme, setTheme, fontScale, setFontScale, stepFontScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Graceful fallback to default lightTheme outside provider
    return {
      theme: lightTheme,
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
      fontScale: 1.0,
      setFontScale: () => {},
      stepFontScale: () => {},
    };
  }
  return ctx;
}
