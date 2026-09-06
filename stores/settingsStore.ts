import { create } from 'zustand';
import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AppFontSize = 'small' | 'standard' | 'large';

interface SettingsState {
  keepAwakeDuringExam: boolean;
  reducedMotion: boolean;
  allowUpdatesOnCellular: boolean;
  themeMode: ThemeMode;
  fontSize: AppFontSize;
  hydrated: boolean;
  setKeepAwakeDuringExam: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  setAllowUpdatesOnCellular: (value: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setFontSize: (size: AppFontSize) => void;
  hydrate: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keepAwakeDuringExam: true,
  reducedMotion: false,
  allowUpdatesOnCellular: false,
  themeMode: 'light',
  fontSize: 'standard',
  hydrated: false,

  setKeepAwakeDuringExam: (keepAwakeDuringExam) => {
    set({ keepAwakeDuringExam });
    void persistSettings(get());
  },

  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    void persistSettings(get());
  },

  setAllowUpdatesOnCellular: (allowUpdatesOnCellular) => {
    set({ allowUpdatesOnCellular });
    void persistSettings(get());
  },

  setThemeMode: (themeMode) => {
    set({ themeMode });
    void persistSettings(get());
  },

  setFontSize: (fontSize) => {
    set({ fontSize });
    void persistSettings(get());
  },

  hydrate: async () => {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.settings);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsState>;
        set({
          keepAwakeDuringExam: parsed.keepAwakeDuringExam ?? true,
          reducedMotion: parsed.reducedMotion ?? false,
          allowUpdatesOnCellular: parsed.allowUpdatesOnCellular ?? false,
          themeMode: parsed.themeMode ?? 'light',
          fontSize: parsed.fontSize ?? 'standard',
          hydrated: true,
        });
        return;
      }
    } catch {
      // ignore
    }
    set({ hydrated: true });
  },
}));

async function persistSettings(state: SettingsState) {
  await appStorage.setItem(
    STORAGE_KEYS.settings,
    JSON.stringify({
      keepAwakeDuringExam: state.keepAwakeDuringExam,
      reducedMotion: state.reducedMotion,
      allowUpdatesOnCellular: state.allowUpdatesOnCellular,
      themeMode: state.themeMode,
      fontSize: state.fontSize,
    }),
  );
}
