import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';

const PACK_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-pack.json`;
const PACK_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-pack.enc`;
const RESULTS_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-results.json`;
const PEER_FILE = `${FileSystem.documentDirectory ?? ''}metcc-peer-session.enc`;
const WEB_PACK_KEY = 'tcc.offline.pack.json';
const WEB_PACK_ENC_KEY = 'tcc.offline.pack.enc';
const WEB_RESULTS_KEY = 'tcc.offline.results.json';
const WEB_PEER_KEY = 'tcc.peer.session.enc';
const PACK_KEY_STORAGE = 'tcc.offline.pack.aes.key';

export type OfflinePack = {
  pack_version: number;
  exported_at?: string;
  schedules: Array<{
    id: number;
    title: string;
    exam_date?: string;
    start_time?: string;
    end_time?: string;
    time_slot?: string;
    venue?: string;
    batch_code?: string;
    course?: string;
    rooms?: Array<{ id: number; room_name: string; capacity: number }>;
  }>;
  applicants: Array<{
    id: number;
    applicant_code: string;
    name: string;
    course_applied?: string;
    gmail?: string;
    email?: string;
  }>;
  registrations: Array<{
    id: number;
    examination_schedule_id: number;
    applicant_id: number;
    exam_passkey?: string | null;
  }>;
  question_banks: Array<{
    id: number;
    title: string;
    is_active: boolean;
    subjects: Array<{
      id: number;
      name: string;
      questions: Array<{
        id: number;
        stem: string;
        options: Record<string, string> | string[] | null;
        correct_answer: string;
        is_selected_for_exam: boolean;
        difficulty?: string;
        status?: string;
      }>;
    }>;
  }>;
  examination_settings?: {
    duration_minutes?: number;
    shuffle_questions?: boolean;
    shuffle_categories?: boolean;
    shuffle_both?: boolean;
  };
  /** Present only when pack downloaded with include_auth=1; stripped before disk save. */
  proctors?: Array<{
    id: number;
    name: string;
    email: string;
    password_hash?: string | null;
    status?: string | null;
  }>;
};

export type OfflineQueuedResult = {
  local_id: string;
  applicant_code: string;
  examination_schedule_id: number;
  applicant_name?: string;
  attendance_status: string;
  result_status: string;
  score: number;
  items_correct: number;
  items_total: number;
  grade_point?: number;
  answers: Array<{
    exam_question_id: number;
    selected_answer: string | null;
    is_correct: boolean;
  }>;
  submitted_at: string;
  synced: boolean;
};

type EncryptedBlob = {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  ct: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function getOrCreatePackKey(): Promise<Uint8Array> {
  const existing = await appStorage.getItem(PACK_KEY_STORAGE);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) {
    return hexToBytes(existing);
  }
  const random = await Crypto.getRandomBytesAsync(32);
  const key = new Uint8Array(random);
  await appStorage.setItem(PACK_KEY_STORAGE, bytesToHex(key));
  return key;
}

async function encryptJson(payload: unknown): Promise<string> {
  const key = await getOrCreatePackKey();
  const iv = new Uint8Array(await Crypto.getRandomBytesAsync(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = gcm(key, iv);
  const ciphertext = cipher.encrypt(plaintext);
  const blob: EncryptedBlob = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ciphertext),
  };
  return JSON.stringify(blob);
}

async function decryptJson<T>(raw: string): Promise<T | null> {
  try {
    const parsed = JSON.parse(raw) as EncryptedBlob | OfflinePack;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'v' in parsed &&
      (parsed as EncryptedBlob).v === 1 &&
      (parsed as EncryptedBlob).alg === 'AES-256-GCM'
    ) {
      const blob = parsed as EncryptedBlob;
      const key = await getOrCreatePackKey();
      const iv = base64ToBytes(blob.iv);
      const ct = base64ToBytes(blob.ct);
      const cipher = gcm(key, iv);
      const plain = cipher.decrypt(ct);
      return JSON.parse(new TextDecoder().decode(plain)) as T;
    }
    // Legacy plaintext pack — return in memory; caller may re-encrypt.
    return parsed as T;
  } catch {
    return null;
  }
}

function isEncryptedBlob(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as EncryptedBlob;
    return parsed?.v === 1 && parsed?.alg === 'AES-256-GCM' && Boolean(parsed.iv && parsed.ct);
  } catch {
    return false;
  }
}

async function writeEncrypted(path: string, webKey: string, data: unknown): Promise<void> {
  const text = await encryptJson(data);
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    await appStorage.setItem(webKey, text);
    return;
  }
  await FileSystem.writeAsStringAsync(path, text);
}

async function readEncryptedOrLegacy<T>(
  encPath: string,
  legacyPath: string,
  webEncKey: string,
  webLegacyKey: string,
): Promise<{ data: T | null; needsMigrate: boolean }> {
  try {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      const enc = await appStorage.getItem(webEncKey);
      if (enc) {
        const data = await decryptJson<T>(enc);
        return { data, needsMigrate: Boolean(data) && !isEncryptedBlob(enc) };
      }
      const legacy = await appStorage.getItem(webLegacyKey);
      if (legacy) {
        const data = await decryptJson<T>(legacy);
        return { data, needsMigrate: Boolean(data) };
      }
      return { data: null, needsMigrate: false };
    }

    const encInfo = await FileSystem.getInfoAsync(encPath);
    if (encInfo.exists) {
      const raw = await FileSystem.readAsStringAsync(encPath);
      const data = await decryptJson<T>(raw);
      return { data, needsMigrate: Boolean(data) && !isEncryptedBlob(raw) };
    }

    const legacyInfo = await FileSystem.getInfoAsync(legacyPath);
    if (legacyInfo.exists) {
      const raw = await FileSystem.readAsStringAsync(legacyPath);
      const data = await decryptJson<T>(raw);
      return { data, needsMigrate: Boolean(data) };
    }

    return { data: null, needsMigrate: false };
  } catch {
    return { data: null, needsMigrate: false };
  }
}

async function writeJson(path: string, webKey: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data);
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    await appStorage.setItem(webKey, text);
    return;
  }
  await FileSystem.writeAsStringAsync(path, text);
}

async function readJson<T>(path: string, webKey: string): Promise<T | null> {
  try {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      const raw = await appStorage.getItem(webKey);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function deleteIfExists(path: string, webKey: string): Promise<void> {
  try {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      await appStorage.deleteItem(webKey);
      return;
    }
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }
}

export const OfflineStore = {
  // In-memory pack avoids AES decrypt + JSON.parse on every navigation (was 3–6 min).
  _packCache: null as OfflinePack | null,

  invalidatePackCache(): void {
    this._packCache = null;
  },

  async savePack(pack: OfflinePack): Promise<void> {
    this._packCache = pack;
    await writeEncrypted(PACK_ENC_FILE, WEB_PACK_ENC_KEY, pack);
    // Remove legacy plaintext after successful encrypt.
    await deleteIfExists(PACK_FILE, WEB_PACK_KEY);
    await appStorage.setItem(STORAGE_KEYS.offlinePackReady, '1');
    await appStorage.setItem(STORAGE_KEYS.offlinePackAt, new Date().toISOString());
  },

  async getPack(): Promise<OfflinePack | null> {
    if (this._packCache) return this._packCache;

    const { data, needsMigrate } = await readEncryptedOrLegacy<OfflinePack>(
      PACK_ENC_FILE,
      PACK_FILE,
      WEB_PACK_ENC_KEY,
      WEB_PACK_KEY,
    );
    if (data && needsMigrate) {
      // Migrate plaintext → encrypted at rest on next successful read.
      await this.savePack(data);
      return data;
    }
    if (data) this._packCache = data;
    return data;
  },

  async hasPack(): Promise<boolean> {
    if (this._packCache) return true;
    const flag = await appStorage.getItem(STORAGE_KEYS.offlinePackReady);
    if (flag === '1') return true;
    const pack = await this.getPack();
    return Boolean(pack?.schedules?.length);
  },

  /**
   * Rooms the proctor has explicitly opened. Key = `${scheduleId}:${roomId}`.
   * Default rooms stay Closed until an entry exists here.
   */
  async getOpenedRooms(): Promise<
    Record<string, { code: string; openedAt: string; status: 'lobby_open' | 'in_progress' | 'ended' }>
  > {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.offlineOpenedRooms);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<
        string,
        { code: string; openedAt: string; status?: 'lobby_open' | 'in_progress' | 'ended' }
      >;
      const out: Record<
        string,
        { code: string; openedAt: string; status: 'lobby_open' | 'in_progress' | 'ended' }
      > = {};
      for (const [key, value] of Object.entries(parsed || {})) {
        if (!value?.code) continue;
        out[key] = {
          code: String(value.code).toUpperCase(),
          openedAt: value.openedAt || new Date().toISOString(),
          status: value.status || 'lobby_open',
        };
      }
      return out;
    } catch {
      return {};
    }
  },

  async setOpenedRoom(
    scheduleId: string | number,
    roomId: string | number,
    code: string,
    status: 'lobby_open' | 'in_progress' | 'ended' = 'lobby_open',
  ): Promise<void> {
    const key = `${Number(scheduleId)}:${Number(roomId)}`;
    const all = await this.getOpenedRooms();
    all[key] = {
      code: code.trim().toUpperCase(),
      openedAt: all[key]?.openedAt || new Date().toISOString(),
      status,
    };
    await appStorage.setItem(STORAGE_KEYS.offlineOpenedRooms, JSON.stringify(all));
  },

  async findOpenedRoomByCode(code: string): Promise<{
    scheduleId: number;
    roomId: number;
    code: string;
    status: 'lobby_open' | 'in_progress' | 'ended';
  } | null> {
    const normalized = code.trim().toUpperCase();
    const all = await this.getOpenedRooms();
    for (const [key, value] of Object.entries(all)) {
      if (value.code !== normalized) continue;
      const [scheduleId, roomId] = key.split(':').map(Number);
      if (!scheduleId || !roomId) continue;
      return { scheduleId, roomId, code: value.code, status: value.status };
    }
    return null;
  },

  roomKey(scheduleId: string | number, roomId: string | number): string {
    return `${Number(scheduleId)}:${Number(roomId)}`;
  },

  async getPackMeta(): Promise<{ ready: boolean; at: string | null }> {
    return {
      ready: await this.hasPack(),
      at: await appStorage.getItem(STORAGE_KEYS.offlinePackAt),
    };
  },

  /** Counts for the proctor download card: what is actually on this device. */
  async getPackSummary(): Promise<{
    ready: boolean;
    at: string | null;
    schedules: number;
    students: number;
    questions: number;
    passkeys: number;
  }> {
    const at = await appStorage.getItem(STORAGE_KEYS.offlinePackAt);
    const pack = await this.getPack();
    if (!pack) {
      return { ready: false, at, schedules: 0, students: 0, questions: 0, passkeys: 0 };
    }

    let questions = 0;
    for (const bank of pack.question_banks ?? []) {
      for (const subject of bank.subjects ?? []) {
        for (const question of subject.questions ?? []) {
          if (question.is_selected_for_exam === false) continue;
          if (question.status && question.status !== 'active') continue;
          questions++;
        }
      }
    }

    return {
      ready: Boolean(pack.schedules?.length),
      at,
      schedules: pack.schedules?.length ?? 0,
      students: pack.applicants?.length ?? 0,
      questions,
      passkeys: (pack.registrations ?? []).filter((r) => Boolean(r.exam_passkey)).length,
    };
  },

  /**
   * Proctor-phone peer exam session (answers in flight). Encrypted because it
   * holds student answers before they are graded and queued.
   */
  async savePeerSession(state: unknown): Promise<void> {
    await writeEncrypted(PEER_FILE, WEB_PEER_KEY, state);
  },

  async getPeerSession<T>(): Promise<T | null> {
    const { data } = await readEncryptedOrLegacy<T>(
      PEER_FILE,
      PEER_FILE,
      WEB_PEER_KEY,
      WEB_PEER_KEY,
    );
    return data;
  },

  async clearPeerSession(): Promise<void> {
    await deleteIfExists(PEER_FILE, WEB_PEER_KEY);
  },

  async getResults(): Promise<OfflineQueuedResult[]> {
    return (await readJson<OfflineQueuedResult[]>(RESULTS_FILE, WEB_RESULTS_KEY)) ?? [];
  },

  async saveResults(rows: OfflineQueuedResult[]): Promise<void> {
    await writeJson(RESULTS_FILE, WEB_RESULTS_KEY, rows);
  },

  async queueResult(row: OfflineQueuedResult): Promise<void> {
    const rows = await this.getResults();
    const next = rows.filter(
      (r) =>
        !(
          r.applicant_code === row.applicant_code &&
          r.examination_schedule_id === row.examination_schedule_id
        ),
    );
    next.push(row);
    await this.saveResults(next);
  },

  async pendingResults(): Promise<OfflineQueuedResult[]> {
    const rows = await this.getResults();
    return rows.filter((r) => !r.synced);
  },

  async markSynced(localIds: string[]): Promise<void> {
    const set = new Set(localIds);
    const rows = await this.getResults();
    await this.saveResults(
      rows.map((r) => (set.has(r.local_id) ? { ...r, synced: true } : r)),
    );
  },

  async setOfflineMode(enabled: boolean): Promise<void> {
    await appStorage.setItem(STORAGE_KEYS.offlineMode, enabled ? '1' : '0');
  },

  async isOfflineMode(): Promise<boolean> {
    return (await appStorage.getItem(STORAGE_KEYS.offlineMode)) === '1';
  },

  async getLocalClaims(): Promise<string[]> {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.offlineClaims);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  },

  async setLocalClaim(studentId: string): Promise<void> {
    const ids = await this.getLocalClaims();
    if (!ids.includes(String(studentId))) {
      ids.push(String(studentId));
      await appStorage.setItem(STORAGE_KEYS.offlineClaims, JSON.stringify(ids));
    }
  },

  async clearLocalClaim(studentId?: string): Promise<void> {
    if (!studentId) {
      await appStorage.deleteItem(STORAGE_KEYS.offlineClaims);
      return;
    }
    const ids = (await this.getLocalClaims()).filter((id) => id !== String(studentId));
    if (!ids.length) {
      await appStorage.deleteItem(STORAGE_KEYS.offlineClaims);
      return;
    }
    await appStorage.setItem(STORAGE_KEYS.offlineClaims, JSON.stringify(ids));
  },
};
