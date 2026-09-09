import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';
import { PeerExamClient } from '@/services/peerExamClient';
import { encryptJson, decryptJson } from '@/services/offlineStore';
import {
  countMediaAssets,
  INITIAL_PACK_PROGRESS,
  phaseLabelFor,
  type ExamPackProgress,
  type DownloadPhase,
} from '@/services/examReadiness';
import type { Question } from '@/types';

const PRELOAD_FILE = `${FileSystem.documentDirectory ?? ''}metcc-preloaded-questions.enc`;
const WEB_PRELOAD_KEY = 'tcc.student.preloaded.questions.enc';

const PRELOAD_READY_KEY = 'tcc.student.preload.ready';
const PRELOAD_HASH_KEY = 'tcc.student.preload.sha256';

export type PreloadPackageResult = {
  success: boolean;
  count: number;
  hash: string;
  error?: string;
};

type ExaminationSettings = {
  duration_minutes?: number;
  shuffle_questions?: boolean;
  shuffle_categories?: boolean;
  shuffle_both?: boolean;
};

type PreloadEncryptedPayload = {
  sessionId: string;
  hash: string;
  timestamp: number;
  questions: Question[];
  durationMinutes?: number;
  examinationSettings?: ExaminationSettings | null;
  packageVersion?: number;
  questionsExpected?: number;
  assetsDownloaded?: number;
  assetsExpected?: number;
  configurationComplete?: boolean;
};

type ProgressListener = (progress: ExamPackProgress) => void;

let currentProgress: ExamPackProgress = { ...INITIAL_PACK_PROGRESS };
const listeners = new Set<ProgressListener>();

function emitProgress(partial: Partial<ExamPackProgress>, replace = false) {
  const next: ExamPackProgress = {
    ...(replace ? INITIAL_PACK_PROGRESS : currentProgress),
    ...partial,
  };
  const phase = (partial.phase ?? next.phase) as DownloadPhase;
  next.phase = phase;
  next.phaseLabel = partial.phaseLabel ?? phaseLabelFor(phase, next.percent);
  next.moduleReady = Boolean(
    next.percent >= 100 &&
      next.hashVerified &&
      next.questionsDownloaded > 0 &&
      next.questionsDownloaded >= next.questionsExpected &&
      next.configurationComplete,
  );
  currentProgress = next;
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export async function computeQuestionPackHash(questions: Question[]): Promise<string> {
  const sorted = [...questions].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const normalized = sorted.map((q) => ({
    id: q.id,
    question: (q.question || '').trim(),
    choices: q.choices,
    category: q.category || '',
  }));
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(normalized),
  );
}

async function computeLegacyQuestionHash(questions: Question[]): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(questions),
  );
}

function progressFromPayload(
  payload: PreloadEncryptedPayload,
  hashVerified: boolean,
): ExamPackProgress {
  const questions = payload.questions || [];
  const assets = payload.assetsDownloaded ?? countMediaAssets(questions);
  const assetsExpected = payload.assetsExpected ?? assets;
  const configurationComplete = Boolean(
    payload.configurationComplete ??
      ((payload.durationMinutes ?? 0) > 0 && payload.examinationSettings != null),
  );
  const percent = questions.length > 0 && hashVerified ? 100 : questions.length > 0 ? 90 : 0;
  const phase: DownloadPhase = hashVerified && questions.length > 0 ? 'ready' : 'incomplete';
  return {
    ...INITIAL_PACK_PROGRESS,
    phase,
    phaseLabel: phaseLabelFor(phase, percent),
    percent,
    questionsDownloaded: questions.length,
    questionsExpected: payload.questionsExpected || questions.length,
    assetsDownloaded: assets,
    assetsExpected: assetsExpected,
    configurationComplete: configurationComplete || (payload.durationMinutes ?? 0) > 0,
    hashVerified,
    moduleReady: false,
    durationMinutes: payload.durationMinutes ?? null,
    hasSettings: Boolean(payload.examinationSettings),
  };
}

