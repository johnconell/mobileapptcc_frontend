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
 */
export const SecurityRepository = {
  async getMaxViolations(): Promise<number> {
    return resolveViolationLimit();
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
    await delay(150);

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

    violations = [violation, ...violations];

    const result = await LobbyRepository.recordStudentViolation(
      input.studentId,
      input.type,
      input.message,
    );

    const maxViolations = await resolveViolationLimit();
    const localCount = violations.filter((v) => v.studentId === input.studentId).length;
    const violationCount = Math.max(result.violationCount || 0, localCount);
    const terminated = result.terminated || violationCount >= maxViolations;

    return {
      violation,
      violationCount,
      terminated,
    };
  },

  async getViolations(sessionId?: string): Promise<SecurityViolation[]> {
    await delay(200);
    if (!sessionId) return [...violations];
    return violations.filter((v) => v.sessionId === sessionId);
  },

  async getStudentViolations(studentId: string): Promise<SecurityViolation[]> {
    await delay(150);
    return violations.filter((v) => v.studentId === studentId);
  },

  async resolveViolation(violationId: string): Promise<void> {
    await delay(100);
    violations = violations.map((v) =>
      v.id === violationId ? { ...v, resolved: true } : v,
    );
  },

  async clearSession(sessionId: string): Promise<void> {
    await delay(100);
    violations = violations.filter((v) => v.sessionId !== sessionId);
  },
};

export type { ExamTerminationReason };
