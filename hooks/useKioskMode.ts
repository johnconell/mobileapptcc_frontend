import { useEffect, useRef } from 'react';
import { ExamSecurityService } from '@/services/ExamSecurityService';

interface UseKioskModeOptions {
  enabled: boolean;
  /** Fired when the student presses Android Back (blocked). */
  onBackAttempt?: () => void;
  /** Fired when a screenshot is detected. */
  onScreenshot?: () => void;
}

/**
 * useKioskMode — locks the exam session into Secure Examination Mode.
 *
 * Expo-supported now:
 * - keep awake, portrait, screen capture block, back lock, screenshot listen
 *
 * Native Lock Task (Device Owner) later via ExamSecurityService bridge:
 * - Recent Apps, Status Bar, Nav Bar, Split Screen, PiP hard blocks
 */
export function useKioskMode(options: UseKioskModeOptions) {
  const { enabled, onBackAttempt, onScreenshot } = options;
  const backAttemptRef = useRef(onBackAttempt);
  const screenshotRef = useRef(onScreenshot);
  backAttemptRef.current = onBackAttempt;
  screenshotRef.current = onScreenshot;

  useEffect(() => {
    if (!enabled) {
      void ExamSecurityService.disableSecureExamMode();
      return;
    }

    let backLock: { remove: () => void } | null = null;
    let screenshotSub: { remove: () => void } | null = null;
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
    }

    void start();

    return () => {
      cancelled = true;
      backLock?.remove();
      screenshotSub?.remove();
      void ExamSecurityService.disableSecureExamMode();
    };
  }, [enabled]);
}