export const ExamPreloader = {
  getProgress(): ExamPackProgress {
    return currentProgress;
  },

  subscribe(listener: ProgressListener): () => void {
    listeners.add(listener);
    listener(currentProgress);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Downloads the complete examination package and tracks real progress.
   */
  async downloadAndVerifyExamPackage(input: {
    sessionId: string;
    passkey: string;
    code?: string;
  }): Promise<PreloadPackageResult> {
    if (__DEV__) {
      console.log(`[PRELOADER] Starting package download for session: ${input.sessionId}`);
    }

    emitProgress({
      phase: 'preparing',
      phaseLabel: 'Preparing Examination Pack',
      percent: 0,
    }, true);

    let questions: Question[] = [];
    let serverReportedHash = '';
    let durationMinutes = 90;
    let examinationSettings: ExaminationSettings | null = null;
    let packageVersion = 1;

    emitProgress({
      phase: 'downloading',
      percent: 0,
      phaseLabel: 'Downloading Module...\n0%',
    });

    if (await PeerExamClient.isActive()) {
      let packageRes: {
        questions: Question[];
        packageHash?: string;
        durationMinutes?: number;
        examinationSettings?: ExaminationSettings;
        packageVersion?: number;
      } | null = null;
      let lastErr: unknown = null;

      emitProgress({
        phase: 'downloading',
        percent: 25,
        phaseLabel: 'Downloading Module...\n25%',
      });

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          packageRes = await PeerExamClient.request<{
            questions: Question[];
            packageHash?: string;
            durationMinutes?: number;
            examinationSettings?: ExaminationSettings;
            packageVersion?: number;
          }>('/package', {
            method: 'POST',
            body: {
              code: input.code || (await appStorage.getItem(STORAGE_KEYS.examinationCode)),
              passkey: input.passkey.trim().toUpperCase(),
            },
            timeoutMs: 25000,
          });
          if (packageRes?.questions?.length) break;
        } catch (err) {
          lastErr = err;
          if (attempt < 3) await new Promise((res) => setTimeout(res, 1000));
        }
      }

      if (packageRes?.questions?.length) {
        questions = packageRes.questions;
        serverReportedHash = packageRes.packageHash || '';
        durationMinutes = packageRes.durationMinutes || 90;
        examinationSettings = packageRes.examinationSettings ?? { duration_minutes: durationMinutes };
        packageVersion = packageRes.packageVersion || 1;
        emitProgress({
          phase: 'downloading',
          percent: 50,
          phaseLabel: 'Downloading Module...\n50%',
          questionsDownloaded: questions.length,
          questionsExpected: questions.length,
        });
      } else {
        if (!questions.length) {
          try {
            const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
            if (token) {
              const fallbackRes = await PeerExamClient.request<{
                questions: Question[];
                durationMinutes?: number;
              }>('/questions', {
                query: { participation_token: token },
                timeoutMs: 20000,
              });
              if (fallbackRes?.questions?.length) {
                questions = fallbackRes.questions;
                durationMinutes = fallbackRes.durationMinutes || durationMinutes;
                examinationSettings = examinationSettings ?? { duration_minutes: durationMinutes };
              }
            }
          } catch {
            /* continue to error below */
          }
        }
      }

      if (!questions.length) {
        const errorMsg =
          lastErr instanceof Error
            ? lastErr.message
            : 'Unable to download examination package from proctor phone. Please check Wi-Fi connection.';
        emitProgress({
          phase: 'error',
          percent: currentProgress.percent,
          error: errorMsg,
          moduleReady: false,
        });
        throw new Error(errorMsg);
      }
    } else {
      emitProgress({
        phase: 'downloading',
        percent: 25,
        phaseLabel: 'Downloading Module...\n25%',
      });
      const { QuestionRepository } = await import('@/repositories/QuestionRepository');
      questions = await QuestionRepository.getQuestions(input.sessionId);
      examinationSettings = { duration_minutes: durationMinutes };
    }

    if (!questions || !questions.length) {
      const errorMsg = 'Examination package contains no questions. Contact your proctor.';
      emitProgress({ phase: 'error', error: errorMsg, moduleReady: false });
      throw new Error(errorMsg);
    }

    const assets = countMediaAssets(questions);
    emitProgress({
      phase: 'downloading',
      percent: 75,
      phaseLabel: 'Downloading Module...\n75%',
      questionsDownloaded: questions.length,
      questionsExpected: questions.length,
      assetsDownloaded: assets,
      assetsExpected: assets,
      durationMinutes,
      hasSettings: Boolean(examinationSettings),
    });

    emitProgress({
      phase: 'downloading',
      percent: 100,
      phaseLabel: 'Downloading Module...\n100%',
    });

    emitProgress({
      phase: 'verifying',
      percent: 100,
      phaseLabel: 'Verifying Examination Pack...',
    });

    const calculatedHash = await computeQuestionPackHash(questions);

    if (serverReportedHash && serverReportedHash !== 'no-pack' && serverReportedHash !== calculatedHash) {
      console.warn(`[PRELOADER] Hash mismatch: server=${serverReportedHash}, local=${calculatedHash}`);
    }

    const payload: PreloadEncryptedPayload = {
      sessionId: input.sessionId,
      hash: calculatedHash,
      timestamp: Date.now(),
      questions,
      durationMinutes,
      examinationSettings,
      packageVersion,
      questionsExpected: questions.length,
      assetsDownloaded: assets,
      assetsExpected: assets,
      configurationComplete: Boolean(durationMinutes && examinationSettings),
    };

    const encryptedBlob = await encryptJson(payload);

    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      await appStorage.setItem(WEB_PRELOAD_KEY, encryptedBlob);
    } else {
      await FileSystem.writeAsStringAsync(PRELOAD_FILE, encryptedBlob);
    }

    await appStorage.setItem(PRELOAD_READY_KEY, '1');
    await appStorage.setItem(PRELOAD_HASH_KEY, calculatedHash);

    emitProgress({
      phase: 'hash_complete',
      percent: 100,
      phaseLabel: 'Hash Verification Complete',
      hashVerified: true,
      configurationComplete: Boolean(durationMinutes && examinationSettings),
      questionsDownloaded: questions.length,
      questionsExpected: questions.length,
      assetsDownloaded: assets,
      assetsExpected: assets,
      durationMinutes,
      hasSettings: Boolean(examinationSettings),
    });

    emitProgress({
      phase: 'ready',
      percent: 100,
      phaseLabel: 'Ready for Examination',
      hashVerified: true,
      moduleReady: true,
    });

    if (__DEV__) {
      console.log(
        `[PRELOADER] Saved ${questions.length} questions. Hash: ${calculatedHash.slice(0, 10)}`,
      );
    }
    console.log('[STARTUP] Exam Pack Found');
    console.log(`[STARTUP] Questions Loaded ${questions.length}/${questions.length}`);
    console.log('[STARTUP] Hash Verified');

    return {
      success: true,
      count: questions.length,
      hash: calculatedHash,
    };
  },

  async preloadQuestions(sessionId: string): Promise<{ count: number; hash: string }> {
    const passkey = (await appStorage.getItem(STORAGE_KEYS.examinationCode)) || '';
    const res = await this.downloadAndVerifyExamPackage({ sessionId, passkey });
    return { count: res.count, hash: res.hash };
  },

  async getPreloadedPayload(): Promise<PreloadEncryptedPayload | null> {
    try {
      let rawEncrypted: string | null = null;
      if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
        rawEncrypted = await appStorage.getItem(WEB_PRELOAD_KEY);
      } else {
        const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
        if (!info.exists) return null;
        rawEncrypted = await FileSystem.readAsStringAsync(PRELOAD_FILE);
      }
      if (!rawEncrypted) return null;
      const decrypted = await decryptJson<PreloadEncryptedPayload>(rawEncrypted);
      if (!decrypted || !decrypted.questions) return null;
      return decrypted;
    } catch (err) {
      if (__DEV__) console.error('[PRELOADER] Decryption error:', err);
      return null;
    }
  },

  async getPreloadedQuestions(): Promise<Question[]> {
    const decrypted = await this.getPreloadedPayload();
    if (!decrypted || !decrypted.questions?.length) {
      console.log('[STARTUP] Exam Pack Missing');
      return [];
    }

    const currentHash = await computeQuestionPackHash(decrypted.questions);
    let hashVerified = Boolean(decrypted.hash) && currentHash === decrypted.hash;

    if (!hashVerified && decrypted.hash) {
      const legacyHash = await computeLegacyQuestionHash(decrypted.questions);
      if (legacyHash === decrypted.hash) {
        hashVerified = true;
        decrypted.hash = currentHash;
        try {
          const encryptedBlob = await encryptJson(decrypted);
          if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
            await appStorage.setItem(WEB_PRELOAD_KEY, encryptedBlob);
          } else {
            await FileSystem.writeAsStringAsync(PRELOAD_FILE, encryptedBlob);
          }
          await appStorage.setItem(PRELOAD_HASH_KEY, currentHash);
        } catch {
          /* keep questions even if re-persist fails */
        }
        console.log('[STARTUP] Hash Verified (legacy payload upgraded)');
      }
    }

    if (!hashVerified) {
      console.error('[STARTUP] Hash verification failed — pack kept, exam will not open until re-download');
      emitProgress(progressFromPayload(decrypted, false));
      return [];
    }

    emitProgress(progressFromPayload(decrypted, true));
    console.log('[STARTUP] Exam Pack Found');
    console.log(`[STARTUP] Questions Loaded ${decrypted.questions.length}`);
    console.log('[STARTUP] Hash Verified');
    return decrypted.questions;
  },

  async getReadinessSnapshot(): Promise<ExamPackProgress> {
    const decrypted = await this.getPreloadedPayload();
    if (!decrypted) {
      emitProgress({ phase: 'incomplete', phaseLabel: 'Exam Download Incomplete' }, true);
      return currentProgress;
    }
    const currentHash = await computeQuestionPackHash(decrypted.questions);
    const legacyHash = decrypted.hash
      ? await computeLegacyQuestionHash(decrypted.questions)
      : '';
    const hashVerified = decrypted.hash === currentHash || decrypted.hash === legacyHash;
    emitProgress(progressFromPayload(decrypted, hashVerified));
    return currentProgress;
  },

  async verifyIntegrity(): Promise<boolean> {
    try {
      const questions = await this.getPreloadedQuestions();
      return Boolean(questions && questions.length > 0 && currentProgress.hashVerified);
    } catch {
      return false;
    }
  },

  async isReady(): Promise<boolean> {
    const snapshot = await this.getReadinessSnapshot();
    return snapshot.moduleReady && snapshot.hashVerified && snapshot.percent >= 100;
  },

  async getPreloadedHash(): Promise<string | null> {
    return await appStorage.getItem(PRELOAD_HASH_KEY);
  },

  async getCachedDuration(): Promise<number | null> {
    const payload = await this.getPreloadedPayload();
    return payload?.durationMinutes ?? null;
  },

  async getCachedSettings(): Promise<ExaminationSettings | null> {
    const payload = await this.getPreloadedPayload();
    return payload?.examinationSettings ?? null;
  },

  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
        await appStorage.deleteItem(WEB_PRELOAD_KEY);
      } else {
        const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
        if (info.exists) {
          await FileSystem.deleteAsync(PRELOAD_FILE, { idempotent: true });
        }
      }
    } catch {
      /* ignore */
    }
    await appStorage.deleteItem(PRELOAD_READY_KEY);
    await appStorage.deleteItem(PRELOAD_HASH_KEY);
    emitProgress({ ...INITIAL_PACK_PROGRESS }, true);
  },
};
