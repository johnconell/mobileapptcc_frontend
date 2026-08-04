import { useEffect } from 'react';
import { useExamStore } from '@/stores';

/**
 * Decrements exam countdown once per second while active.
 * Important: do NOT list remainingSeconds in effect deps — that recreates the
 * interval every tick and can crash RN Web Text (removeChild) under LogBox load.
 */
export function useExamTimer(enabled: boolean) {
  const remainingSeconds = useExamStore((s) => s.remainingSeconds);
  const isPaused = useExamStore((s) => s.isPaused);

  useEffect(() => {
    if (!enabled || isPaused) return;

    const id = setInterval(() => {
      const state = useExamStore.getState();
      if (state.isPaused || state.remainingSeconds <= 0) return;
      state.tick();
    }, 1000);

    return () => clearInterval(id);
  }, [enabled, isPaused]);

  return remainingSeconds;
}
