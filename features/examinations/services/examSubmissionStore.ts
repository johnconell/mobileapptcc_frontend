import * as FileSystem from 'expo-file-system/legacy';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  writeEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  StorageFileNotFoundError,
} from '@/shared/services/encryptedStorage';

export type SubmissionDeliveryStatus =
  | 'pending'
  | 'retrying'
  | 'confirmed'
  | 'action_required';

export type SubmissionDestination = 'proctor_peer' | 'cloud' | 'local_offline';

export type SubmissionReceipt = {
  confirmedAt: string;
  destination: SubmissionDestination;
  alreadySubmitted?: boolean;
  confirmationCode?: string;
};

export type SubmissionErrorRecord = {
  message: string;
  statusCode?: number;
  isTransient: boolean;
  timestamp: string;
};

export interface FinalizedSubmission {
  submissionId: string;
  attemptId: string;
  idempotencyKey: string;
  sessionId: string;
  studentId: string;
  applicantCode: string;
  studentName?: string;
  answers: Record<string, string | null>;
  finalReason: 'submitted' | 'time_expired' | 'proctor_terminated';
  status: SubmissionDeliveryStatus;
  destination: SubmissionDestination;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  nextRetryAt?: number | null;
  lastError?: SubmissionErrorRecord | null;
  receipt?: SubmissionReceipt | null;
}

const SUBMISSION_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-finalized-submission.enc`;
const WEB_ENC_KEY = `${STORAGE_KEYS.finalizedSubmission}.enc`;

let queue: Promise<any> = Promise.resolve();

/**
 * Durable, encrypted store for finalized examination submissions.
 *
 * Guaranteed:
 * - Persisted with AES-256-GCM before network transmission is attempted.
 * - Remains intact across process crashes, restarts, and reboots until confirmed.
 * - Queue prevents interleaved write corruption.
 */
export const ExamSubmissionStore = {
  async save(submission: FinalizedSubmission): Promise<void> {
    const row: FinalizedSubmission = {
      ...submission,
      updatedAt: new Date().toISOString(),
    };
    const task = async () => {
      await writeEncryptedFile(SUBMISSION_ENC_FILE, WEB_ENC_KEY, row, {
        meta: { type: 'finalized_submission' },
      });
    };
    queue = queue.catch(() => undefined).then(task);
    await queue;
  },

  async load(): Promise<FinalizedSubmission | null> {
    try {
      const envelope = await readEncryptedFile<FinalizedSubmission>(
        SUBMISSION_ENC_FILE,
        WEB_ENC_KEY,
      );
      return envelope.data ?? null;
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        return null;
      }
      throw error;
    }
  },

  async update(
    updater: (prev: FinalizedSubmission) => FinalizedSubmission,
  ): Promise<FinalizedSubmission | null> {
    const task = async () => {
      const current = await this.load();
      if (!current) return null;
      const updated = updater(current);
      updated.updatedAt = new Date().toISOString();
      await writeEncryptedFile(SUBMISSION_ENC_FILE, WEB_ENC_KEY, updated, {
        meta: { type: 'finalized_submission' },
      });
      return updated;
    };
    queue = queue.catch(() => undefined).then(task);
    return queue;
  },

  async clear(): Promise<void> {
    const task = async () => {
      await deleteEncryptedFile(SUBMISSION_ENC_FILE, WEB_ENC_KEY);
    };
    queue = queue.catch(() => undefined).then(task);
    await queue;
  },
};
