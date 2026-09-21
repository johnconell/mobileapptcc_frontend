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

    // Increment local list BEFORE calling the server so the local count is always
    // at least as high as what we report to LobbyRepository.
    violations = [violation, ...violations];

    // Local count is the number of violations for THIS student in this session.
    const localCount = violations.filter(
      (v) => v.studentId === input.studentId && v.sessionId === input.sessionId,
    ).length;

    const maxViolations = await resolveViolationLimit();

    // Pass localCount to LobbyRepository so it can be used as a floor when the
    // proctor phone or cloud server is unreachable (offline mode, network error).
    const result = await LobbyRepository.recordStudentViolation(
      input.studentId,
      input.type,
      input.message,
      localCount,
    );

    // The final count is already Math.max(serverCount, localCount) inside
    // LobbyRepository, so result.violationCount is always at least localCount.
    const violationCount = result.violationCount;
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
