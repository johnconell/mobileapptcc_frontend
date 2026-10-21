import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  observeGuidedAccessChange,
  readGuidedAccessStatus,
  type GuidedAccessStatus,
} from '@/features/examinations/services/guidedAccess';

/** Native status is re-read after notifications, foregrounding, and periodically. */
export function useGuidedAccessStatus(): [GuidedAccessStatus, () => void] {
  const [status, setStatus] = useState<GuidedAccessStatus>(() => readGuidedAccessStatus());
  const refresh = useCallback(() => setStatus(readGuidedAccessStatus()), []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    refresh();
    const removeNativeListener = observeGuidedAccessChange((next) => {
      setStatus(next === 'enabled' ? readGuidedAccessStatus() : next);
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
      else setStatus('disabled');
    });
    const timer = setInterval(refresh, 1500);
    return () => {
      removeNativeListener();
      appState.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  return [status, refresh];
}
