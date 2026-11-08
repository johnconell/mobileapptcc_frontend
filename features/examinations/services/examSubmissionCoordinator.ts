import { STORAGE_KEYS } from '@/shared/constants';
import { appStorage } from '@/shared/services/storage';
import {
  ExamSubmissionStore,
  type FinalizedSubmission,
  type SubmissionDeliveryStatus,
  type SubmissionDestination,
  type SubmissionErrorRecord,
} from './examSubmissionStore';
import { QuestionRepository } from '../repositories/QuestionRepository';
import { useExamStore } from '../stores/examStore';
import { ExamProgressStore } from './examProgressStore';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';

export const SUBMISSION_RETRY_CONFIG = {
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffFactor: 2,
  jitterMaxMs: 1000,
};

export type ClassifiedError = {
  isTransient: boolean;
  statusCode?: number;
  message: string;
  isAlreadySubmitted: boolean;
};

/**
 * Classifies submission delivery errors into transient vs non-transient,
 * preserving specific HTTP status codes and recognizing dropped-response successes.
 */
export function classifySubmissionError(error: unknown): ClassifiedError {
  const errObj = error as Record<string, any> | null;
  const rawMsg = String(errObj?.message || error || '');
  const lowerMsg = rawMsg.toLowerCase();

  const statusCode =
    typeof errObj?.status === 'number'
      ? errObj.status
      : typeof errObj?.statusCode === 'number'
        ? errObj.statusCode
        : undefined;

  // A message alone is not proof that the server durably recorded this result.
  // Replays are confirmed by an explicit successful response from the proctor/API.
  if (errObj?.verifiedSubmissionReceipt === true) {
    return {
      isTransient: false,
      statusCode: statusCode ?? 200,
      message: 'Examination submission already confirmed by the server.',
      isAlreadySubmitted: true,
    };
  }

  // Case 2: Explicit HTTP Client Errors (Non-Transient)
  // Re-trying these endlessly is futile and traps the student.
  if (statusCode === 401) {
    return {
      isTransient: false,
      statusCode: 401,
      message: 'Authorization expired or participation token invalid.',
      isAlreadySubmitted: false,
    };
  }
  if (statusCode === 403) {
    return {
      isTransient: false,
      statusCode: 403,
      message: rawMsg || 'Submission rejected by proctor or wrong room assignment.',
      isAlreadySubmitted: false,
    };
  }
  if (statusCode === 404) {
    return {
      isTransient: false,
      statusCode: 404,
      message: 'Examination session not found on server.',
      isAlreadySubmitted: false,
    };
  }
  if (statusCode === 409) {
    return {
      isTransient: false,
      statusCode: 409,
      message: rawMsg || 'A different result is already recorded. Ask your proctor to verify it.',
      isAlreadySubmitted: false,
    };
  }
  if (statusCode === 422) {
    return {
      isTransient: false,
      statusCode: 422,
      message: rawMsg || 'Submission payload validation failed.',
      isAlreadySubmitted: false,
    };
  }
  if (statusCode === 400) {
    return {
      isTransient: false,
      statusCode: 400,
      message: rawMsg || 'Malformed submission request.',
      isAlreadySubmitted: false,
    };
  }

  // Case 3: Transient Network & Server Errors
  if (statusCode === 0 || statusCode === 408 || (statusCode && statusCode >= 500)) {
    return {
      isTransient: true,
      statusCode,
      message:
        statusCode && statusCode >= 500
          ? `Examination server temporarily unavailable (${statusCode}).`
          : 'Network connection lost or request timed out.',
      isAlreadySubmitted: false,
    };
  }

  // Network transport messages without explicit status code
  if (
    lowerMsg.includes('network') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('abort') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('connect') ||
    lowerMsg.includes('wifi') ||
    lowerMsg.includes('wi-fi') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('offline')
  ) {
    return {
      isTransient: true,
      statusCode: 0,
      message: 'Network connection lost or proctor Wi-Fi unreachable.',
      isAlreadySubmitted: false,
    };
  }

  // Unknown error: treat as transient with bounded attempts
  return {
    isTransient: true,
    statusCode,
    message: rawMsg || 'Unable to confirm submission delivery.',
    isAlreadySubmitted: false,
  };
}

