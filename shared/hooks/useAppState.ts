import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export type AppLifecycleEvent =
  | 'active'
  | 'inactive'
  | 'background'
  | 'blur'
  | 'lock_suspected';

/**
 * Tracks React Native AppState transitions for exam security.
 */
export function useAppState(options?: {
  enabled?: boolean;
  onChange?: (event: AppLifecycleEvent, next: AppStateStatus, prev: AppStateStatus) => void;
}) {
  const enabled = options?.enabled ?? true;
  const onChange = options?.onChange;
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const prevRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener('change', (next) => {
      const prev = prevRef.current;
      prevRef.current = next;
      setAppState(next);

      if (!onChange || prev === next) return;

      if (next === 'background') {
        // Background often means home button, app switch, or screen lock.
        onChange('background', next, prev);
        onChange('lock_suspected', next, prev);
        return;
      }

      if (next === 'inactive') {
        onChange('inactive', next, prev);
        onChange('blur', next, prev);
        return;
      }

      if (next === 'active') {
        onChange('active', next, prev);
      }
    });

    return () => subscription.remove();
  }, [enabled, onChange]);

  return { appState, isActive: appState === 'active' };
}
