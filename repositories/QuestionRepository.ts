import { STORAGE_KEYS } from '@/constants';
import { apiRequest } from '@/services/api';
import { appStorage } from '@/services/storage';
import type { Question } from '@/types';

/**
 * QuestionRepository — load selected questions + submit answers.
 * GET /api/v1/exam/questions , POST /api/v1/exam/submit
 */
export const QuestionRepository = {
  async getQuestions(sessionId: string): Promise<Question[]> {
    void sessionId;
    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) throw new Error('Missing participation token. Rejoin the examination.');

    const json = await apiRequest<{ success: boolean; data: Question[]; message?: string }>(
      `/exam/questions?participation_token=${encodeURIComponent(token)}`,
      { auth: false },
    );
    return json.data || [];
  },

  async submitAnswers(payload: {
    sessionId: string;
    studentId: string;
    answers: Record<string, string | null>;
  }): Promise<{ success: true; submittedAt: string }> {
    void payload.sessionId;
    void payload.studentId;

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
