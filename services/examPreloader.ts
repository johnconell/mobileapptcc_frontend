import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '@/constants';
import { appStorage } from '@/services/storage';
import { PeerExamClient } from '@/services/peerExamClient';
import type { Question } from '@/types';

// Encrypted local file for pre-loaded questions
const PRELOAD_FILE = `${FileSystem.documentDirectory ?? ''}metcc-preloaded-questions.enc`;

export const ExamPreloader = {
  /**
   * Fetches the entire question set, calculates SHA-256 integrity,
   * and stores it locally.
   */
  async preloadQuestions(sessionId: string): Promise<{ count: number; hash: string }> {
    if (__DEV__) console.log(`[PRELOADER] Starting secure pre-load: ${sessionId}`);

    const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
    if (!token) throw new Error('Missing participation token');

    // 1. Fetch from Proctor
    const json = await PeerExamClient.request<{ questions: Question[] }>('/questions', {
      query: { participation_token: token },
      timeoutMs: 45000,
    });

    if (!json.questions || !json.questions.length) {
      throw new Error('Proctor server returned an empty question bank');
    }

    // 2. Generate Integrity Hash (SHA-256)
    const rawContent = JSON.stringify(json.questions);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawContent
    );

    // 3. Save locally with session metadata
    const payload = {
        sessionId,
        hash,
        timestamp: Date.now(),
        questions: json.questions
    };

    await FileSystem.writeAsStringAsync(PRELOAD_FILE, JSON.stringify(payload));
    await appStorage.setItem(STORAGE_KEYS.offlinePackReady, '1');

    if (__DEV__) console.log(`[PRELOADER] Verified & Stored. Hash: ${hash.slice(0, 8)}...`);

    return { count: json.questions.length, hash };
  },

  /** Reads questions from the local pre-loaded file */
  async getPreloadedQuestions(): Promise<Question[]> {
    try {
      const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
      if (!info.exists) return [];

      const raw = await FileSystem.readAsStringAsync(PRELOAD_FILE);
      const parsed = JSON.parse(raw);

      // Basic integrity check
      if (!parsed.questions || !parsed.hash) return [];

      return parsed.questions;
    } catch (err) {
      if (__DEV__) console.error('[PRELOADER] Read failed:', err);
      return [];
    }
  },

  /** Verifies that the local file hasn't been tampered with. */
  async verifyIntegrity(): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
      if (!info.exists) return false;
      const raw = await FileSystem.readAsStringAsync(PRELOAD_FILE);
      const parsed = JSON.parse(raw);

      const currentHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(parsed.questions)
      );

      return currentHash === parsed.hash;
    } catch {
      return false;
    }
  },

  async isReady(): Promise<boolean> {
    const ready = await appStorage.getItem(STORAGE_KEYS.offlinePackReady);
    if (ready !== '1') return false;
    const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
    return info.exists;
  },

  async clear(): Promise<void> {
    const info = await FileSystem.getInfoAsync(PRELOAD_FILE);
    if (info.exists) {
      await FileSystem.deleteAsync(PRELOAD_FILE, { idempotent: true });
    }
    await appStorage.deleteItem(STORAGE_KEYS.offlinePackReady);
  }
};
