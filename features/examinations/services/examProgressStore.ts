import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import type { ChoiceKey, ExamAnswer } from '@/shared/types';

export type ExamCheckpoint = {
  sessionId: string;
  studentId: string;
  answers: Record<string, ExamAnswer>;
  flags?: Record<string, boolean>;
  navMode?: 'scroll' | 'one_at_a_time';
  remainingSeconds: number;
  startedAt: string | null;
  savedAt: string;
};

const CHECKPOINT_FILE = `${FileSystem.documentDirectory ?? ''}metcc-exam-checkpoint.json`;
const WEB_KEY = STORAGE_KEYS.examCheckpoint;
let saveQueue: Promise<void> = Promise.resolve();

/**
 * Local exam checkpoint (FileSystem / web storage — not SecureStore).
 * SecureStore has a ~2048 byte limit and flooded LogBox during exams.
 */
export const ExamProgressStore = {
  async save(checkpoint: Omit<ExamCheckpoint, 'savedAt'>): Promise<void> {
    const row: ExamCheckpoint = { ...checkpoint, savedAt: new Date().toISOString() };
    const write = async () => {
      const text = JSON.stringify(row);
      if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
        await appStorage.setItem(WEB_KEY, text);
        return;
      }
      await FileSystem.writeAsStringAsync(CHECKPOINT_FILE, text);
    };

    // Keep rapid answer and flag changes ordered so an older disk write cannot
    // finish after a newer checkpoint and restore stale progress.
    saveQueue = saveQueue.catch(() => undefined).then(write);
    await saveQueue;
  },

  async load(): Promise<ExamCheckpoint | null> {
    try {
      if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
        const raw = await appStorage.getItem(WEB_KEY);
        return raw ? (JSON.parse(raw) as ExamCheckpoint) : null;
      }
      const info = await FileSystem.getInfoAsync(CHECKPOINT_FILE);
      if (!info.exists) return null;
      const raw = await FileSystem.readAsStringAsync(CHECKPOINT_FILE);
      return JSON.parse(raw) as ExamCheckpoint;
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    try {
      await saveQueue.catch(() => undefined);
      if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
        await appStorage.deleteItem(WEB_KEY);
        return;
      }
      const info = await FileSystem.getInfoAsync(CHECKPOINT_FILE);
      if (info.exists) await FileSystem.deleteAsync(CHECKPOINT_FILE, { idempotent: true });
    } catch {
      // ignore
    }
  },

  answersPayload(answers: Record<string, ExamAnswer>): Record<string, ChoiceKey | null> {
    return Object.fromEntries(
      Object.values(answers).map((a) => [a.questionId, a.selectedAnswer]),
    );
  },
};
