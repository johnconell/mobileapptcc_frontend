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
   * Called whenever a lock-related security event is detected.
   * Maps to the existing recordViolation(type) from useViolationMonitor.
   */
  onViolation: (type: 'kiosk_lock_failed' | 'app_exit_during_lock' | 'lock_task_state_lost') => void;
}

/**
 * useExamLock — Automatic Android Screen Pinning for exam sessions.
 *
 * Behaviour:
 * - On mount (when enabled = true): calls startExamLock(), then after 1 s
 *   verifies the pin via isExamLocked(). If still unlocked → onViolation('kiosk_lock_failed').
 * - Every 15 s: polls isExamLocked(). If the pin was released (student used
 *   Settings → Unpin) → onViolation('lock_task_state_lost') + re-pin attempt.
 * - AppState background/inactive → onViolation('app_exit_during_lock').
 * - On unmount: calls stopExamLock() to unpin cleanly.
 * - iOS: only AppState monitoring fires; all lock-task calls are no-ops.
 *
 * First-time BYOD note:
 * On a device that has never used Screen Pinning, Android shows a one-time
 * system dialog "Use Screen Pinning?" before pinning. This is expected and
 * only happens once per OS session (or until the device is rebooted and Screen
 * Pinning is toggled off/on in Settings → Security). On subsequent exams within
 * the same OS session, startLockTask() pins silently.
 */
export function useExamLock({ enabled, onViolation }: UseExamLockOptions) {
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [examLockError, setExamLockError] = useState<string | null>(null);

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

    // Going to background or inactive while exam is locked = violation
    if (
      (nextState === 'background' || nextState === 'inactive') &&
      (prev === 'active' || prev === 'inactive')
    ) {
      onViolationRef.current('app_exit_during_lock');
    }
  }, []);

  // ── Main lock lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let verifyTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let appStateSub: NativeEventSubscription | null = null;

    async function activateLock() {
      try {
        await startExamLock();
        if (cancelled) return;
        setIsKioskActive(true);
        setExamLockError(null);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setExamLockError(msg);
        onViolationRef.current('kiosk_lock_failed');
        return;
      }

      // Verify 1 s after calling startLockTask — Android may silently refuse on emulators
      verifyTimeoutId = setTimeout(async () => {
        if (cancelled) return;
        const locked = await isExamLocked().catch(() => false);
        if (cancelled) return;
        if (!locked && Platform.OS === 'android') {
          setExamLockError('Screen pinning was not confirmed by the system.');
          onViolationRef.current('kiosk_lock_failed');
          // Try once more — student may have just dismissed the system dialog
          try {
            await startExamLock();
          } catch {
            /* ignore second-attempt failures */
          }
        }
      }, 1000);

      // Poll every 15 s for unexpected unpin (e.g. student navigated to Settings)
      pollIntervalId = setInterval(async () => {
        if (cancelled || !enabledRef.current) return;
        const locked = await isExamLocked().catch(() => true); // default to true on error (safe)
        if (cancelled) return;
        if (!locked) {
          setIsKioskActive(false);
          onViolationRef.current('lock_task_state_lost');
          // Attempt to re-pin immediately
          try {
            await startExamLock();
            if (!cancelled) setIsKioskActive(true);
          } catch {
            /* re-pin failed; violation already recorded */
          }
        }
      }, 15_000);
    }

    // Subscribe to AppState before starting lock so we don't miss any transition
    appStateSub = AppState.addEventListener('change', handleAppStateChange);

    void activateLock();

    return () => {
      cancelled = true;
      if (verifyTimeoutId !== null) clearTimeout(verifyTimeoutId);
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      appStateSub?.remove();

      // Unpin cleanly — fire-and-forget, best effort
      void stopExamLock().catch(() => { /* ignore errors during cleanup */ });
      setIsKioskActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]); // handleAppStateChange is stable (useCallback with no deps)

  return { isKioskActive, examLockError };
}

