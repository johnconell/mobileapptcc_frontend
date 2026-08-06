import { useCallback, useEffect, useRef, useState } from 'react';
import { ExamSecurityService } from '@/services/ExamSecurityService';
import { useAppState } from '@/hooks/useAppState';
import { useKioskMode } from '@/hooks/useKioskMode';
import { useViolationMonitor } from '@/hooks/useViolationMonitor';
import type { ExamSecurityCapabilities, SecurityViolationType } from '@/types';

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

      await recordViolation(type);
    },
    [enabled, recordViolation],
  );

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
      }
      if (event === 'active' && pausedRef.current) {
        // Returning to app — keep warning visible until Continue Examination.
        setWarningVisible(true);
        setWarningMessage(LEAVE_MESSAGE);
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
      const caps = await ExamSecurityService.getCapabilities();
      if (cancelled) return;
      setCapabilities(caps);
      suppressUntilRef.current = Date.now() + 1500;
      armedRef.current = true;
    }

    void arm();

    return () => {
      cancelled = true;
      armedRef.current = false;
    };
  }, [enabled]);

  const acknowledgeWarning = useCallback(() => {
    setWarningVisible(false);
    setPaused(false);
    suppressUntilRef.current = Date.now() + 1000;
  }, []);

  const requestSubmitFromWarning = useCallback(() => {
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
