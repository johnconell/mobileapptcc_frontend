import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { lightTheme, darkTheme, type ExamTheme } from '@/shared/theme/theme';
import { appStorage } from '@/shared/services/storage';

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.35;
export const FONT_SCALE_STEP = 0.1;

export interface ThemeTokenContextValue {
  theme: ExamTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: 'light' | 'dark') => void;
}

export interface FontScaleActions {
  setFontScale: (scale: number | ((prev: number) => number)) => void;
  stepFontScale: (delta: number) => void;
}

export interface ThemeContextValue extends ThemeTokenContextValue, FontScaleActions {
  fontScale: number;
}

const ThemeContext = createContext<ThemeTokenContextValue | null>(null);
const FontScaleContext = createContext<number | null>(null);
const FontScaleActionsContext = createContext<FontScaleActions | null>(null);

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

  const themeValue = useMemo(
    () => ({
      theme,
      isDark,
      toggleTheme,
      setTheme,
    }),
    [theme, isDark, toggleTheme, setTheme],
  );
  const fontScaleActions = useMemo(
    () => ({ setFontScale, stepFontScale }),
    [setFontScale, stepFontScale],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <FontScaleContext.Provider value={fontScale}>
        <FontScaleActionsContext.Provider value={fontScaleActions}>
          {children}
        </FontScaleActionsContext.Provider>
      </FontScaleContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useThemeTokens(): ThemeTokenContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: lightTheme,
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}

export function useFontScale(): number {
  return useContext(FontScaleContext) ?? 1.0;
}

export function useFontScaleActions(): FontScaleActions {
  return useContext(FontScaleActionsContext) ?? {
    setFontScale: () => {},
    stepFontScale: () => {},
  };
}

/** Combined hook kept for components that need both theme tokens and scaling. */
export function useTheme(): ThemeContextValue {
  const theme = useThemeTokens();
  const fontScale = useFontScale();
  const actions = useFontScaleActions();
  return { ...theme, fontScale, ...actions };
}
