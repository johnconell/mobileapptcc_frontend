import { useEffect } from 'react';
import { useExamStore } from '@/stores';

/** Decrements exam countdown once per second while the exam is active and not paused. */
export function useExamTimer(enabled: boolean) {
  const tick = useExamStore((s) => s.tick);
  const remainingSeconds = useExamStore((s) => s.remainingSeconds);
  const isPaused = useExamStore((s) => s.isPaused);

  useEffect(() => {
    if (!enabled || remainingSeconds <= 0 || isPaused) return;
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [enabled, remainingSeconds, isPaused, tick]);

  return remainingSeconds;
}
