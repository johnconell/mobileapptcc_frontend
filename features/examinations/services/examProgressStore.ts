import * as FileSystem from 'expo-file-system/legacy';
import { STORAGE_KEYS } from '@/shared/constants';
import type { ChoiceKey, ExamAnswer } from '@/shared/types';
import type { TimeSyncMetadata } from '@/features/examinations/services/examTimerCoordinator';
import {
  writeEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  StorageFileNotFoundError,
} from '@/shared/services/encryptedStorage';

export type ExamCheckpoint = {
  sessionId: string;
  studentId: string;
  attemptId?: string;
  answers: Record<string, ExamAnswer>;
  flags?: Record<string, boolean>;
  navMode?: 'scroll' | 'one_at_a_time';
  currentIndex?: number;
  remainingSeconds: number;
  totalDurationSeconds?: number;
  startedAt: string | null;
  deadline?: string | null;
  scheduleClosingTime?: string | null;
  timeSync?: TimeSyncMetadata;
  savedAt: string;
};

const CHECKPOINT_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-exam-checkpoint.enc`;
const WEB_ENC_KEY = `${STORAGE_KEYS.examCheckpoint}.enc`;
const CHECKPOINT_LEGACY_FILE = `${FileSystem.documentDirectory ?? ''}metcc-exam-checkpoint.json`;
const WEB_LEGACY_KEY = STORAGE_KEYS.examCheckpoint;

let saveQueue: Promise<void> = Promise.resolve();

/**
 * Local exam checkpoint storage.
 *
 * Security:
 * - Checkpoints containing answers and time tracking are stored encrypted at rest
 *   using AES-256-GCM authenticated encryption.
 * - Atomic write operations prevent corrupted partial saves during sudden battery loss or app kill.
 * - Logs do not output answers, questions, or student identification.
 */
export const ExamProgressStore = {
  async save(checkpoint: Omit<ExamCheckpoint, 'savedAt'>): Promise<void> {
    const row: ExamCheckpoint = { ...checkpoint, savedAt: new Date().toISOString() };
    const write = async () => {
      await writeEncryptedFile(CHECKPOINT_ENC_FILE, WEB_ENC_KEY, row, {
        meta: { type: 'exam_checkpoint' },
      });
    };

    // Keep rapid answer and flag changes ordered so an older disk write cannot
    // finish after a newer checkpoint and restore stale progress.
    saveQueue = saveQueue.catch(() => undefined).then(write);
    await saveQueue;
  },

  async load(): Promise<ExamCheckpoint | null> {
    try {
      const res = await readEncryptedFile<ExamCheckpoint>(
        CHECKPOINT_ENC_FILE,
        WEB_ENC_KEY,
        {
          legacyPlaintextPath: CHECKPOINT_LEGACY_FILE,
          legacyWebKey: WEB_LEGACY_KEY,
          type: 'exam_checkpoint',
        },
      );
      return res.data ?? null;
    } catch (err) {
      if (err instanceof StorageFileNotFoundError) {
        return null;
      }
      // Never return an empty record silently when existing data cannot be decrypted
      console.error(
        '[ExamProgressStore] Failed to decrypt examination checkpoint:',
        err instanceof Error ? err.name : 'StorageError',
      );
      throw err;
    }
  },

  async clear(): Promise<void> {
    try {
      await saveQueue.catch(() => undefined);
      await deleteEncryptedFile(CHECKPOINT_ENC_FILE, WEB_ENC_KEY, {
        legacyPlaintextPath: CHECKPOINT_LEGACY_FILE,
        legacyWebKey: WEB_LEGACY_KEY,
      });
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
