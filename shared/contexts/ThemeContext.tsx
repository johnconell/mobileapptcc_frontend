import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, type ExamTheme } from '@/shared/theme/theme';
import { appStorage } from '@/shared/services/storage';
import { useSettingsStore, type ThemeMode } from '@/features/settings/stores/settingsStore';

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.35;
export const FONT_SCALE_STEP = 0.1;
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export interface ThemeTokenContextValue {
  theme: ExamTheme;
  isDark: boolean;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
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
  initialMode?: ThemeMode;
  initialFontScale?: number;
}

export function ThemeProvider({
  children,
  initialMode = DEFAULT_THEME_MODE,
  initialFontScale = 1.0,
}: ThemeProviderProps) {
  // If a parent ThemeContext already exists (e.g. root ThemeProvider), reuse it
  const parentTheme = useContext(ThemeContext);
  const parentFontScale = useContext(FontScaleContext);
  const parentFontScaleActions = useContext(FontScaleActionsContext);

  if (parentTheme && parentFontScale !== null && parentFontScaleActions) {
    return <>{children}</>;
  }

  return (
    <RootThemeProvider initialMode={initialMode} initialFontScale={initialFontScale}>
      {children}
    </RootThemeProvider>
  );
}

function RootThemeProvider({
  children,
  initialMode = DEFAULT_THEME_MODE,
  initialFontScale = 1.0,
}: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(initialMode);
  const [fontScale, setFontScaleState] = useState<number>(initialFontScale);

  // Restore persisted preferences on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedMode = await appStorage.getItem('tcc.settings.theme_mode');
        if (active && storedMode !== null && (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system')) {
          setThemeModeState(storedMode as ThemeMode);
          useSettingsStore.getState().setThemeMode(storedMode as ThemeMode);
        } else if (active) {
          // Legacy dark-mode storage no longer overrides the light default.
          setThemeModeState(DEFAULT_THEME_MODE);
          useSettingsStore.getState().setThemeMode(DEFAULT_THEME_MODE);
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

  // Compute resolved isDark
  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemColorScheme === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, systemColorScheme]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    void appStorage.setItem('tcc.settings.theme_mode', mode);
    const resolvedDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';
    void appStorage.setItem('tcc.settings.exam.dark_mode', String(resolvedDark));
    useSettingsStore.getState().setThemeMode(mode);
  }, [systemColorScheme]);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      void appStorage.setItem('tcc.settings.theme_mode', next);
      void appStorage.setItem('tcc.settings.exam.dark_mode', String(next === 'dark'));
      useSettingsStore.getState().setThemeMode(next);
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
      themeMode,
      toggleTheme,
      setTheme: setThemeMode,
      setThemeMode,
    }),
    [theme, isDark, themeMode, toggleTheme, setThemeMode],
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
      themeMode: 'light',
      toggleTheme: () => {},
      setTheme: () => {},
      setThemeMode: () => {},
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
