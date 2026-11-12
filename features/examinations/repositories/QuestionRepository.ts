import { STORAGE_KEYS } from '@/shared/constants';
import { apiRequest } from '@/shared/services/api';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import { appStorage } from '@/shared/services/storage';
import type { Question } from '@/shared/types';
import type { ExamNavMode, TimeSyncMetadata } from '@/features/examinations/stores/examStore';

let answerRevisionQueue: Promise<void> = Promise.resolve();

export type PeerRemoteCheckpoint = {
  answers: Record<string, string | null>;
  flags: Record<string, boolean>;
  currentIndex: number;
  navMode: ExamNavMode;
  revision: number;
  savedAt: string | null;
  startedAt: string | null;
  deadline: string | null;
  endsAt: string | null;
};

async function nextAnswerRevision(token: string): Promise<number> {
  let revision = 0;
  answerRevisionQueue = answerRevisionQueue.catch(() => undefined).then(async () => {
    const key = `tcc.student.answer.revision.${token}`;
    const stored = Number(await appStorage.getItem(key));
    revision = Math.max(Number.isSafeInteger(stored) ? stored + 1 : 0, Date.now());
    await appStorage.setItem(key, String(revision));
  });
  await answerRevisionQueue;
  return revision;
}

/**
 * QuestionRepository — load selected questions + submit answers.
 * Online: GET /api/v1/exam/questions , POST /api/v1/exam/submit
 * Offline: cached pack on device
 */
