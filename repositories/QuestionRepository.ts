import { STORAGE_KEYS } from '@/constants';
import { apiRequest } from '@/services/api';
import { OfflineExamRepository } from '@/services/offlineExamRepository';
import { OfflineStore } from '@/services/offlineStore';
import { appStorage } from '@/services/storage';
import type { Question } from '@/types';

/**
 * QuestionRepository — load selected questions + submit answers.
 * Online: GET /api/v1/exam/questions , POST /api/v1/exam/submit
 * Offline: cached pack on device
 */
export const QuestionRepository = {
  async getQuestions(sessionId: string): Promise<Question[]> {
    void sessionId;
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

  async saveProgress(answers: Record<string, string | null>): Promise<{ saved: boolean; savedAt: string | null }> {
    if (await OfflineStore.isOfflineMode()) {
      return { saved: true, savedAt: new Date().toISOString() };
    }
    // ... keep existing below via reading file
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) return { saved: false, savedAt: null };

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
        },
      });

      return {
        saved: Boolean(json.data?.saved ?? json.success),
        savedAt: json.data?.saved_at ?? new Date().toISOString(),
      };
    } catch {
      return { saved: false, savedAt: null };
    }
  },

  async submitAnswers(payload: {
    sessionId: string;
    studentId: string;
    answers: Record<string, string | null>;
  }): Promise<{ success: true; submittedAt: string }> {
    if (await OfflineStore.isOfflineMode()) {
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
      return { success: true, submittedAt: result.submitted_at };
    }

    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) throw new Error('Missing participation token.');

    const answers = Object.entries(payload.answers).map(([questionId, selected]) => ({
      exam_question_id: Number(questionId),
      selected_answer: selected,
    }));

    const json = await apiRequest<{
      success: boolean;
      submittedAt?: string;
      message?: string;
    }>('/exam/submit', {
      method: 'POST',
      auth: false,
      body: {
        participation_token: token,
        answers,
      },
    });

    return {
      success: true,
      submittedAt: json.submittedAt || new Date().toISOString(),
    };
  },
};
