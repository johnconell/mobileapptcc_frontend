import { delay } from '@/utils';
import schedulesData from '@/mock/data/schedules.json';
import sessionsData from '@/mock/data/sessions.json';
import type {
  ExamLifecycleStatus,
  ExamSchedule,
  ExamSession,
  LobbySnapshot,
  LobbyStudent,
  LobbyStudentStatus,
  StudentRecord,
} from '@/types';

interface LobbyState {
  schedule: ExamSchedule | null;
  session: ExamSession | null;
  status: ExamLifecycleStatus;
  examinationCode: string | null;
  students: LobbyStudent[];
}

/** sessionId → examination code registry (mock stand-in for Laravel) */
const codeBySession = new Map<string, string>();
const sessionByCode = new Map<string, string>();

let state: LobbyState = {
  schedule: null,
  session: null,
  status: 'scheduled',
  examinationCode: null,
  students: [],
};

function counts() {
  const registeredCount = state.session?.registeredStudents ?? 0;
  const connectedCount = state.students.length;
  return {
    registeredCount,
    connectedCount,
    notYetConnectedCount: Math.max(0, registeredCount - connectedCount),
    waitingCount: state.students.filter(
      (s) => s.status === 'waiting' || s.status === 'connected',
    ).length,
    takingCount: state.students.filter((s) => s.status === 'taking_exam').length,
    finishedCount: state.students.filter((s) => s.status === 'finished').length,
  };
}

function snapshot(): LobbySnapshot {
  if (!state.schedule || !state.session || !state.examinationCode) {
    throw new Error('Lobby has not been opened for a session.');
  }

  return {
    schedule: state.schedule,
    session: state.session,
    status: state.status,
    examinationCode: state.examinationCode,
    qrValue: state.examinationCode,
    students: [...state.students],
    ...counts(),
  };
}

function generateCode(schedule: ExamSchedule, session: ExamSession): string {
  const year = schedule.examinationDateIso.slice(0, 4) || '2026';
  const batchLetter = session.batchNumber.replace(/[^A-Za-z]/g, '').slice(-1) || 'A';
  const salt = Math.random().toString(36).slice(2, 5).toUpperCase();
  // Example shape: ABCD-2026
  const prefix = `${batchLetter}${salt}`.slice(0, 4).toUpperCase().padEnd(4, 'X');
  return `${prefix}-${year}`;
}

function ensureCode(schedule: ExamSchedule, session: ExamSession): string {
  const existing = codeBySession.get(session.id);
  if (existing) return existing;
  const code = generateCode(schedule, session);
  codeBySession.set(session.id, code);
  sessionByCode.set(code.toUpperCase(), session.id);
  return code;
}

function rotateCode(schedule: ExamSchedule, session: ExamSession): string {
  const old = codeBySession.get(session.id);
  if (old) sessionByCode.delete(old.toUpperCase());
  const code = generateCode(schedule, session);
  codeBySession.set(session.id, code);
  sessionByCode.set(code.toUpperCase(), session.id);
  return code;
}

/**
 * LobbyRepository — in-memory session lobby shared by Proctor/Student.
 * Future Laravel: GET /api/lobby/:sessionId, POST /api/lobby/code/verify
 */
