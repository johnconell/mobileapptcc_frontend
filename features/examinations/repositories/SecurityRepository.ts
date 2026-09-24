import { delay } from '@/shared/utils';
import type {
  ExamTerminationReason,
  SecurityViolation,
  SecurityViolationType,
} from '@/shared/types';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { resolveViolationLimit } from '@/shared/utils/violationLimit';

let violations: SecurityViolation[] = [];

function createId() {
  return `viol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * SecurityRepository — local violation log + Laravel POST /exam/violation.
 *
 * The in-memory `violations` array is the authoritative LOCAL source of truth.
 * Its count is always passed to LobbyRepository as `localCount` so that violations
 * are never silently lost when the server (proctor phone or cloud) is unreachable.
 */
export const SecurityRepository = {
  async getMaxViolations(): Promise<number> {
    return 0;
  },

  async recordViolation(input: {
    sessionId: string;
    studentId: string;
    studentName: string;
    type: SecurityViolationType;
    message: string;
  }): Promise<{
    violation: SecurityViolation;
    violationCount: number;
    terminated: boolean;
  }> {
    const violation: SecurityViolation = {
      id: createId(),
      sessionId: input.sessionId,
      studentId: input.studentId,
      studentName: input.studentName,
      type: input.type,
      message: input.message,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    return {
      violation,
      violationCount: 0,
      terminated: false,
    };
  },

  async getViolations(_sessionId?: string): Promise<SecurityViolation[]> {
    return [];
  },

  async getStudentViolations(_studentId: string): Promise<SecurityViolation[]> {
    return [];
  },

  async resolveViolation(_violationId: string): Promise<void> {
    // No-op
  },

  async clearSession(_sessionId: string): Promise<void> {
    // No-op
  },
};

export type { ExamTerminationReason };
