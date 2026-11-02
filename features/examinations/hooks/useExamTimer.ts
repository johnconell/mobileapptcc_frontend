import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useExamStore } from '@/features/examinations/stores/examStore';

/**
 * Decrements and synchronizes exam countdown against authoritative deadline while active.
 * - Recalculates immediately when returning from background or waking from sleep.
 * - Enforces tick on mount so no extra time is granted after app close.
 * - Halts when paused, expired, or when time reconciliation is required.
 */
export function useExamTimer(enabled: boolean) {
  const remainingSeconds = useExamStore((s) => s.remainingSeconds);
  const isPaused = useExamStore((s) => s.isPaused);
  const timerStatus = useExamStore((s) => s.timerStatus);

  useEffect(() => {
    if (!enabled || isPaused || timerStatus === 'expired' || timerStatus === 'reconciliation_required') {
      return;
    }

    // Immediately recalculate on mount/enable so background time is immediately deducted
    useExamStore.getState().tick();

    const id = setInterval(() => {
      const state = useExamStore.getState();
      if (
        state.isPaused ||
        state.remainingSeconds <= 0 ||
        state.timerStatus === 'expired' ||
        state.timerStatus === 'reconciliation_required'
      ) {
        return;
      }
      state.tick();
    }, 1000);

    // Listen to foregrounding from background to immediately adjust for backgrounding
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        useExamStore.getState().tick();
      }
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [enabled, isPaused, timerStatus]);

  return remainingSeconds;
}
