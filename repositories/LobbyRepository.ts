import { STORAGE_KEYS } from '@/constants';
import { apiRequest } from '@/services/api';
import { appStorage } from '@/services/storage';
import type {
  ExamCodeValidation,
  LobbySnapshot,
  LobbyStudent,
  StudentRecord,
} from '@/types';

type LobbyResponse = {
  success: boolean;
  message?: string;
  data?: LobbySnapshot & {
    exam_session_id?: number;
  };
};

async function getStoredCode(): Promise<string | null> {
  return appStorage.getItem(STORAGE_KEYS.examinationCode);
}

async function setStoredCode(code: string | null) {
  if (code) await appStorage.setItem(STORAGE_KEYS.examinationCode, code);
  else await appStorage.deleteItem(STORAGE_KEYS.examinationCode);
}

function lobbyQueryKey(sessionId: string, roomId?: string) {
  return roomId ? `${sessionId}:room:${roomId}` : sessionId;
}

/**
 * LobbyRepository — Laravel exam session lobby + QR code workflow.
 * `sessionId` = examination_schedules.id; `roomId` = examination_rooms.id.
 */
export const LobbyRepository = {
  async openLobby(
    sessionId: string,
    questionBankId?: number,
    roomId?: string,
  ): Promise<LobbySnapshot> {
    const body: Record<string, unknown> = {
      examination_schedule_id: Number(sessionId),
    };
    if (questionBankId) body.question_bank_id = questionBankId;
    if (roomId) body.examination_room_id = Number(roomId);

    const json = await apiRequest<LobbyResponse>('/proctor/sessions', {
      method: 'POST',
      body,
    });
    if (!json.data) throw new Error(json.message || 'Unable to open lobby.');
    await setStoredCode(json.data.examinationCode);
    return json.data;
  },

  /** Open lobby once if none exists; otherwise return the active lobby. */
  async ensureLobby(
    sessionId: string,
    questionBankId?: number,
    roomId?: string,
  ): Promise<LobbySnapshot> {
    const existing = await this.fetchProctorLobby(sessionId, roomId);
    if (existing) return existing;
    return this.openLobby(sessionId, questionBankId, roomId);
  },

  /** Kept for compatibility; opens/reuses real lobby (no demo seeding). */
  async seedDemoStudents(sessionId: string): Promise<LobbySnapshot> {
    return this.ensureLobby(sessionId);
  },

  async fetchProctorLobby(
    sessionId: string,
    roomId?: string,
  ): Promise<LobbySnapshot | null> {
    const qs = roomId
      ? `?examination_room_id=${encodeURIComponent(roomId)}`
      : '';
    const bySchedule = await apiRequest<LobbyResponse>(
      `/proctor/schedules/${sessionId}/lobby${qs}`,
    ).catch(() => null);

    if (bySchedule?.data) {
      await setStoredCode(bySchedule.data.examinationCode);
      return bySchedule.data;
    }
    return null;
  },

  async getLobby(sessionId?: string, roomId?: string): Promise<LobbySnapshot | null> {
    const proctorToken = await appStorage.getItem(STORAGE_KEYS.proctorToken);

    // Proctor path first when authenticated as proctor (do not auto-create).
    if (proctorToken && sessionId) {
      return this.fetchProctorLobby(sessionId, roomId);
    }

    // Student path: poll with participation token.
    try {
      const participation = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (participation) {
        const json = await apiRequest<{ success: boolean; data?: LobbySnapshot }>(
          `/exam/lobby?participation_token=${encodeURIComponent(participation)}`,
          { auth: false },
        );
        return json.data ?? null;
      }
    } catch {
      // fall through
    }

    if (!sessionId) {
      const code = await getStoredCode();
      if (code) return this.getLobbyByCode(code);
      return null;
    }

    return this.fetchProctorLobby(sessionId, roomId);
  },

  async getLobbyByCode(rawCode: string): Promise<LobbySnapshot | null> {
    const code = rawCode.trim().toUpperCase();
    const json = await apiRequest<{ success: boolean; data?: LobbySnapshot }>(
      `/exam/lobby?code=${encodeURIComponent(code)}`,
      { auth: false },
    );
    if (!json.data) return null;
    await setStoredCode(code);
    return json.data;
  },

  async regenerateQr(sessionId: string, roomId?: string): Promise<LobbySnapshot> {
    const current = await this.ensureLobby(sessionId, undefined, roomId);
    const examSessionId = current?.session?.examSessionId;
    if (!examSessionId) {
      return this.openLobby(sessionId, undefined, roomId);
    }

    const json = await apiRequest<LobbyResponse>(
      `/proctor/sessions/${examSessionId}/regenerate-code`,
      { method: 'POST' },
    );
    if (!json.data) throw new Error(json.message || 'Unable to regenerate code.');
    await setStoredCode(json.data.examinationCode);
    return json.data;
  },

  async verifyExaminationCode(rawCode: string): Promise<ExamCodeValidation> {
    const code = rawCode.trim();
    if (!code) {
      return { valid: false, message: 'Enter an examination code.' };
    }

    try {
      const json = await apiRequest<{
        success: boolean;
        valid: boolean;
        message?: string;
        examinationCode?: string;
        schedule?: ExamCodeValidation['schedule'];
        session?: ExamCodeValidation['session'];
      }>('/exam/resolve', {
        method: 'POST',
        auth: false,
        body: { code, qr: code },
      });

      if (!json.valid) {
        return { valid: false, message: json.message || 'Invalid examination code.' };
      }

      await setStoredCode(json.examinationCode || code.toUpperCase());
      return {
        valid: true,
        schedule: json.schedule,
        session: json.session,
        examinationCode: json.examinationCode,
      };
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'Unable to verify code.',
      };
    }
  },

  async joinStudent(student: StudentRecord, sessionId: string): Promise<LobbySnapshot> {
    const code = (await getStoredCode()) || '';
    if (!code) throw new Error('Missing examination code. Scan QR again.');

    const json = await apiRequest<{
      success: boolean;
      message?: string;
      data?: {
        registration_id: number;
        participation_token: string;
        lobby: LobbySnapshot;
      };
    }>('/exam/join', {
      method: 'POST',
      auth: false,
      body: {
        code,
        applicant_id: Number(student.id),
        gmail: student.email || undefined,
      },
    });

    if (!json.data) throw new Error(json.message || 'Unable to join examination.');

    await appStorage.setItem(
      STORAGE_KEYS.participationToken,
      json.data.participation_token,
    );
    await appStorage.setItem(
      STORAGE_KEYS.studentProgress,
      JSON.stringify({
        registrationId: json.data.registration_id,
        applicantId: student.id,
        sessionId,
        participationToken: json.data.participation_token,
      }),
    );

    return json.data.lobby;
  },

  async startExamination(sessionId: string, roomId?: string): Promise<LobbySnapshot> {
    const current = await this.ensureLobby(sessionId, undefined, roomId);
    const examSessionId = current?.session?.examSessionId;
    if (!examSessionId) throw new Error('Examination session not found.');

    const json = await apiRequest<LobbyResponse>(
      `/proctor/sessions/${examSessionId}/start`,
      { method: 'POST' },
    );
    if (!json.data) throw new Error(json.message || 'Unable to start examination.');
    return json.data;
  },

  async endExamination(sessionId: string, roomId?: string): Promise<LobbySnapshot> {
    const current = await this.ensureLobby(sessionId, undefined, roomId);
    const examSessionId = current?.session?.examSessionId;
    if (!examSessionId) throw new Error('Examination session not found.');

    const json = await apiRequest<LobbyResponse>(
      `/proctor/sessions/${examSessionId}/end`,
      { method: 'POST' },
    );
    if (!json.data) throw new Error(json.message || 'Unable to end examination.');
    return json.data;
  },

  async finishStudent(
    studentId: string,
    reason: string = 'submitted',
  ): Promise<void> {
    void studentId;
    void reason;
    // Submission endpoint already marks finished; keep as no-op compatibility.
  },

  async resumeStudent(studentId: string): Promise<LobbySnapshot | null> {
    void studentId;
    return null;
  },

  async terminateStudent(studentId: string): Promise<LobbySnapshot | null> {
    // studentId in lobby cards is registration id string.
    await apiRequest(`/proctor/registrations/${studentId}/terminate`, {
      method: 'POST',
    });
    return null;
  },

  async recordStudentViolation(
    studentId: string,
    type: string,
  ): Promise<LobbyStudent | null> {
    void studentId;
    void type;
    return null;
  },

  async touchActivity(studentId: string): Promise<void> {
    void studentId;
  },

  lobbyKey: lobbyQueryKey,
};
