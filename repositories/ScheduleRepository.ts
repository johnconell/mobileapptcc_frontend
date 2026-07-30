import { delay } from '@/utils';
import schedulesData from '@/mock/data/schedules.json';
import sessionsData from '@/mock/data/sessions.json';
import { LobbyRepository } from '@/repositories/LobbyRepository';
import type { ExamCodeValidation, ExamSchedule, ExamSession } from '@/types';

/**
 * ScheduleRepository — mock schedules/sessions.
 * Future Laravel: GET /api/schedules, GET /api/schedules/:id/sessions
 */
export const ScheduleRepository = {
  async getSchedules(): Promise<ExamSchedule[]> {
    await delay(300);
    return schedulesData as ExamSchedule[];
  },

  async getScheduleById(id: string): Promise<ExamSchedule | null> {
    await delay(200);
    return (schedulesData as ExamSchedule[]).find((item) => item.id === id) ?? null;
  },

  async getSessionsBySchedule(scheduleId: string): Promise<ExamSession[]> {
    await delay(300);
    return (sessionsData as ExamSession[]).filter((item) => item.scheduleId === scheduleId);
  },

  async getSessionById(id: string): Promise<ExamSession | null> {
    await delay(200);
    return (sessionsData as ExamSession[]).find((item) => item.id === id) ?? null;
  },

  /**
   * Resolve session from scanned QR value.
   * QR encodes the examination code (e.g. ABCD-2026).
   */
  async resolveSessionFromQr(raw: string): Promise<ExamCodeValidation> {
    await delay(250);
    const trimmed = raw.trim();

    // Prefer examination-code lookup via LobbyRepository
    const byCode = await LobbyRepository.verifyExaminationCode(trimmed);
    if (byCode.valid) return byCode;

    // Fallback: JSON payload from older QR formats
    try {
      const parsed = JSON.parse(trimmed) as {
        examinationCode?: string;
        sessionId?: string;
      };
      if (parsed.examinationCode) {
        return LobbyRepository.verifyExaminationCode(parsed.examinationCode);
      }
      if (parsed.sessionId) {
        const session = (sessionsData as ExamSession[]).find((s) => s.id === parsed.sessionId);
        const schedule = session
          ? (schedulesData as ExamSchedule[]).find((s) => s.id === session.scheduleId)
          : undefined;
        if (session && schedule) {
          const lobby = await LobbyRepository.openLobby(session.id);
          return {
            valid: true,
            schedule,
            session,
            examinationCode: lobby.examinationCode,
          };
        }
      }
    } catch {
      // not JSON
    }

    return { valid: false, message: 'Unrecognized QR Code. Ask your proctor for help.' };
  },
};
