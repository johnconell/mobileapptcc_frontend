import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';

const PACK_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-pack.json`;
const RESULTS_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-results.json`;
const WEB_PACK_KEY = 'tcc.offline.pack.json';
const WEB_RESULTS_KEY = 'tcc.offline.results.json';

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

export const OfflineStore = {
  async savePack(pack: OfflinePack): Promise<void> {
    await writeJson(PACK_FILE, WEB_PACK_KEY, pack);
    await appStorage.setItem(STORAGE_KEYS.offlinePackReady, '1');
    await appStorage.setItem(STORAGE_KEYS.offlinePackAt, new Date().toISOString());
  },

  async getPack(): Promise<OfflinePack | null> {
    return readJson<OfflinePack>(PACK_FILE, WEB_PACK_KEY);
  },

  async hasPack(): Promise<boolean> {
    const flag = await appStorage.getItem(STORAGE_KEYS.offlinePackReady);
    if (flag === '1') return true;
    const pack = await this.getPack();
    return Boolean(pack?.schedules?.length);
  },

  async getPackMeta(): Promise<{ ready: boolean; at: string | null }> {
    return {
      ready: await this.hasPack(),
      at: await appStorage.getItem(STORAGE_KEYS.offlinePackAt),
    };
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
