import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus, NativeEventSubscription } from 'react-native';
import {
  startExamLock,
  stopExamLock,
  isExamLocked,
} from '@/features/examinations/services/ExamSecurityService';

interface UseExamLockOptions {
  /** Whether kiosk lock should be active. Pass false to skip locking. */
  enabled: boolean;
  /**
   * Optional callback if lock-related events need custom handling.
   */
  onViolation?: (type: 'kiosk_lock_failed' | 'app_exit_during_lock' | 'lock_task_state_lost') => void;
}

/**
 * useExamLock — Automatic Android Screen Pinning for exam sessions.
 *
 * Behaviour:
 * - Checks lock state immediately on mount.
 * - If not locked, calls startExamLock() and polls every 500ms for user confirmation.
 * - Polls every 1.5s while enabled to detect unpinning or late pin approval.
 * - On iOS: isKioskActive defaults to and remains true (AppState monitoring handles anti-cheat).
 * - On unmount: calls stopExamLock() to unpin cleanly.
 */
export function useExamLock({ enabled, onViolation }: UseExamLockOptions) {
  const [isKioskActive, setIsKioskActive] = useState(Platform.OS !== 'android');
  const [examLockError, setExamLockError] = useState<string | null>(null);
  const wasEverLockedRef = useRef(false);

  // Use a ref so callbacks inside intervals/timeouts are always fresh
  const onViolationRef = useRef(onViolation);
  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);

  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // ── AppState monitoring (works on both Android + iOS) ────────────────────
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    const prev = appStateRef.current;
    appStateRef.current = nextState;

    if (!enabledRef.current) return;

    if (
      (nextState === 'background' || nextState === 'inactive') &&
      (prev === 'active' || prev === 'inactive')
    ) {
      onViolationRef.current?.('app_exit_during_lock');
    }
  }, []);

  const requestLock = useCallback(async () => {
    if (Platform.OS !== 'android' || !enabledRef.current) return;
    try {
      await startExamLock();
      // Observe the system pinning prompt briefly; reconnect itself never waits on this poll.
      const start = Date.now();
      while (Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 400));
        const locked = await isExamLocked().catch(() => false);
        if (locked) {
          wasEverLockedRef.current = true;
          setIsKioskActive(true);
          setExamLockError(null);
          return;
        }
      }
      setIsKioskActive(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Screen pinning request failed';
      setExamLockError(msg);
    }
  }, []);

  // ── Main lock lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      if (Platform.OS === 'android') {
        setIsKioskActive(false);
      }
      return;
    }

    if (Platform.OS !== 'android') {
      setIsKioskActive(true);
      return;
    }

    let cancelled = false;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let appStateSub: NativeEventSubscription | null = null;

    async function activateLock() {
      // First check if already locked (e.g. pinned earlier in terms/lobby)
      const alreadyLocked = await isExamLocked().catch(() => false);
      if (cancelled) return;

      if (alreadyLocked) {
        wasEverLockedRef.current = true;
        setIsKioskActive(true);
        setExamLockError(null);
      } else {
        try {
          await startExamLock();
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : 'Unknown error';
          setExamLockError(msg);
        }

        // Poll every 500ms for initial prompt confirmation
        const start = Date.now();
        while (Date.now() - start < 5000) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) return;
          const locked = await isExamLocked().catch(() => false);
          if (locked) {
            wasEverLockedRef.current = true;
            setIsKioskActive(true);
            setExamLockError(null);
            break;
          }
        }
      }

      // Continuous monitoring: poll every 1,500ms to detect unpinning or late pin approval
      pollIntervalId = setInterval(async () => {
        if (cancelled || !enabledRef.current) return;
        const locked = await isExamLocked().catch(() => false);
        if (cancelled) return;

        if (locked) {
          wasEverLockedRef.current = true;
          setIsKioskActive(true);
        } else {
          // Device is currently not pinned
          setIsKioskActive(false);
          if (wasEverLockedRef.current) {
            wasEverLockedRef.current = false;
            onViolationRef.current?.('lock_task_state_lost');
            // Re-prompt pinning
            try {
              await startExamLock();
            } catch {
              /* ignore */
            }
          }
        }
      }, 1500);
    }

    appStateSub = AppState.addEventListener('change', handleAppStateChange);
    void activateLock();

    return () => {
      cancelled = true;
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      appStateSub?.remove();

      // Unpin cleanly — fire-and-forget, best effort
      void stopExamLock().catch(() => { /* ignore */ });
      setIsKioskActive(false);
      wasEverLockedRef.current = false;
    };
  }, [enabled, handleAppStateChange]);

  const releaseLock = useCallback(async () => {
    enabledRef.current = false;
    wasEverLockedRef.current = false;
    setIsKioskActive(false);
    setExamLockError(null);
    await stopExamLock().catch(() => undefined);
  }, []);

  return { isKioskActive, examLockError, requestLock, releaseLock };
}
