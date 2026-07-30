import { useCallback, useState } from 'react';
import { MAX_EXAM_VIOLATIONS, VIOLATION_MESSAGES } from '@/constants';
import { SecurityRepository } from '@/repositories';
import type { SecurityViolation, SecurityViolationType } from '@/types';

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
  const maxViolations = MAX_EXAM_VIOLATIONS;

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

        setViolationCount(result.violationCount);
        setLatestViolation(result.violation);
        onViolation?.({
          violation: result.violation,
          violationCount: result.violationCount,
          maxViolations,
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
      maxViolations,
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
