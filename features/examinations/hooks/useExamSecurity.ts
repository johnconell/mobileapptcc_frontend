import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
import { useAppState } from '@/shared/hooks/useAppState';
import { useKioskMode } from '@/features/examinations/hooks/useKioskMode';
import { useViolationMonitor } from '@/features/monitoring/hooks/useViolationMonitor';
import { resolveTabSwitchGraceSeconds } from '@/shared/utils/gracePeriod';
import { DEFAULT_TAB_SWITCH_GRACE_SECONDS } from '@/shared/constants';
import type { ExamSecurityCapabilities, SecurityViolationType } from '@/shared/types';

interface UseExamSecurityOptions {
  enabled: boolean;
  sessionId: string | null;
  studentId: string | null;
  studentName: string | null;
  onMaxViolations?: () => void;
  /** Optional: open submit confirmation from the security overlay */
  onRequestSubmit?: () => void;
}

const LEAVE_MESSAGE = 'Leaving the examination is prohibited.';

/**
 * Orchestrates Secure Examination / Kiosk Mode + violation monitoring.
 * Screens must only use this hook — never call Expo security APIs directly.
 */
export function useExamSecurity(options: UseExamSecurityOptions) {
  const {
    enabled,
    sessionId,
    studentId,
    studentName,
    onMaxViolations,
    onRequestSubmit,
  } = options;

  const [paused, setPaused] = useState(false);
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningMessage, setWarningMessage] = useState(LEAVE_MESSAGE);
  const [capabilities, setCapabilities] = useState<ExamSecurityCapabilities | null>(null);
  const armedRef = useRef(false);
  const suppressUntilRef = useRef(0);
  const pausedRef = useRef(false);

  const tabSwitchGraceSecondsRef = useRef<number>(DEFAULT_TAB_SWITCH_GRACE_SECONDS);
  const pendingGraceTypeRef = useRef<SecurityViolationType | null>(null);
  const leaveTimestampRef = useRef<number>(0);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const {
    violationCount,
    maxViolations,
    latestViolation,
    recordViolation,
    setViolationCount,
  } = useViolationMonitor({
    sessionId,
    studentId,
    studentName,
    enabled,
    onTerminated: () => {
      setPaused(true);
      setWarningVisible(false);
      onMaxViolations?.();
    },
    onViolation: ({ violation }) => {
      setPaused(true);
      setWarningVisible(true);
      setWarningMessage(
        violation.type === 'app_background' ||
          violation.type === 'app_inactive' ||
          violation.type === 'leave_attempt'
          ? LEAVE_MESSAGE
          : violation.message || LEAVE_MESSAGE,
      );
    },
  });

  const handleSecurityEvent = useCallback(
    async (type: SecurityViolationType) => {
      if (!enabled || !armedRef.current) return;
      if (Date.now() < suppressUntilRef.current) return;
      // While warning is showing, ignore duplicate leave events (except screenshots).
      if (pausedRef.current && type !== 'screenshot') return;

      // Screenshots are immediate violations without grace period
      if (type === 'screenshot') {
        await recordViolation(type);
        return;
      }

      const graceSeconds = tabSwitchGraceSecondsRef.current;
      if (graceSeconds <= 0) {
        // Immediate violation if grace period is set to 0
        await recordViolation(type);
        return;
      }

      // Begin grace period tracking if not already pending
      if (!pendingGraceTypeRef.current) {
        pendingGraceTypeRef.current = type;
        leaveTimestampRef.current = Date.now();

        if (graceTimeoutRef.current) {
          clearTimeout(graceTimeoutRef.current);
        }

        graceTimeoutRef.current = setTimeout(async () => {
          if (pendingGraceTypeRef.current) {
            const pendingType = pendingGraceTypeRef.current;
            pendingGraceTypeRef.current = null;
            leaveTimestampRef.current = 0;
            await recordViolation(pendingType);
          }
        }, graceSeconds * 1000);
      }
    },
    [enabled, recordViolation],
  );

  const handleReturnToExam = useCallback(async () => {
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }

    const pendingType = pendingGraceTypeRef.current;
    const leftAt = leaveTimestampRef.current;
    pendingGraceTypeRef.current = null;
    leaveTimestampRef.current = 0;

    if (pendingType && leftAt > 0) {
      const elapsedSeconds = (Date.now() - leftAt) / 1000;
      const graceSeconds = tabSwitchGraceSecondsRef.current;
      if (elapsedSeconds >= graceSeconds) {
        // Grace period expired while away
        await recordViolation(pendingType);
      } else {
        // Returned within grace period: warn without incrementing violation strikes
        setPaused(true);
        setWarningVisible(true);
        setWarningMessage(
          `Warning: You navigated away from the examination. Please remain on this screen. Leaving or switching tabs for more than ${graceSeconds}s will record an automatic violation strike.`
        );
      }
    } else if (pausedRef.current) {
      setWarningVisible(true);
    }
  }, [recordViolation]);

  useKioskMode({
    enabled,
    onBackAttempt: () => {
      void handleSecurityEvent('leave_attempt');
    },
    onScreenshot: () => {
      void handleSecurityEvent('screenshot');
    },
    onMultiWindow: () => {
      // Split-screen / freeform — counted as leaving the examination.
      void handleSecurityEvent('app_inactive');
    },
  });

  useAppState({
    enabled,
    onChange: (event) => {
      if (!armedRef.current) return;
      if (event === 'background') {
        void handleSecurityEvent('app_background');
        return;
      }
      if (event === 'inactive') {
        void handleSecurityEvent('app_inactive');
        return;
      }
      if (event === 'active') {
        void handleReturnToExam();
      }
    },
  });

  useEffect(() => {
    if (!enabled) {
      armedRef.current = false;
      void ExamSecurityService.getCapabilities().then(setCapabilities);
      return;
    }

    let cancelled = false;

    async function arm() {
      const [caps, grace] = await Promise.all([
        ExamSecurityService.getCapabilities(),
        resolveTabSwitchGraceSeconds().catch(() => DEFAULT_TAB_SWITCH_GRACE_SECONDS),
      ]);
      if (cancelled) return;
      setCapabilities(caps);
      tabSwitchGraceSecondsRef.current = grace;
      suppressUntilRef.current = Date.now() + 1500;
      armedRef.current = true;
    }

    void arm();

    // On Web: detect tab blur, window blur, contextmenu (right-click), and copy-paste
    let cleanupWeb: (() => void) | undefined;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleBlur = () => {
        void handleSecurityEvent('app_inactive');
      };
      const handleFocus = () => {
        void handleReturnToExam();
      };
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        void handleSecurityEvent('app_inactive');
      };
      const handleCopy = (e: ClipboardEvent) => {
        e.preventDefault();
        void handleSecurityEvent('app_inactive');
      };
      window.addEventListener('blur', handleBlur);
      window.addEventListener('focus', handleFocus);
      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('copy', handleCopy);
      cleanupWeb = () => {
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('copy', handleCopy);
      };
    }

    // Native window focus loss & gain (floating screens, chatheads, overlays)
    const focusLostSub = DeviceEventEmitter.addListener('onWindowFocusLost', () => {
      void handleSecurityEvent('app_blur');
    });
    const focusGainedSub = DeviceEventEmitter.addListener('onWindowFocusGained', () => {
      void handleReturnToExam();
    });

    return () => {
      cancelled = true;
      armedRef.current = false;
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      focusLostSub.remove();
      focusGainedSub.remove();
      cleanupWeb?.();
    };
  }, [enabled, handleReturnToExam, handleSecurityEvent]);

  const acknowledgeWarning = useCallback(() => {
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    pendingGraceTypeRef.current = null;
    leaveTimestampRef.current = 0;
    setWarningVisible(false);
    setPaused(false);
    suppressUntilRef.current = Date.now() + 1000;
  }, []);

  const requestSubmitFromWarning = useCallback(() => {
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    pendingGraceTypeRef.current = null;
    leaveTimestampRef.current = 0;
    setWarningVisible(false);
    setPaused(false);
    onRequestSubmit?.();
  }, [onRequestSubmit]);

  return {
    paused,
    warningVisible,
    warningMessage,
    capabilities,
    violationCount,
    maxViolations,
    latestViolation,
    acknowledgeWarning,
    requestSubmitFromWarning,
    recordViolation,
    setViolationCount,
  };
}
