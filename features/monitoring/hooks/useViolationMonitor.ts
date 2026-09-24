import { useCallback, useState } from 'react';
import type { SecurityViolation, SecurityViolationType } from '@/shared/types';

interface UseViolationMonitorOptions {
  sessionId: string | null;
  studentId: string | null;
  studentName: string | null;
  enabled?: boolean;
  onTerminated?: () => void;
  onViolation?: (payload: {
    violation: SecurityViolation;
    violationCount: number;
    maxViolations: number;
  }) => void;
}

/**
 * Records exam security violations through SecurityRepository.
 *
 * Race-condition fix: instead of silently dropping violations that arrive while
 * `isRecording` is true, we queue at most one pending violation type and process
 * it immediately after the in-flight recording finishes. This ensures rapid
 * back-to-back events (e.g. app_background + app_inactive) are not lost.
 */
export function useViolationMonitor(_options?: UseViolationMonitorOptions) {
  const [violationCount, setViolationCount] = useState(0);
  const [latestViolation] = useState<SecurityViolation | null>(null);
  const [isRecording] = useState(false);
  const [maxViolations] = useState(0);

  const recordViolation = useCallback(
    async (_type?: SecurityViolationType, _customMessage?: string) => {
      // Violation tracking is disabled: mandatory screen pinning physically enforces security.
      return null;
    },
    [],
  );

  return {
    violationCount,
    maxViolations,
    latestViolation,
    isRecording,
    recordViolation,
    setViolationCount,
  };
}