/**
 * Calculates exponential backoff delay with random jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  config = SUBMISSION_RETRY_CONFIG,
): number {
  const attemptIndex = Math.max(0, attempt - 1);
  const exponential = config.initialDelayMs * Math.pow(config.backoffFactor, attemptIndex);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitter = Math.floor(Math.random() * config.jitterMaxMs);
  return capped + jitter;
}

/**
 * Generates a deterministic alphanumeric proof code for manual proctor verification
 * if the candidate is completely cut off from the local Wi-Fi.
 */
export function generateSubmissionDigest(submission: FinalizedSubmission): string {
  const sortedAnswers = Object.keys(submission.answers)
    .sort()
    .map((k) => `${k}:${submission.answers[k] ?? ''}`)
    .join('|');
  const source = `${submission.sessionId}:${submission.applicantCode}:${submission.attemptId}:${submission.createdAt}:${sortedAnswers}`;

  // Lightweight 32-bit FNV-1a hash turned into a 12-char hex digest
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch << 1), 0x01000193);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const combined = (hex1 + hex2).slice(0, 12);
  return `${combined.slice(0, 4)}-${combined.slice(4, 8)}-${combined.slice(8, 12)}`;
}

let activeRetryTimer: ReturnType<typeof setTimeout> | null = null;
let isDeliveryInFlight = false;
const listeners = new Set<(submission: FinalizedSubmission | null) => void>();

function notifyListeners(sub: FinalizedSubmission | null) {
  listeners.forEach((fn) => {
    try {
      fn(sub);
    } catch {
      // safe broadcast
    }
  });
}

/**
 * Executes post-confirmation teardown:
 * - Updates stores
 * - Clears in-progress exam checkpoint
 * - Writes completion marker
 */
async function performConfirmedCleanup(submission: FinalizedSubmission): Promise<void> {
  useExamStore.getState().markSubmitted(submission.finalReason);

  await ExamProgressStore.clear().catch((e) =>
    console.warn('[SUBMISSION] Failed to clear in-progress checkpoint:', e),
  );

  await clearApplicantExamMaterial().catch((e) =>
    console.warn('[SUBMISSION] Failed to clear exam material:', e),
  );

  try {
    const sid = String(submission.sessionId).replace(/^offline-/, '').split('-')[0];
    const appCode = submission.applicantCode || submission.studentId;
    if (appCode && sid) {
      await appStorage.setItem(`tcc.student.completed.${sid}.${appCode}`, '1');
    }
  } catch {
    // best-effort completion marker
  }
}

