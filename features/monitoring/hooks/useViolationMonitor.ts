import { useCallback, useEffect, useState } from 'react';
import { MAX_EXAM_VIOLATIONS, VIOLATION_MESSAGES } from '@/shared/constants';
import { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';
import { resolveViolationLimit } from '@/shared/utils/violationLimit';
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
 */
export function useViolationMonitor(options: UseViolationMonitorOptions) {
  const {
    sessionId,
    studentId,
    studentName,
    enabled = true,
    onTerminated,
    onViolation,
  } = options;

  const [violationCount, setViolationCount] = useState(0);
  const [latestViolation, setLatestViolation] = useState<SecurityViolation | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [maxViolations, setMaxViolations] = useState(MAX_EXAM_VIOLATIONS);

  useEffect(() => {
    let cancelled = false;
    void resolveViolationLimit().then((n) => {
      if (!cancelled) setMaxViolations(n);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  const recordViolation = useCallback(
    async (type: SecurityViolationType, customMessage?: string) => {
      if (!enabled || !sessionId || !studentId || !studentName || isRecording) {
        return null;
      }

      setIsRecording(true);
      try {
        const result = await SecurityRepository.recordViolation({
          sessionId,
          studentId,
          studentName,
          type,
          message: customMessage ?? VIOLATION_MESSAGES[type] ?? 'Unauthorized activity detected.',
        });

        const limit = await resolveViolationLimit();
        setMaxViolations(limit);
        setViolationCount(result.violationCount);
        setLatestViolation(result.violation);
        onViolation?.({
          violation: result.violation,
          violationCount: result.violationCount,
          maxViolations: limit,
        });

        if (result.terminated) {
          onTerminated?.();
        }

        return result;
      } finally {
        setIsRecording(false);
      }
    },
    [
      enabled,
      sessionId,
      studentId,
      studentName,
      isRecording,
      onTerminated,
      onViolation,
    ],
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
