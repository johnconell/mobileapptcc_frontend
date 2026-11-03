import { useCallback, useEffect, useRef, useState } from 'react';
import type { SecurityViolation, SecurityViolationType } from '@/shared/types';
import { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';

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
export function useViolationMonitor(options?: UseViolationMonitorOptions) {
  const enabled = options?.enabled ?? false;
  const sessionId = options?.sessionId ?? null;
  const studentId = options?.studentId ?? null;
  const studentName = options?.studentName ?? null;
  const onViolation = options?.onViolation;
  const [violationCount, setViolationCount] = useState(0);
  const [latestViolation, setLatestViolation] = useState<SecurityViolation | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [maxViolations] = useState(0);
  const activeRecords = useRef(0);

  useEffect(() => {
    let active = true;
    if (!enabled || !sessionId || !studentId) {
      setViolationCount(0);
      setLatestViolation(null);
      return () => {
        active = false;
      };
    }

    void SecurityRepository.getViolations(sessionId)
      .then((incidents) => {
        if (!active) return;
        const studentIncidents = incidents.filter((incident) => incident.studentId === studentId);
        setViolationCount(studentIncidents.length);
        setLatestViolation(studentIncidents[studentIncidents.length - 1] ?? null);
      })
      .catch((error) =>
        console.error('[SECURITY INCIDENT] Could not load local incident history.', error),
      );
    return () => {
      active = false;
    };
  }, [enabled, sessionId, studentId]);

  const recordViolation = useCallback(
    async (type?: SecurityViolationType, customMessage?: string) => {
      if (
        !enabled ||
        !sessionId ||
        !studentId ||
        !studentName ||
        !type
      ) {
        return null;
      }

      activeRecords.current += 1;
      setIsRecording(true);
      try {
        const result = await SecurityRepository.recordViolation({
          sessionId,
          studentId,
          studentName,
          type,
          message: customMessage ?? `Detected security event: ${type.replace(/_/g, ' ')}.`,
        });
        setViolationCount(result.violationCount);
        setLatestViolation(result.violation);
        onViolation?.({
          violation: result.violation,
          violationCount: result.violationCount,
          maxViolations,
        });
        return result;
      } catch (error) {
        console.error('[SECURITY INCIDENT] Could not persist security incident.', error);
        return null;
      } finally {
        activeRecords.current -= 1;
        if (activeRecords.current === 0) setIsRecording(false);
      }
    },
    [enabled, maxViolations, onViolation, sessionId, studentId, studentName],
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
