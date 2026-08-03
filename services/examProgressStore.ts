import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';
import type { ChoiceKey, ExamAnswer } from '@/types';

export type ExamCheckpoint = {
  sessionId: string;
  studentId: string;
  answers: Record<string, ExamAnswer>;
  remainingSeconds: number;
  startedAt: string | null;
  savedAt: string;
};

const CHECKPOINT_KEY = STORAGE_KEYS.examCheckpoint;

/**
 * Local exam checkpoint so power-off / restart can restore answers after reconnect.
 */
export const ExamProgressStore = {
  async save(checkpoint: Omit<ExamCheckpoint, 'savedAt'>): Promise<void> {
    const row: ExamCheckpoint = {
      ...checkpoint,
      savedAt: new Date().toISOString(),
    };
    await appStorage.setItem(CHECKPOINT_KEY, JSON.stringify(row));
  },

  async load(): Promise<ExamCheckpoint | null> {
    const raw = await appStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ExamCheckpoint;
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    await appStorage.deleteItem(CHECKPOINT_KEY);
  },

  answersPayload(answers: Record<string, ExamAnswer>): Record<string, ChoiceKey | null> {
    return Object.fromEntries(
      Object.values(answers).map((a) => [a.questionId, a.selectedAnswer]),
    );
  },
};
