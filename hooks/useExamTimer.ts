import { useEffect } from 'react';
import { useExamStore } from '@/stores';

/** Decrements exam countdown once per second while the exam is active. */
export function useExamTimer(enabled: boolean) {
  const tick = useExamStore((s) => s.tick);
  const remainingSeconds = useExamStore((s) => s.remainingSeconds);

  useEffect(() => {
    if (!enabled || remainingSeconds <= 0) return;
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [enabled, remainingSeconds, tick]);

  return remainingSeconds;
}
