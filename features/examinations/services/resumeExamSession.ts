import { STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import type { StudentRecord } from '@/shared/types';
import { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { isExamLocked, stopExamLock } from '@/features/examinations/services/ExamSecurityService';
import { hasValidLocalStudentParticipation } from '@/features/monitoring/services/reconnectExitPolicy';
import { ExamSubmissionStore } from '@/features/examinations/services/examSubmissionStore';

type StoredStudentProgress = {
  registrationId?: number;
  applicantId?: string | number;
  applicantCode?: string;
  sessionId?: string;
  participationToken?: string;
  peer?: boolean;
  student?: Partial<StudentRecord> | null;
};

export type ResumeExamResult =
  | {
      ok: true;
      route:
        | '/(student)/exam'
        | '/(student)/lobby'
        | '/(student)/submitting'
        | '/(student)/completed';
    }
  | { ok: false; reason: string };

type LiveRoomStatus = 'in_progress' | 'lobby_open' | 'ended' | 'idle' | 'unreachable';

async function probeLiveRoomStatus(): Promise<LiveRoomStatus> {
  if (!(await PeerExamClient.isActive())) {
    return 'unreachable';
  }

  const global = await PeerExamClient.getGlobalStatus();
  if (global?.roomStatus === 'ended') return 'ended';
  if (global?.roomStatus === 'in_progress') return 'in_progress';
  if (global?.roomStatus === 'lobby_open') return 'lobby_open';

  // Proctor closed/reset the room: health answers but there is no live session.
  const health = await PeerExamClient.probeHealth();
  if (health === 'idle') return 'idle';
  if (health === 'ended') return 'ended';
  if (health === 'ready') {
    // Health ok but status unknown — treat as unreachable for resume-to-exam.
    return 'unreachable';
  }
  return 'unreachable';
}

type RecoveryHeartbeat = {
  ok: boolean;
  roomStatus?: string;
  sessionNotFound?: boolean;
  remainingSeconds?: number;
  serverTime?: string;
  startedAt?: string;
  endsAt?: string;
  durationMinutes?: number;
};

async function readRecoveryHeartbeat(): Promise<RecoveryHeartbeat | null> {
  if (!(await PeerExamClient.isActive())) return null;
  try {
    const { LobbyRepository } = await import('@/features/lobby/repositories/LobbyRepository');
    return await LobbyRepository.sendHeartbeat();
  } catch {
    return null;
  }
}

async function wipeEndedLocalSession(notice?: string): Promise<void> {
  await stopExamLock().catch(() => undefined);
  if (notice) {
    await appStorage.setItem(STORAGE_KEYS.pendingExamExitNotice, notice).catch(() => undefined);
  }
  await Promise.allSettled([
    ExamProgressStore.clear(),
    ExamLifecycle.clear(),
    clearApplicantExamMaterial(),
  ]);
  useExamStore.getState().reset();
  useStudentStore.getState().reset();
  useLobbyStore.getState().reset();
}

/**
 * Cold-start safety net for Android Lock Task Mode. A process restart resets JS
 * state but can leave the system app pinned; only keep it pinned when the
 * persisted token still matches a complete local participation record.
 */
export async function recoverOrphanedStudentKioskAtStartup(): Promise<void> {
  const finalizedSubmission = await ExamSubmissionStore.load().catch((error) => {
    console.warn('[EXAM RECOVERY] Could not inspect the finalized submission before kiosk recovery:', {
      errorName: error instanceof Error ? error.name : 'StorageError',
    });
    return null;
  });
  if (finalizedSubmission && finalizedSubmission.status !== 'confirmed') {
    await stopExamLock().catch(() => undefined);
    return;
  }

  if (!(await isExamLocked())) return;

  const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
  const progressRaw = await appStorage.getItem(STORAGE_KEYS.studentProgress);
  let progress: StoredStudentProgress | null = null;
  try {
    progress = progressRaw ? (JSON.parse(progressRaw) as StoredStudentProgress) : null;
  } catch {
    progress = null;
  }

  if (
    finalizedSubmission?.status === 'confirmed' &&
    progress?.sessionId === finalizedSubmission.sessionId
  ) {
    await stopExamLock().catch(() => undefined);
    return;
  }

  await ExamLifecycle.hydrate();
  const validParticipation = hasValidLocalStudentParticipation(token, progress);
  if (!validParticipation || ExamLifecycle.peek().status === 'ENDED') {
    await wipeEndedLocalSession(
      validParticipation
        ? 'This examination session has ended. The app has been unlocked.'
        : 'No active examination participation was found. The app has been unlocked.',
    );
  }
}

function studentFromProgress(progress: StoredStudentProgress | null): StudentRecord | null {
  const studentFromProgress = progress?.student;
  if (studentFromProgress?.studentId) {
    return {
      id: String(studentFromProgress.id ?? progress?.applicantId ?? ''),
      studentId: String(studentFromProgress.studentId),
      firstName: '',
      middleName: '',
      lastName: '',
      fullName: String(studentFromProgress.fullName ?? 'Examinee'),
      email: String(studentFromProgress.email ?? ''),
      programId: '',
      programCode: String(studentFromProgress.programCode ?? ''),
      programName: String(studentFromProgress.programName ?? ''),
      sex: 'Male',
      avatarInitials: String(studentFromProgress.avatarInitials ?? 'EX'),
      registration_id:
        studentFromProgress.registration_id ?? progress?.registrationId ?? undefined,
    };
  }
  if (progress?.applicantCode) {
    return {
      id: String(progress.applicantId ?? ''),
      studentId: String(progress.applicantCode),
      firstName: '',
      middleName: '',
      lastName: '',
      fullName: 'Examinee',
      email: '',
      programId: '',
      programCode: '',
      programName: '',
      sex: 'Male',
      avatarInitials: 'EX',
      registration_id: progress.registrationId,
    };
  }
  return null;
}

/**
 * After a browser tab close (or app kill), restore an in-progress exam from
 * local checkpoint + participation token — only when the proctor phone still
 * reports the room as in progress. Ended / closed / idle rooms exit cleanly.
 */
export async function tryResumeStudentExam(): Promise<ResumeExamResult> {
  // 1. Resume unconfirmed finalized submissions straight to submitting screen
  const pendingSubmission = await ExamSubmissionStore.load().catch(() => null);
  if (pendingSubmission) {
    return {
      ok: true,
      route:
        pendingSubmission.status === 'confirmed'
          ? '/(student)/completed'
          : '/(student)/submitting',
    };
  }

  const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
  if (!token) {
    if (await isExamLocked()) {
      await wipeEndedLocalSession('No active examination participation was found. The app has been unlocked.');
    } else {
      await stopExamLock().catch(() => undefined);
    }
    return { ok: false, reason: 'no_token' };
  }

  const progressRaw = await appStorage.getItem(STORAGE_KEYS.studentProgress);
  let progress: StoredStudentProgress | null = null;
  try {
    progress = progressRaw ? (JSON.parse(progressRaw) as StoredStudentProgress) : null;
  } catch {
    progress = null;
  }

  const sessionId = progress?.sessionId ? String(progress.sessionId) : null;
  if (!sessionId) {
    await wipeEndedLocalSession('No active examination session was found. The app has been unlocked.');
    return { ok: false, reason: 'no_session' };
  }

  await ExamLifecycle.hydrate();
  const roomStatus = await probeLiveRoomStatus();

  if (roomStatus === 'ended' || roomStatus === 'idle') {
    await wipeEndedLocalSession('This examination session has ended. The app has been unlocked.');
    return { ok: false, reason: 'ended' };
  }

  if (ExamLifecycle.peek().status === 'ENDED') {
    await wipeEndedLocalSession('This examination session has ended. The app has been unlocked.');
    return { ok: false, reason: 'ended' };
  }

  const student = studentFromProgress(progress);
  if (!student) {
    await wipeEndedLocalSession('The saved examination participation is no longer valid. The app has been unlocked.');
    return { ok: false, reason: 'no_student' };
  }

  useStudentStore.getState().setScannedSession(sessionId, sessionId);
  useStudentStore.getState().setVerifiedStudent(student);
  useStudentStore.getState().setSelectedStudent(student);
  useStudentStore.getState().setAgreedAt(new Date().toISOString());

  // Rehydrate the volatile lobby snapshot when possible. The participation
  // token and student progress are the durable source of truth; this snapshot
  // is only a render cache and must never be required for route access.
  try {
    const { LobbyRepository } = await import('@/features/lobby/repositories/LobbyRepository');
    const liveSnapshot = await LobbyRepository.getLobby(sessionId);
    if (liveSnapshot) useLobbyStore.getState().setSnapshot(liveSnapshot);
  } catch {
    // The lobby screen will keep polling the saved peer target and show its
    // reconnecting state while the proctor phone is restarting.
  }

  const heartbeat = await readRecoveryHeartbeat();
  const heartbeatStatus = heartbeat?.ok ? heartbeat.roomStatus : undefined;
  const effectiveRoomStatus: LiveRoomStatus =
    heartbeat?.sessionNotFound
      ? 'ended'
      : heartbeatStatus === 'in_progress'
        ? 'in_progress'
        : heartbeatStatus === 'lobby_open'
          ? 'lobby_open'
          : roomStatus;

  // Only restore the exam UI when the proctor still has this room running.
  // Never trust stale local ACTIVE alone — that traps disconnected students
  // after the exam has already ended.
  if (effectiveRoomStatus === 'in_progress') {
    await ExamLifecycle.applyFromServer('in_progress', { sessionId });

    const questions = await ExamPreloader.getPreloadedQuestions();
    if (!questions.length) {
      return { ok: true, route: '/(student)/lobby' };
    }

    const checkpoint = await ExamProgressStore.load();
    const duration =
      (await ExamPreloader.getCachedDuration()) ||
      Math.max(1, Math.ceil((checkpoint?.remainingSeconds ?? 5400) / 60));

    const exam = useExamStore.getState();
    exam.setSessionId(sessionId);
    exam.setQuestions(questions);
    const authoritativeDuration = heartbeat?.durationMinutes || duration;
    exam.startExam({
      durationMinutes: authoritativeDuration,
      startedAt: heartbeat?.startedAt || checkpoint?.startedAt || new Date().toISOString(),
      attemptId: token,
      serverTime: new Date().toISOString(),
    });

    if (checkpoint && checkpoint.sessionId === sessionId) {
      const studentKey = String(student.id || student.studentId);
      if (
        !checkpoint.studentId ||
        checkpoint.studentId === studentKey ||
        checkpoint.studentId === student.studentId
      ) {
        exam.restoreProgress({
          answers: checkpoint.answers,
          flags: checkpoint.flags,
          navMode: checkpoint.navMode,
          currentIndex: checkpoint.currentIndex,
          remainingSeconds: checkpoint.remainingSeconds,
          totalDurationSeconds: checkpoint.totalDurationSeconds ?? authoritativeDuration * 60,
          startedAt: heartbeat?.startedAt || checkpoint.startedAt,
          deadline: heartbeat?.endsAt || checkpoint.deadline,
          scheduleClosingTime: checkpoint.scheduleClosingTime,
          attemptId: checkpoint.attemptId || token,
          timeSync: checkpoint.timeSync,
        });
        exam.markAutoSaved(checkpoint.savedAt);
      }
    }
    if (heartbeat?.ok && typeof heartbeat.remainingSeconds === 'number') {
      exam.reconcileWithServerTime({
        serverTime: heartbeat.serverTime || new Date().toISOString(),
        startedAt: heartbeat.startedAt,
        endsAt: heartbeat.endsAt,
        remainingSeconds: heartbeat.remainingSeconds,
        durationMinutes: authoritativeDuration,
      });
    }

    await ExamLifecycle.apply('ACTIVE', { sessionId });
    return { ok: true, route: '/(student)/exam' };
  }

  // lobby_open or unreachable: send to lobby (has Exit) instead of locking into questions.
  if (effectiveRoomStatus === 'lobby_open') {
    await ExamLifecycle.applyFromServer('lobby_open', { sessionId });
  }
  return { ok: true, route: '/(student)/lobby' };
}
