import { STORAGE_KEYS } from '@/constants';
import { apiRequest } from '@/services/api';
import {
  extractExaminationCode,
  OfflineExamRepository,
} from '@/services/offlineExamRepository';
import { OfflineStore } from '@/services/offlineStore';
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
    if (await OfflineStore.isOfflineMode()) {
      if (!roomId) {
        throw new Error('Select a room first. Each room has its own offline exam code and QR.');
      }
      const sid = String(sessionId).replace(/^offline-/, '');
      const examCode = OfflineExamRepository.makeOfflineCode(sid, roomId);
      await appStorage.setItem(STORAGE_KEYS.offlineScheduleId, sid);
      await appStorage.setItem(STORAGE_KEYS.offlineExamCode, examCode);
      await setStoredCode(examCode);
      const lobby = await this.getLobby(sid, roomId);
      if (!lobby) throw new Error('Offline pack missing this schedule. Download again.');
      return lobby;
    }

    if (!roomId) {
      throw new Error('Select a room first. Each room has its own examination code and QR.');
    }

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
    if (await OfflineStore.isOfflineMode()) {
      return this.openLobby(sessionId, questionBankId, roomId);
    }
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
    examSessionId?: string,
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

    // Ended sessions: load by exam session id (view results / sync).
    if (examSessionId) {
      const byId = await apiRequest<LobbyResponse>(
        `/proctor/sessions/${examSessionId}`,
      ).catch(() => null);
      if (byId?.data) {
        await setStoredCode(byId.data.examinationCode);
        return byId.data;
      }
    }

    return null;
  },

  async getLobby(sessionId?: string, roomId?: string): Promise<LobbySnapshot | null> {
    if (await OfflineStore.isOfflineMode()) {
      const scheduleId =
        (await appStorage.getItem(STORAGE_KEYS.offlineScheduleId)) ||
        String(sessionId || '').replace(/^offline-/, '');
      const examCode =
        (roomId
          ? OfflineExamRepository.makeOfflineCode(scheduleId, roomId)
          : null) ||
        (await appStorage.getItem(STORAGE_KEYS.offlineExamCode)) ||
        (await getStoredCode()) ||
        OfflineExamRepository.makeOfflineCode(scheduleId, roomId);
      const resolved = await OfflineExamRepository.resolveOfflineCode(examCode);
      if (!resolved) return null;
      const canonical =
        resolved.examinationCode ||
        OfflineExamRepository.makeOfflineCode(
          resolved.schedule.id,
          resolved.session.roomId,
        );
      await appStorage.setItem(STORAGE_KEYS.offlineScheduleId, resolved.schedule.id);
      await appStorage.setItem(STORAGE_KEYS.offlineExamCode, canonical);
      await setStoredCode(canonical);
      const students = await OfflineExamRepository.getLobbyStudentsForSchedule(
        resolved.schedule.id,
      );
      const waiting = students.filter((s) => s.status === 'waiting').length;
      return {
        schedule: resolved.schedule,
        session: resolved.session,
        status: 'lobby_open',
        examinationCode: canonical,
        qrValue: canonical,
        roomName: resolved.session.roomName,
        roomId: resolved.session.roomId ? Number(resolved.session.roomId) : undefined,
        registeredCount: students.length,
        connectedCount: 0,
        notYetConnectedCount: waiting,
        waitingCount: waiting,
        takingCount: 0,
        finishedCount: 0,
        warningCount: 0,
        terminatedCount: 0,
        violationsDetected: 0,
        students,
        can_control: true,
      } as LobbySnapshot;
    }

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
    const code = extractExaminationCode(rawCode);

    // Offline-first: cached pack on this phone (no room PC / no internet).
    const offline = await OfflineExamRepository.resolveOfflineCode(code);
    if (offline) {
      const canonical = offline.examinationCode || code;
      await setStoredCode(canonical);
      await appStorage.setItem(STORAGE_KEYS.offlineScheduleId, offline.schedule.id);
      await appStorage.setItem(STORAGE_KEYS.offlineExamCode, canonical);
      await OfflineStore.setOfflineMode(true);
      return {
        valid: true,
        message: offline.message,
        schedule: offline.schedule as ExamCodeValidation['schedule'],
        session: offline.session as ExamCodeValidation['session'],
        examinationCode: canonical,
      };
    }

    const json = await apiRequest<{
      success: boolean;
      valid?: boolean;
      message?: string;
      examinationCode?: string;
      data?: {
        schedule?: ExamCodeValidation['schedule'];
        session?: ExamCodeValidation['session'];
      };
      schedule?: ExamCodeValidation['schedule'];
      session?: ExamCodeValidation['session'];
    }>('/exam/resolve', {
      method: 'POST',
      auth: false,
      body: { code },
    });

    const schedule = json.data?.schedule ?? json.schedule;
    const session = json.data?.session ?? json.session;
    const valid = Boolean(json.valid ?? json.success) && Boolean(schedule && session);
    if (valid && schedule && session) {
      await setStoredCode(json.examinationCode || code);
      await OfflineStore.setOfflineMode(false);
    }
    return {
      valid,
      message: json.message,
      schedule: schedule ?? undefined,
      session: session ?? undefined,
      examinationCode: json.examinationCode || code,
    };
  },

  async joinStudent(student: StudentRecord, sessionId: string): Promise<LobbySnapshot> {
    const code = (await getStoredCode()) || '';
    if (!code) throw new Error('Missing examination code. Scan QR again.');

    if (await OfflineStore.isOfflineMode()) {
      const token = `offline-${student.id}-${Date.now()}`;
      const scheduleId =
        (await appStorage.getItem(STORAGE_KEYS.offlineScheduleId)) ||
        String(sessionId).replace(/^offline-/, '');
      await appStorage.setItem(STORAGE_KEYS.participationToken, token);
      await appStorage.setItem(
        STORAGE_KEYS.studentProgress,
        JSON.stringify({
          registrationId: student.registration_id,
          applicantId: student.id,
          applicantCode: student.studentId,
          sessionId,
          scheduleId,
          participationToken: token,
          offline: true,
        }),
      );
      const lobby = await this.getLobby(sessionId);
      if (!lobby) throw new Error('Offline lobby unavailable. Download the exam pack first.');
      const now = new Date().toISOString();
      const students: LobbyStudent[] = lobby.students.map((s) =>
        s.studentId === student.studentId || s.id === String(student.registration_id)
          ? {
              ...s,
              status: 'taking_exam' as const,
              startedAt: now,
              lastActivityAt: now,
            }
          : s,
      );
      return {
        ...lobby,
        connectedCount: 1,
        waitingCount: Math.max(0, students.filter((s) => s.status === 'waiting').length),
        takingCount: students.filter((s) => s.status === 'taking_exam').length,
        students,
      };
    }

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

  async syncPendingCount(examSessionId?: string | number): Promise<{
    pending: number;
    configured: boolean;
  }> {
    const q = examSessionId != null ? `?exam_session_id=${examSessionId}` : '';
    const json = await apiRequest<{
      success: boolean;
      data?: { pending: number; configured: boolean };
    }>(`/proctor/sync/pending${q}`);
    return {
      pending: json.data?.pending ?? 0,
      configured: Boolean(json.data?.configured),
    };
  },

  async syncToAdmin(examSessionId?: string | number): Promise<{
    synced: number;
    failed: number;
    message: string;
  }> {
    const json = await apiRequest<{
      success: boolean;
      message?: string;
      data?: { synced: number; failed: number; message?: string };
    }>('/proctor/sync/push', {
      method: 'POST',
      body: examSessionId != null ? { exam_session_id: Number(examSessionId) } : {},
    });
    return {
      synced: json.data?.synced ?? 0,
      failed: json.data?.failed ?? 0,
      message: json.message || json.data?.message || 'Sync complete.',
    };
  },

  /** Option B: while LAN server has internet, pull schedules/banks/students from central admin. */
  async pullFromAdmin(examDate?: string): Promise<{ message: string; counts: Record<string, number> }> {
    const json = await apiRequest<{
      success: boolean;
      message?: string;
      data?: { message?: string; counts?: Record<string, number> };
    }>('/proctor/sync/pull', {
      method: 'POST',
      body: examDate ? { exam_date: examDate } : {},
    });
    return {
      message: json.message || json.data?.message || 'Pull complete.',
      counts: json.data?.counts ?? {},
    };
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

  async sendHeartbeat(): Promise<{ ok: boolean; message?: string }> {
    if (await OfflineStore.isOfflineMode()) {
      return { ok: true };
    }
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return { ok: false, message: 'Missing participation token.' };
    try {
      await apiRequest('/exam/heartbeat', {
        method: 'POST',
        auth: false,
        body: { participation_token: token },
      });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Heartbeat failed.',
      };
    }
  },

  async reportWifiDisconnect(): Promise<void> {
    if (await OfflineStore.isOfflineMode()) return;
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return;
    try {
      await apiRequest('/exam/wifi-disconnect', {
        method: 'POST',
        auth: false,
        body: { participation_token: token },
      });
    } catch {
      // Best-effort; local lock still applies.
    }
  },

  async reconnectWithCode(code: string): Promise<{ ok: boolean; message?: string }> {
    if (await OfflineStore.isOfflineMode()) {
      return { ok: false, message: 'Reconnect requires the campus exam server.' };
    }
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return { ok: false, message: 'Missing participation token.' };
    try {
      await apiRequest('/exam/reconnect', {
        method: 'POST',
        auth: false,
        body: {
          participation_token: token,
          reconnect_code: code,
        },
      });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Reconnect failed.',
      };
    }
  },

  async allowStudentReconnect(
    registrationId: string,
  ): Promise<{ reconnectCode: string; expiresAt: string; studentName?: string }> {
    const json = await apiRequest<{
      success: boolean;
      message?: string;
      data?: {
        reconnect_code: string;
        expires_at: string;
        student_name?: string;
      };
    }>(`/proctor/registrations/${registrationId}/allow-reconnect`, {
      method: 'POST',
    });
    if (!json.data?.reconnect_code) {
      throw new Error(json.message || 'Unable to issue reconnect code.');
    }
    return {
      reconnectCode: json.data.reconnect_code,
      expiresAt: json.data.expires_at,
      studentName: json.data.student_name,
    };
  },

  lobbyKey: lobbyQueryKey,
};