export const LobbyRepository = {
  async openLobby(sessionId: string): Promise<LobbySnapshot> {
    await delay(350);
    const session = (sessionsData as ExamSession[]).find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found');
    const schedule = (schedulesData as ExamSchedule[]).find((s) => s.id === session.scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const sameSession = state.session?.id === sessionId;
    const examinationCode = sameSession && state.examinationCode
      ? state.examinationCode
      : ensureCode(schedule, session);

    state = {
      schedule,
      session,
      status: sameSession ? state.status : 'lobby_open',
      examinationCode,
      students: sameSession ? state.students : [],
    };

    return snapshot();
  },

  async getLobby(sessionId?: string): Promise<LobbySnapshot | null> {
    await delay(200);
    if (!state.session || !state.examinationCode) return null;
    if (sessionId && state.session.id !== sessionId) return null;
    return snapshot();
  },

  async getLobbyByCode(rawCode: string): Promise<LobbySnapshot | null> {
    await delay(250);
    const code = rawCode.trim().toUpperCase();
    const sessionId = sessionByCode.get(code);
    if (!sessionId) return null;
    if (state.session?.id === sessionId) return snapshot();
    return this.openLobby(sessionId);
  },

  async regenerateQr(sessionId: string): Promise<LobbySnapshot> {
    await delay(300);
    if (!state.session || state.session.id !== sessionId || !state.schedule) {
      return this.openLobby(sessionId);
    }
    state.examinationCode = rotateCode(state.schedule, state.session);
    return snapshot();
  },

  async verifyExaminationCode(rawCode: string): Promise<{
    valid: boolean;
    message?: string;
    schedule?: ExamSchedule;
    session?: ExamSession;
    examinationCode?: string;
  }> {
    await delay(400);
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      return { valid: false, message: 'Enter an examination code.' };
    }

    // Prefer live lobby codes; also accept any registered code.
    let sessionId = sessionByCode.get(code);

    // If no lobby opened yet, allow demo code pattern against first session when matching known codes,
    // or open first entrance session when code equals a seeded demo.
    if (!sessionId) {
      // Auto-provision: if code looks valid (XXXX-YYYY) but lobby not opened, reject with clear message.
      if (/^[A-Z0-9]{4}-\d{4}$/.test(code)) {
        return {
          valid: false,
          message: 'Code not active. Ask your proctor to open the lobby and share the current code.',
        };
      }
      return { valid: false, message: 'Invalid examination code.' };
    }

    const session = (sessionsData as ExamSession[]).find((s) => s.id === sessionId);
    const schedule = session
      ? (schedulesData as ExamSchedule[]).find((s) => s.id === session.scheduleId)
      : undefined;

    if (!session || !schedule) {
      return { valid: false, message: 'Examination session not found.' };
    }

    return {
      valid: true,
      schedule,
      session,
      examinationCode: code,
    };
  },

  async joinStudent(student: StudentRecord, sessionId: string): Promise<LobbySnapshot> {
    await delay(350);
    if (!state.session || state.session.id !== sessionId) {
      await this.openLobby(sessionId);
    }

    const existing = state.students.find((s) => s.id === student.id);
    if (existing) {
      state.students = state.students.map((s) =>
        s.id === student.id
          ? {
              ...s,
              fullName: student.fullName,
              email: student.email,
              programCode: student.programCode,
              programName: student.programName,
              status: s.status === 'finished' || s.status === 'taking_exam' ? s.status : 'waiting',
              joinedAt: new Date().toISOString(),
            }
          : s,
      );
    } else {
      state.students = [
        ...state.students,
        {
          id: student.id,
          studentId: student.studentId,
          fullName: student.fullName,
          email: student.email,
          programCode: student.programCode,
          programName: student.programName,
          avatarInitials: student.avatarInitials,
          status: 'waiting',
          joinedAt: new Date().toISOString(),
        },
      ];
    }

    if (state.status === 'scheduled') {
      state.status = 'lobby_open';
    }

    return snapshot();
  },

  async startExamination(sessionId: string): Promise<LobbySnapshot> {
    await delay(450);
    if (!state.session || state.session.id !== sessionId) {
      await this.openLobby(sessionId);
    }
    state.status = 'in_progress';
    state.students = state.students.map((s) => {
      if (s.status === 'waiting' || s.status === 'connected') {
        return { ...s, status: 'taking_exam' as LobbyStudentStatus };
      }
      return s;
    });
    return snapshot();
  },

  async endExamination(sessionId: string): Promise<LobbySnapshot> {
    await delay(400);
    if (state.session?.id !== sessionId) {
      throw new Error('Lobby session mismatch');
    }
    state.status = 'ended';
    state.students = state.students.map((s) =>
      s.status === 'taking_exam' || s.status === 'waiting' || s.status === 'connected'
        ? { ...s, status: 'finished' as LobbyStudentStatus }
        : s,
    );
    return snapshot();
  },

  async finishStudent(studentId: string): Promise<LobbySnapshot | null> {
    await delay(200);
    if (!state.session) return null;
    state.students = state.students.map((s) =>
      s.id === studentId ? { ...s, status: 'finished' } : s,
    );
    return snapshot();
  },

  async seedDemoStudents(sessionId: string): Promise<LobbySnapshot> {
    const lobby = await this.openLobby(sessionId);
    if (lobby.students.length > 0) return lobby;

    const demos: LobbyStudent[] = [
      {
        id: 'stu-001',
        studentId: '2026-1001',
        fullName: 'Andrea Santos Reyes',
        email: 'andrea.reyes1@gmail.com',
        programCode: 'BSIT',
        programName: 'BS Information Technology',
        avatarInitials: 'AR',
        status: 'connected',
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'stu-002',
        studentId: '2026-1002',
        fullName: 'Brian Reyes Santos',
        email: 'brian.santos2@gmail.com',
        programCode: 'BSBA',
        programName: 'BS Business Administration',
        avatarInitials: 'BS',
        status: 'waiting',
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'stu-003',
        studentId: '2026-1003',
        fullName: 'Carla Cruz Garcia',
        email: 'carla.garcia3@gmail.com',
        programCode: 'BSED',
        programName: 'BS Education',
        avatarInitials: 'CG',
        status: 'waiting',
        joinedAt: new Date().toISOString(),
      },
    ];
    state.students = demos;
    return snapshot();
  },
};
