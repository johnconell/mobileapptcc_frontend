import { create } from 'zustand';
import { STORAGE_KEYS } from '@/constants';
import * as SecureStore from 'expo-secure-store';

interface SettingsState {
  keepAwakeDuringExam: boolean;
  reducedMotion: boolean;
  hydrated: boolean;
  setKeepAwakeDuringExam: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keepAwakeDuringExam: true,
  reducedMotion: false,
  hydrated: false,

  setKeepAwakeDuringExam: (keepAwakeDuringExam) => {
    set({ keepAwakeDuringExam });
    void persistSettings(get());
  },

  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    void persistSettings(get());
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEYS.settings);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsState>;
        set({
          keepAwakeDuringExam: parsed.keepAwakeDuringExam ?? true,
          reducedMotion: parsed.reducedMotion ?? false,
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
  try {
    await SecureStore.setItemAsync(
      STORAGE_KEYS.settings,
      JSON.stringify({
        keepAwakeDuringExam: state.keepAwakeDuringExam,
        reducedMotion: state.reducedMotion,
      }),
    );
  } catch {
    // ignore
  }
}
