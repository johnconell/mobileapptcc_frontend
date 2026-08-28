import { create } from 'zustand';
import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';

interface SettingsState {
  keepAwakeDuringExam: boolean;
  reducedMotion: boolean;
  allowUpdatesOnCellular: boolean;
  hydrated: boolean;
  setKeepAwakeDuringExam: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  setAllowUpdatesOnCellular: (value: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keepAwakeDuringExam: true,
  reducedMotion: false,
  allowUpdatesOnCellular: false,
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

  hydrate: async () => {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.settings);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsState>;
        set({
          keepAwakeDuringExam: parsed.keepAwakeDuringExam ?? true,
          reducedMotion: parsed.reducedMotion ?? false,
          allowUpdatesOnCellular: parsed.allowUpdatesOnCellular ?? false,
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
    }),
  );
}
