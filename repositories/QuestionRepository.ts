import { delay } from '@/utils';
import questionsData from '@/mock/data/questions.json';
import type { Question } from '@/types';

/**
 * QuestionRepository — mock question bank.
 * Future Laravel: GET /api/sessions/:id/questions, POST /api/exams/submit
 */
export const QuestionRepository = {
  async getQuestions(sessionId: string): Promise<Question[]> {
    await delay(450);
    void sessionId;
    return questionsData as Question[];
  },

  async submitAnswers(payload: {
    sessionId: string;
    studentId: string;
    answers: Record<string, string | null>;
  }): Promise<{ success: true; submittedAt: string }> {
    await delay(900);
    void payload;
    return { success: true, submittedAt: new Date().toISOString() };
  },
};