export const QuestionRepository = {
  async getQuestions(sessionId: string): Promise<Question[]> {
    if (__DEV__) console.log("[LOBBY DEBUG] Fetching questions for session:", sessionId);

    // Peer mode logic: Proctor phone is the server
    if (await PeerExamClient.isActive()) {
      // 1. Try Proctor-LAN pre-loaded cache first
      const isIntegrityValid = await ExamPreloader.verifyIntegrity();
      if (isIntegrityValid) {
        const local = await ExamPreloader.getPreloadedQuestions();
        if (local.length > 0) return local;
      }

      // Applicant devices must load the proctor-issued pack, not a leftover admin module.
      if (__DEV__) console.log("[LOBBY DEBUG] Requesting questions from Proctor with resilient retry...");
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (!token) {
        throw new Error('Exam Pack Incomplete');
      }
      let json: { questions: Question[] } | null = null;
      let lastErr: unknown = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (__DEV__) console.log(`[LOBBY DEBUG] Fetch attempt ${attempt}/3...`);
          json = await PeerExamClient.request<{ questions: Question[] }>('/questions', {
            query: { participation_token: token },
            timeoutMs: 25000,
          });
          if (!json?.questions?.length) {
            json = await PeerExamClient.request<{ questions: Question[] }>('/questions', {
              method: 'POST',
              body: { participation_token: token },
              timeoutMs: 25000,
            });
          }
          if (json?.questions?.length) {
            break;
          }
        } catch (err) {
          lastErr = err;
          if (__DEV__) console.warn(`[LOBBY DEBUG] Question fetch attempt ${attempt} failed:`, err);
          if (attempt < 3) {
            await new Promise((res) => setTimeout(res, 1200 * attempt));
          }
        }
      }

      if (!json?.questions?.length) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error('Question Bank Not Found');
      }

      if (__DEV__) console.log("[LOBBY DEBUG] Received questions from Proctor. Count:", json.questions.length);
      return json.questions;
    }

    if (await OfflineStore.isOfflineMode()) {
      return OfflineExamRepository.getQuestions();
    }

    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) throw new Error('Missing participation token. Rejoin the examination.');

    const json = await apiRequest<{ success: boolean; data: Question[]; message?: string }>(
      `/exam/questions?participation_token=${encodeURIComponent(token)}`,
      { auth: false },
    );
    return json.data || [];
  },

  /** Read the proctor's durable checkpoint without replacing the local paper. */
  async getPeerCheckpoint(): Promise<PeerRemoteCheckpoint | null> {
    if (!(await PeerExamClient.isActive())) return null;
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return null;

    const json = await PeerExamClient.request<{
      answers?: Record<string, string | null>;
      flags?: Record<string, boolean>;
      currentIndex?: number;
      navMode?: ExamNavMode;
      checkpoint_version?: number;
      checkpoint_saved_at?: string | null;
      startedAt?: string | null;
      endsAt?: string | null;
      deadline?: string | null;
    }>('/questions', {
      query: { participation_token: token },
      timeoutMs: 8000,
    });

    return {
      answers: json.answers ?? {},
      flags: json.flags ?? {},
      currentIndex: Number.isInteger(json.currentIndex) ? Number(json.currentIndex) : 0,
      navMode: json.navMode === 'one_at_a_time' ? 'one_at_a_time' : 'scroll',
      revision: Number.isSafeInteger(json.checkpoint_version) ? Number(json.checkpoint_version) : 0,
      savedAt: json.checkpoint_saved_at ?? null,
      startedAt: json.startedAt ?? null,
      deadline: json.deadline ?? null,
      endsAt: json.endsAt ?? null,
    };
  },

  async saveProgress(
    answers: Record<string, string | null>,
    checkpoint?: {
      revision?: number;
      flags?: Record<string, boolean>;
      currentIndex?: number;
      navMode?: ExamNavMode;
      startedAt?: string | null;
      deadline?: string | null;
      scheduleClosingTime?: string | null;
      timeSync?: TimeSyncMetadata;
    },
  ): Promise<{ saved: boolean; savedAt: string | null }> {
    if (await PeerExamClient.isActive()) {
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (!token) return { saved: false, savedAt: null };
      const checkpointVersion = Number.isSafeInteger(checkpoint?.revision) && Number(checkpoint?.revision) > 0
        ? Number(checkpoint?.revision)
        : await nextAnswerRevision(token);
      const checkpointSavedAt = new Date().toISOString();
      try {
        await PeerExamClient.request('/answers', {
          method: 'POST',
          body: {
            participation_token: token,
            answers,
            checkpoint_version: checkpointVersion,
            checkpoint_saved_at: checkpointSavedAt,
            flags: checkpoint?.flags,
            current_index: checkpoint?.currentIndex,
            nav_mode: checkpoint?.navMode,
            started_at: checkpoint?.startedAt,
            deadline: checkpoint?.deadline,
            schedule_closing_time: checkpoint?.scheduleClosingTime,
            time_sync: checkpoint?.timeSync,
          },
        });
        return { saved: true, savedAt: checkpointSavedAt };
      } catch {
        return { saved: false, savedAt: null };
      }
    }

    if (await OfflineStore.isOfflineMode()) {
      return { saved: true, savedAt: new Date().toISOString() };
    }
    // ... keep existing below via reading file
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return { saved: false, savedAt: null };
    const checkpointVersion = Number.isSafeInteger(checkpoint?.revision) && Number(checkpoint?.revision) > 0
      ? Number(checkpoint?.revision)
      : await nextAnswerRevision(token);
    const checkpointSavedAt = new Date().toISOString();

    const payload = Object.entries(answers).map(([questionId, selected]) => ({
      exam_question_id: Number(questionId),
      selected_answer: selected,
    }));

    try {
      const json = await apiRequest<{
        success: boolean;
        data?: { saved?: boolean; saved_at?: string };
      }>('/exam/save', {
        method: 'POST',
        auth: false,
        body: {
          participation_token: token,
          answers: payload,
          checkpoint_version: checkpointVersion,
          checkpoint_saved_at: checkpointSavedAt,
          flags: checkpoint?.flags,
          current_index: checkpoint?.currentIndex,
          nav_mode: checkpoint?.navMode,
          started_at: checkpoint?.startedAt,
          deadline: checkpoint?.deadline,
          schedule_closing_time: checkpoint?.scheduleClosingTime,
          time_sync: checkpoint?.timeSync,
        },
      });

      return {
        saved: Boolean(json.data?.saved ?? json.success),
        savedAt: json.data?.saved_at ?? checkpointSavedAt,
      };
    } catch {
      return { saved: false, savedAt: null };
    }
  },

  async submitAnswers(payload: {
    sessionId: string;
    studentId: string;
    answers: Record<string, string | null>;
    idempotencyKey?: string;
    attemptId?: string;
  }): Promise<{
    success: true;
    submittedAt: string;
    destination: 'proctor_peer' | 'cloud' | 'local_offline';
    alreadySubmitted?: boolean;
  }> {
    // Peer mode: the proctor phone grades and holds the result for later sync.
    if (await PeerExamClient.isActive()) {
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (!token) throw new Error('Missing participation token.');

      console.log('[OFFLINE] Submitting answers to Proctor...');
      const response = await PeerExamClient.request<{
        submitted: boolean;
        alreadySubmitted?: boolean;
        items_total?: number;
      }>('/submit', {
        method: 'POST',
        body: {
          participation_token: token,
          answers: payload.answers,
          idempotency_key: payload.idempotencyKey,
          attempt_id: payload.attemptId,
        },
        timeoutMs: 15000,
      });

      if (response?.submitted !== true) {
        throw new Error('The proctor did not confirm that this result was saved. Keep this submission and retry.');
      }

      console.log('[OFFLINE] Submission confirmed. Safe to delete temporary data.');
      return {
        success: true,
        submittedAt: new Date().toISOString(),
        destination: 'proctor_peer',
        alreadySubmitted: Boolean(response?.alreadySubmitted),
      };
    }

    if (await OfflineStore.isOfflineMode()) {
      console.log('[OFFLINE] Saving submission to local SQLite (Offline Mode)...');
      const progressRaw = await appStorage.getItem(STORAGE_KEYS.studentProgress);
      const progress = progressRaw ? JSON.parse(progressRaw) : {};
      const scheduleId =
        progress.scheduleId ||
        (await appStorage.getItem(STORAGE_KEYS.offlineScheduleId)) ||
        String(payload.sessionId).replace(/^offline-/, '');
      const applicantCode = progress.applicantCode || payload.studentId;
      const result = await OfflineExamRepository.submitLocal({
        scheduleId,
        applicantCode,
        answers: payload.answers,
      });
      return {
        success: true,
        submittedAt: result.submitted_at,
        destination: 'local_offline',
      };
    }

    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) throw new Error('Missing participation token.');

    const answers = Object.entries(payload.answers).map(([questionId, selected]) => ({
      exam_question_id: Number(questionId),
      selected_answer: selected,
    }));

    try {
      const json = await apiRequest<{
        success: boolean;
        submittedAt?: string;
        message?: string;
        already_submitted?: boolean;
      }>('/exam/submit', {
        method: 'POST',
        auth: false,
        body: {
          participation_token: token,
          answers,
          idempotency_key: payload.idempotencyKey,
          attempt_id: payload.attemptId,
        },
      });

      return {
        success: true,
        submittedAt: json.submittedAt || new Date().toISOString(),
        destination: 'cloud',
        alreadySubmitted: Boolean(json.already_submitted),
      };
    } catch (err) {
      // A rejection message cannot prove durable receipt. Only an explicit
      // successful API response above is accepted as submission confirmation.
      throw err;
    }
  },
};
