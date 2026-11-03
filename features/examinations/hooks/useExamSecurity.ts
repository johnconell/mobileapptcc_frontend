import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import * as Network from 'expo-network';
import { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
import { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';
import { useAppState } from '@/shared/hooks/useAppState';
import { useKioskMode } from '@/features/examinations/hooks/useKioskMode';
import { useViolationMonitor } from '@/features/monitoring/hooks/useViolationMonitor';
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

const LEAVE_MESSAGE = 'Remain in the examination. Leaving the app may be detected and reported.';

/**
 * Orchestrates best-effort exam restrictions and records detected security events.
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
  const incidentMonitor = useViolationMonitor({
    enabled,
    sessionId: options.sessionId,
    studentId: options.studentId,
    studentName: options.studentName,
  });
  const recordViolation = incidentMonitor.recordViolation;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const handleSecurityEvent = useCallback(
    (type: SecurityViolationType) => {
      if (!enabled || !armedRef.current) return;
      if (Date.now() < suppressUntilRef.current) return;
      void recordViolation(type).catch((error) =>
        console.error('[SECURITY INCIDENT] Could not record detected event.', error),
      );
      if (!pausedRef.current) {
        setPaused(true);
        setWarningVisible(true);
        setWarningMessage(
          'A security-related event was detected and recorded for proctor review. Detection does not prevent leaving the app.'
        );
      }
    },
    [enabled, recordViolation],
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
    if (!enabled) return;
    const retryPending = () => {
      void SecurityRepository.flushPending().catch((error) =>
        console.error('[SECURITY INCIDENT] Could not retry incident delivery.', error),
      );
    };

    retryPending();
    const retryTimer = setInterval(retryPending, 15_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retryPending();
      }
    });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected) {
        retryPending();
      }
    });
    return () => {
      clearInterval(retryTimer);
      subscription.remove();
      networkSubscription.remove();
    };
  }, [enabled]);

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
    violationCount: incidentMonitor.violationCount,
    maxViolations: incidentMonitor.maxViolations,
    latestViolation: incidentMonitor.latestViolation,
    acknowledgeWarning,
    requestSubmitFromWarning,
    recordViolation,
    setViolationCount: incidentMonitor.setViolationCount,
  };
}
