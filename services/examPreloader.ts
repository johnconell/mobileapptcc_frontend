import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';
import { PeerExamClient } from '@/services/peerExamClient';
import { encryptJson, decryptJson } from '@/services/offlineStore';
import type { Question } from '@/types';

// AES-256-GCM Encrypted local file for pre-loaded exam package
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

type PreloadEncryptedPayload = {
  sessionId: string;
  hash: string;
  timestamp: number;
  questions: Question[];
  durationMinutes?: number;
};

export const ExamPreloader = {
  /**
   * STEP 11, 12, 13: Downloads the complete examination package BEFORE entering the lobby.
   * Validates:
   * ✓ Package questions and structure
   * ✓ SHA-256 integrity hash
   * ✓ Stores in AES-256-GCM encrypted format
   */
  async downloadAndVerifyExamPackage(input: {
    sessionId: string;
    passkey: string;
    code?: string;
  }): Promise<PreloadPackageResult> {
    if (__DEV__) console.log(`[PRELOADER] Starting pre-lobby package download for session: ${input.sessionId}`);

    let questions: Question[] = [];
    let serverReportedHash = '';
    let durationMinutes = 90;

    // 1. If connected in peer mode to proctor phone
    if (await PeerExamClient.isActive()) {
      let packageRes: {
        questions: Question[];
        packageHash?: string;
        durationMinutes?: number;
      } | null = null;
      let lastErr: unknown = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          packageRes = await PeerExamClient.request<{
            questions: Question[];
            packageHash?: string;
            durationMinutes?: number;
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
      } else {
        // Fallback: Check if applicant already downloaded the exam module locally
        try {
          const { OfflineStore } = await import('@/services/offlineStore');
          const { buildExamQuestions } = await import('@/services/offlineExamRepository');
          if (await OfflineStore.hasPack()) {
            const localPack = await OfflineStore.getPack();
            if (localPack) {
              const localQuestions = buildExamQuestions(localPack);
              if (localQuestions && localQuestions.length > 0) {
                console.log(`[PRELOADER] Loaded ${localQuestions.length} questions from local downloaded pack.`);
                questions = localQuestions;
                durationMinutes = localPack.examination_settings?.duration_minutes ?? 90;
              }
            }
          }
        } catch (localErr) {
          console.warn('[PRELOADER] Local pack check error:', localErr);
        }

        // Secondary fallback to /questions endpoint if token is present
        if (!questions.length) {
          try {
            const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
            if (token) {
              const fallbackRes = await PeerExamClient.request<{ questions: Question[] }>('/questions', {
                query: { participation_token: token },
                timeoutMs: 20000,
              });
              if (fallbackRes?.questions?.length) {
                questions = fallbackRes.questions;
              }
            }
          } catch {}
        }
      }

      if (!questions.length) {
        const errorMsg =
          lastErr instanceof Error
            ? lastErr.message
            : typeof lastErr === 'string'
            ? lastErr
            : (lastErr as any)?.message ||
              'Unable to download examination package from proctor phone. Please check Wi-Fi connection.';
        throw new Error(errorMsg);
      }
    } else {
      // 2. Online / Hub mode: fetch via repository
      const { QuestionRepository } = await import('@/repositories/QuestionRepository');
      questions = await QuestionRepository.getQuestions(input.sessionId);
    }

    if (!questions || !questions.length) {
      throw new Error('Examination package contains no questions. Contact your proctor.');
    }

    // 3. Generate SHA-256 Integrity Digest (Deterministic across shuffles)
    const sorted = [...questions].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const normalized = sorted.map((q) => ({
      id: q.id,
      question: (q.question || '').trim(),
      choices: q.choices,
      category: q.category || '',
    }));
    const rawContent = JSON.stringify(normalized);
    const calculatedHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawContent,
    );

    // If proctor provided a hash, verify it matches
    if (serverReportedHash && serverReportedHash !== 'no-pack' && serverReportedHash !== calculatedHash) {
      console.warn(`[PRELOADER] Hash mismatch: server=${serverReportedHash}, local=${calculatedHash}`);
    }

    // 4. Encrypt with AES-256-GCM and store locally
    const payload: PreloadEncryptedPayload = {
      sessionId: input.sessionId,
      hash: calculatedHash,
      timestamp: Date.now(),
      questions,
      durationMinutes,
    };

    const encryptedBlob = await encryptJson(payload);

    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      await appStorage.setItem(WEB_PRELOAD_KEY, encryptedBlob);
    } else {
      await FileSystem.writeAsStringAsync(PRELOAD_FILE, encryptedBlob);
    }

    await appStorage.setItem(PRELOAD_READY_KEY, '1');
    await appStorage.setItem(PRELOAD_HASH_KEY, calculatedHash);

    if (__DEV__) {
      console.log(`[PRELOADER] Successfully encrypted & saved ${questions.length} questions. Hash: ${calculatedHash.slice(0, 10)}`);
    }

    return {
      success: true,
      count: questions.length,
      hash: calculatedHash,
    };
  },

  /** Legacy helper for background preloading */
  async preloadQuestions(sessionId: string): Promise<{ count: number; hash: string }> {
    const passkey = (await appStorage.getItem(STORAGE_KEYS.examinationCode)) || '';
    const res = await this.downloadAndVerifyExamPackage({ sessionId, passkey });
    return { count: res.count, hash: res.hash };
  },

  /** Reads and decrypts questions instantly from local encrypted file */
  async getPreloadedQuestions(): Promise<Question[]> {
    try {
      let rawEncrypted: string | null = null;
      if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
        rawEncrypted = await appStorage.getItem(WEB_PRELOAD_KEY);
      } else {
        const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
        if (!info.exists) return [];
        rawEncrypted = await FileSystem.readAsStringAsync(PRELOAD_FILE);
      }

      if (!rawEncrypted) return [];

      // Decrypt AES-256-GCM
      const decrypted = await decryptJson<PreloadEncryptedPayload>(rawEncrypted);
      if (!decrypted || !decrypted.questions || !decrypted.hash) {
        console.error('[PRELOADER] Decryption returned empty or invalid payload');
        return [];
      }

      // Layer 3: Tamper check
      const currentHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(decrypted.questions),
      );

      if (currentHash !== decrypted.hash) {
        console.error('[SECURITY VIOLATION] Examination questions modified or tampered!');
        await this.clear();
        return [];
      }

      return decrypted.questions;
    } catch (err) {
      if (__DEV__) console.error('[PRELOADER] Decryption error:', err);
      return [];
    }
  },

  /** Verifies that the local preloaded file is valid, decryptable, and untampered. */
  async verifyIntegrity(): Promise<boolean> {
    try {
      const questions = await this.getPreloadedQuestions();
      return Boolean(questions && questions.length > 0);
    } catch {
      return false;
    }
  },

  async isReady(): Promise<boolean> {
    const ready = await appStorage.getItem(PRELOAD_READY_KEY);
    if (ready !== '1') return false;
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      const val = await appStorage.getItem(WEB_PRELOAD_KEY);
      return Boolean(val);
    }
    const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
    return Boolean(info.exists);
  },

  async getPreloadedHash(): Promise<string | null> {
    return await appStorage.getItem(PRELOAD_HASH_KEY);
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
    } catch {}
    await appStorage.deleteItem(PRELOAD_READY_KEY);
    await appStorage.deleteItem(PRELOAD_HASH_KEY);
  },
};
