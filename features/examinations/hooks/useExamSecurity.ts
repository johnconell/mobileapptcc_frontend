import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
import { useAppState } from '@/shared/hooks/useAppState';
import { useKioskMode } from '@/features/examinations/hooks/useKioskMode';
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

const LEAVE_MESSAGE = 'Screen Pinning is active. Leaving the examination is prohibited.';

/**
 * Orchestrates Secure Examination / Kiosk Mode.
 * Mandatory screen pinning enforces kiosk containment; violation tracking is disabled.
 */
export function useExamSecurity(options: UseExamSecurityOptions) {
  const {
    enabled,
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

  const handleSecurityEvent = useCallback(
    (_type: SecurityViolationType) => {
      if (!enabled || !armedRef.current) return;
      if (Date.now() < suppressUntilRef.current) return;
      if (pausedRef.current) return;

      // Show reminder warning to remain in the exam screen
      setPaused(true);
      setWarningVisible(true);
      setWarningMessage(
        'Warning: You navigated away from the examination. Screen pinning is required to continue. Please remain on this screen.'
      );
    },
    [enabled],
  );

  const handleReturnToExam = useCallback(() => {
    if (pausedRef.current) {
      setWarningVisible(true);
    }
  }, []);

  useKioskMode({
    enabled,
    onBackAttempt: () => {
      handleSecurityEvent('leave_attempt');
    },
    onScreenshot: () => {
      handleSecurityEvent('screenshot');
    },
    onMultiWindow: () => {
      handleSecurityEvent('app_inactive');
    },
  });

  useAppState({
    enabled,
    onChange: (event) => {
      if (!armedRef.current) return;
      if (event === 'background') {
        handleSecurityEvent('app_background');
        return;
      }
      if (event === 'inactive') {
        handleSecurityEvent('app_inactive');
        return;
      }
      if (event === 'active') {
        handleReturnToExam();
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

    // On Web: detect tab blur, window blur, contextmenu (right-click), and copy-paste
    let cleanupWeb: (() => void) | undefined;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleBlur = () => {
        handleSecurityEvent('app_inactive');
      };
      const handleFocus = () => {
        handleReturnToExam();
      };
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        handleSecurityEvent('app_inactive');
      };
      const handleCopy = (e: ClipboardEvent) => {
        e.preventDefault();
        handleSecurityEvent('app_inactive');
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
      handleSecurityEvent('app_blur');
    });
    const focusGainedSub = DeviceEventEmitter.addListener('onWindowFocusGained', () => {
      handleReturnToExam();
    });

    return () => {
      cancelled = true;
      armedRef.current = false;
      focusLostSub.remove();
      focusGainedSub.remove();
      cleanupWeb?.();
    };
  }, [enabled, handleReturnToExam, handleSecurityEvent]);

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
    violationCount: 0,
    maxViolations: 0,
    latestViolation: null,
    acknowledgeWarning,
    requestSubmitFromWarning,
    recordViolation: async () => null,
    setViolationCount: () => {},
  };
}
