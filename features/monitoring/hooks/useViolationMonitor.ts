import { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * Race-condition fix: instead of silently dropping violations that arrive while
 * `isRecording` is true, we queue at most one pending violation type and process
 * it immediately after the in-flight recording finishes. This ensures rapid
 * back-to-back events (e.g. app_background + app_inactive) are not lost.
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

  // Queue for at most one pending violation while isRecording is true.
  const pendingViolationRef = useRef<SecurityViolationType | null>(null);

  // Stable refs so the recording callback always sees the latest callbacks
  // without being recreated on every render.
  const onTerminatedRef = useRef(onTerminated);
  onTerminatedRef.current = onTerminated;
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

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
      if (!enabled || !sessionId || !studentId || !studentName) {
        return null;
      }

      // If a recording is already in-flight, queue this type (overwrite any
      // already-pending type — the important thing is that at least one more
      // violation will be recorded rather than being completely dropped).
      if (isRecording) {
        pendingViolationRef.current = type;
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
        onViolationRef.current?.({
          violation: result.violation,
          violationCount: result.violationCount,
          maxViolations: limit,
        });

        if (result.terminated) {
          onTerminatedRef.current?.();
        }

        return result;
      } finally {
        setIsRecording(false);

        // If another violation was queued while we were recording, process it
        // now using a microtask so the state update above settles first.
        const queued = pendingViolationRef.current;
        if (queued !== null) {
          pendingViolationRef.current = null;
          // Use setTimeout(0) to allow React state to flush before re-entering.
          setTimeout(() => {
            if (enabled && sessionId && studentId && studentName) {
              void SecurityRepository.recordViolation({
                sessionId,
                studentId,
                studentName,
                type: queued,
                message: VIOLATION_MESSAGES[queued] ?? 'Unauthorized activity detected.',
              }).then((result) => {
                if (!result) return;
                resolveViolationLimit().then((limit) => {
                  setMaxViolations(limit);
                  setViolationCount(result.violationCount);
                  setLatestViolation(result.violation);
                  onViolationRef.current?.({
                    violation: result.violation,
                    violationCount: result.violationCount,
                    maxViolations: limit,
                  });
                  if (result.terminated) {
                    onTerminatedRef.current?.();
                  }
                });
              });
            }
          }, 0);
        }
      }
    },
    [enabled, sessionId, studentId, studentName, isRecording],
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
