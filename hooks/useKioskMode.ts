import { useEffect, useRef } from 'react';
import { ExamSecurityService } from '@/services/ExamSecurityService';

interface UseKioskModeOptions {
  enabled: boolean;
  /** Fired when the student presses Android Back (blocked). */
  onBackAttempt?: () => void;
  /** Fired when a screenshot is detected. */
  onScreenshot?: () => void;
  /** Fired when the window shrinks into split-screen / freeform. */
  onMultiWindow?: () => void;
}

/**
 * useKioskMode — locks the exam session into Secure Examination Mode.
 *
 * Build (plugins/withExamSecurity.js) + runtime:
 * - keep awake, portrait, FLAG_SECURE (screenshot + screen recording), back lock
 * - soft multi-window detection via Dimensions
 * - Android split-screen hard-blocked by resizeableActivity=false
 *
 * Device Owner Lock Task (Recent Apps / status bar) is still a future bridge.
 */
export function useKioskMode(options: UseKioskModeOptions) {
  const { enabled, onBackAttempt, onScreenshot, onMultiWindow } = options;
  const backAttemptRef = useRef(onBackAttempt);
  const screenshotRef = useRef(onScreenshot);
  const multiWindowRef = useRef(onMultiWindow);
  backAttemptRef.current = onBackAttempt;
  screenshotRef.current = onScreenshot;
  multiWindowRef.current = onMultiWindow;

  useEffect(() => {
    if (!enabled) {
      void ExamSecurityService.disableSecureExamMode();
      return;
    }

    let backLock: { remove: () => void } | null = null;
    let screenshotSub: { remove: () => void } | null = null;
    let multiWindowSub: { remove: () => void } | null = null;
    let cancelled = false;

    async function start() {
      await ExamSecurityService.enableSecureExamMode();
      if (cancelled) return;

      backLock = ExamSecurityService.lockBackButton(() => {
        backAttemptRef.current?.();
      });

      screenshotSub = ExamSecurityService.addScreenshotListener(() => {
        screenshotRef.current?.();
      });

      multiWindowSub = ExamSecurityService.addMultiWindowListener(() => {
        multiWindowRef.current?.();
      });
    }

    void start();

    return () => {
      cancelled = true;
      backLock?.remove();
      screenshotSub?.remove();
      multiWindowSub?.remove();
      void ExamSecurityService.disableSecureExamMode();
    };
  }, [enabled]);
}