export const ExamSubmissionCoordinator = {
  subscribe(listener: (submission: FinalizedSubmission | null) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  cancelScheduledRetry(): void {
    if (activeRetryTimer) {
      clearTimeout(activeRetryTimer);
      activeRetryTimer = null;
    }
  },

  async getActiveSubmission(): Promise<FinalizedSubmission | null> {
    return ExamSubmissionStore.load();
  },

  async confirmFromPeerAcknowledgement(
    submittedAt: string,
  ): Promise<FinalizedSubmission | null> {
    const confirmedAt = new Date(submittedAt);
    if (!Number.isFinite(confirmedAt.getTime())) {
      throw new Error('The proctor returned an invalid result confirmation timestamp.');
    }

    const current = await ExamSubmissionStore.load();
    if (!current || current.status === 'confirmed') return current;

    current.status = 'confirmed';
    current.receipt = {
      confirmedAt: confirmedAt.toISOString(),
      destination: 'proctor_peer',
      alreadySubmitted: true,
      confirmationCode: generateSubmissionDigest(current),
    };
    current.lastError = null;
    current.nextRetryAt = null;
    await ExamSubmissionStore.save(current);
    await performConfirmedCleanup(current);
    notifyListeners(current);
    return current;
  },

  /**
   * Executes a single delivery attempt of the finalized submission.
   * Thread-safe against rapid repeated taps (isDeliveryInFlight guard).
   */
  async deliver(options?: { isManualRetry?: boolean }): Promise<FinalizedSubmission | null> {
    const current = await ExamSubmissionStore.load();
    if (!current) return null;

    if (current.status === 'confirmed') {
      return current;
    }

    if (isDeliveryInFlight) {
      return current;
    }

    this.cancelScheduledRetry();
    isDeliveryInFlight = true;

    // If manual retry, reset attempt counter if max attempts had been hit
    if (options?.isManualRetry) {
      current.status = 'pending';
      current.lastError = null;
      current.nextRetryAt = null;
      if (current.attemptCount >= current.maxAttempts) {
        current.attemptCount = 0;
      }
      await ExamSubmissionStore.save(current);
      notifyListeners(current);
    }

    try {
      const result = await QuestionRepository.submitAnswers({
        sessionId: current.sessionId,
        studentId: current.studentId,
        answers: current.answers,
        idempotencyKey: current.idempotencyKey,
        attemptId: current.attemptId,
      });

      const peerAcknowledgement = await ExamSubmissionStore.load();
      if (peerAcknowledgement?.status === 'confirmed') return peerAcknowledgement;

      // Delivery confirmed!
      current.status = 'confirmed';
      current.receipt = {
        confirmedAt: result.submittedAt,
        destination: result.destination,
        alreadySubmitted: result.alreadySubmitted,
        confirmationCode: generateSubmissionDigest(current),
      };
      current.lastError = null;
      current.nextRetryAt = null;

      await ExamSubmissionStore.save(current);
      await performConfirmedCleanup(current);
      notifyListeners(current);
      return current;
    } catch (err: unknown) {
      const peerAcknowledgement = await ExamSubmissionStore.load();
      if (peerAcknowledgement?.status === 'confirmed') return peerAcknowledgement;

      const classified = classifySubmissionError(err);

      // Case: Server had already committed the submission earlier!
      if (classified.isAlreadySubmitted) {
        current.status = 'confirmed';
        current.receipt = {
          confirmedAt: new Date().toISOString(),
          destination: current.destination,
          alreadySubmitted: true,
          confirmationCode: generateSubmissionDigest(current),
        };
        current.lastError = null;
        current.nextRetryAt = null;

        await ExamSubmissionStore.save(current);
        await performConfirmedCleanup(current);
        notifyListeners(current);
        return current;
      }

      const errorRecord: SubmissionErrorRecord = {
        message: classified.message,
        statusCode: classified.statusCode,
        isTransient: classified.isTransient,
        timestamp: new Date().toISOString(),
      };

      current.lastError = errorRecord;

      // Case: Terminal Non-Transient Failure (401, 403, 404, 422)
      // Do NOT retry automatically. Switch to action_required.
      if (!classified.isTransient) {
        current.status = 'action_required';
        current.nextRetryAt = null;
        await ExamSubmissionStore.save(current);
        notifyListeners(current);
        return current;
      }

      // Case: Transient failure (Network / Server 5xx)
      current.attemptCount += 1;
      if (current.attemptCount >= current.maxAttempts) {
        // Bounded limit reached without response
        current.status = 'action_required';
        current.nextRetryAt = null;
        current.lastError = {
          ...errorRecord,
          message: `Delivery attempt ${current.attemptCount} of ${current.maxAttempts} failed. Please verify Wi-Fi connection or ask your proctor.`,
        };
        await ExamSubmissionStore.save(current);
        notifyListeners(current);
        return current;
      }

      // Schedule next backoff retry
      current.status = 'retrying';
      const delayMs = calculateBackoffDelay(current.attemptCount);
      current.nextRetryAt = Date.now() + delayMs;

      await ExamSubmissionStore.save(current);
      notifyListeners(current);

      activeRetryTimer = setTimeout(() => {
        void this.deliver();
      }, delayMs);

      return current;
    } finally {
      isDeliveryInFlight = false;
    }
  },
};
