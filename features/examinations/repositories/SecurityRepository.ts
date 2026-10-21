import { delay } from '@/shared/utils';
import type {
  ExamTerminationReason,
  SecurityViolation,
  SecurityViolationType,
} from '@/shared/types';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { resolveViolationLimit } from '@/shared/utils/violationLimit';
import { appStorage } from '@/shared/services/storage';
import { apiRequest } from '@/shared/services/api';
import { STORAGE_KEYS } from '@/shared/constants';

let violations: SecurityViolation[] = [];
const GUIDED_ACCESS_LOG_KEY = 'tcc.exam.guidedAccessIncidents';
let incidentWrite: Promise<void> = Promise.resolve();

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

    if (input.type === 'guided_access_lost') {
      violations.push(violation);
      // Serialize writes so simultaneous notification and resume checks do not
      // overwrite one another. Keep the log small enough for SecureStore.
      incidentWrite = incidentWrite.catch(() => undefined).then(async () => {
        const raw = await appStorage.getItem(GUIDED_ACCESS_LOG_KEY);
        let previous: SecurityViolation[] = [];
        try {
          previous = raw ? JSON.parse(raw) as SecurityViolation[] : [];
        } catch {
          previous = [];
        }
        await appStorage.setItem(GUIDED_ACCESS_LOG_KEY, JSON.stringify([...previous, violation].slice(-8)));
      });
      await incidentWrite.catch(() => undefined);
      // The current Laravel and peer /violation handlers acknowledge without
      // storing incidents. Local evidence remains even when reporting fails.
      void appStorage.getItem(STORAGE_KEYS.participationToken).then(async (token) => {
        if (!token) return;
        await apiRequest('/exam/violation', {
          method: 'POST',
          auth: false,
          body: {
            participation_token: token,
            type: input.type,
            message: input.message,
            local_event_id: violation.id,
          },
        }).catch(() => undefined);
      });
    }

    return {
      violation,
      violationCount: violations.filter((item) => item.sessionId === input.sessionId).length,
      terminated: false,
    };
  },

  async getViolations(sessionId?: string): Promise<SecurityViolation[]> {
    await incidentWrite.catch(() => undefined);
    const raw = await appStorage.getItem(GUIDED_ACCESS_LOG_KEY);
    let stored: SecurityViolation[] = [];
    try {
      stored = raw ? JSON.parse(raw) as SecurityViolation[] : [];
    } catch {
      stored = [];
    }
    return sessionId ? stored.filter((item) => item.sessionId === sessionId) : stored;
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
