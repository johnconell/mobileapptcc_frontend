import { STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import type { StudentRecord } from '@/shared/types';
import { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';

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
  | { ok: true; route: '/(student)/exam' | '/(student)/lobby' }
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

async function wipeEndedLocalSession(): Promise<void> {
  await ExamProgressStore.clear();
  await ExamLifecycle.clear();
  await clearApplicantExamMaterial();
  useExamStore.getState().reset();
  useStudentStore.getState().reset();
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
  const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
  if (!token) {
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
    await wipeEndedLocalSession();
    return { ok: false, reason: 'no_session' };
  }

  await ExamLifecycle.hydrate();
  const roomStatus = await probeLiveRoomStatus();

  if (roomStatus === 'ended' || roomStatus === 'idle') {
    await wipeEndedLocalSession();
    return { ok: false, reason: 'ended' };
  }

  if (ExamLifecycle.peek().status === 'ENDED') {
    await wipeEndedLocalSession();
    return { ok: false, reason: 'ended' };
  }

  const student = studentFromProgress(progress);
  if (!student) {
    await wipeEndedLocalSession();
    return { ok: false, reason: 'no_student' };
  }

  useStudentStore.getState().setScannedSession(sessionId, sessionId);
  useStudentStore.getState().setVerifiedStudent(student);
  useStudentStore.getState().setSelectedStudent(student);

  // Only restore the exam UI when the proctor still has this room running.
  // Never trust stale local ACTIVE alone — that traps disconnected students
  // after the exam has already ended.
  if (roomStatus === 'in_progress') {
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
    exam.startExam(duration);

    if (checkpoint && checkpoint.sessionId === sessionId) {
      const studentKey = String(student.id || student.studentId);
      if (
        !checkpoint.studentId ||
        checkpoint.studentId === studentKey ||
        checkpoint.studentId === student.studentId
      ) {
        exam.restoreProgress({
          answers: checkpoint.answers,
          remainingSeconds: checkpoint.remainingSeconds,
          startedAt: checkpoint.startedAt,
        });
        exam.markAutoSaved(checkpoint.savedAt);
      }
    }

    await ExamLifecycle.apply('ACTIVE', { sessionId });
    return { ok: true, route: '/(student)/exam' };
  }

  // lobby_open or unreachable: send to lobby (has Exit) instead of locking into questions.
  if (roomStatus === 'lobby_open') {
    await ExamLifecycle.applyFromServer('lobby_open', { sessionId });
  }
  return { ok: true, route: '/(student)/lobby' };
}
