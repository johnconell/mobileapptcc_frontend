import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { DeviceEventEmitter, Platform } from 'react-native';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { authStorageKeys } from '@/features/local-testing/localMode';

import {
  writeEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  encryptJson,
  decryptJson,
  isEncryptedEnvelope,
  StorageFileNotFoundError,
} from '@/shared/services/encryptedStorage';

export { encryptJson, decryptJson };

export const RESULTS_CHANGED_EVENT = 'tcc.offline.results.changed';

export function emitResultsChanged(): void {
  DeviceEventEmitter.emit(RESULTS_CHANGED_EVENT);
}

const PACK_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-pack.json`;
const PACK_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-pack.enc`;
const RESULTS_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-results.json`;
const RESULTS_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-offline-results.enc`;
const PEER_FILE = `${FileSystem.documentDirectory ?? ''}metcc-peer-session.enc`;
const WEB_PACK_KEY = 'tcc.offline.pack.json';
const WEB_PACK_ENC_KEY = 'tcc.offline.pack.enc';
const WEB_RESULTS_KEY = 'tcc.offline.results.json';
const WEB_RESULTS_ENC_KEY = 'tcc.offline.results.enc';
const WEB_PEER_KEY = 'tcc.peer.session.enc';
const EMERGENCY_REPORTS_ENC_FILE = `${FileSystem.documentDirectory ?? ''}metcc-emergency-reports.enc`;
const WEB_EMERGENCY_REPORTS_ENC_KEY = 'tcc.emergency.reports.enc';
const PACK_KEY_STORAGE = 'tcc.offline.pack.aes.key';
const PACK_DASHBOARD_SUMMARY_KEY = 'tcc.offline.pack.dashboard-summary';

export type OfflinePack = {
  pack_version: number;
  pack_revision?: number;
  exported_at?: string;
  downloaded_at?: string;
  authorization?: {
    actor_id: number | null;
    scope: 'assigned_rooms' | 'administrator';
    schedule_ids: number[];
  };
  active_question_bank_id?: number | null;
  integrity_warnings?: Array<{
    examination_schedule_id: number;
    message: string;
  }>;
  schedules: Array<{
    id: number;
    title: string;
    exam_date?: string;
    academic_year?: string;
    start_time?: string;
    end_time?: string;
    time_slot?: string;
    venue?: string;
    batch_code?: string;
    course?: string;
    status?: string;
    session_type?: 'regular' | 'rescheduled';
    reschedule_state?: 'proposed' | 'confirmed' | 'review_required' | null;
    reschedule_confirmed_at?: string | null;
    schedule_revision?: number;
    expected_examinees?: number;
    registration_count?: number;
    assigned_registration_count?: number;
    unassigned_registration_count?: number;
    accessible_registration_count?: number;
    room_capacity?: number;
    integrity_warnings?: string[];
    rooms_managed?: boolean;
    rooms_revision?: number;
    rooms_published_at?: string | null;
    rooms?: Array<{
      id: number;
      examination_schedule_id?: number;
      room_name: string;
      capacity: number;
      proctor_id?: number | null;
      room_id?: number | null;
      reschedule_capacity?: number;
      student_count?: number;
      total_student_count?: number;
      emergency_suspended?: boolean;
    }>;
  }>;
  applicants: Array<{
    id: number;
    applicant_code: string;
    name: string;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    course_applied?: string;
    gmail?: string;
    email?: string;
    status?: string | null;
  }>;
  registrations: Array<{
    id: number;
    examination_schedule_id: number;
    applicant_id: number;
    assigned_room_id?: number | null;
    exam_set?: string | null;
    exam_passkey?: string | null;
    exam_passkey_hash?: string | null;
    attendance_status?: string | null;
    result_status?: string | null;
    passkey_status?: string | null;
    passkey_sent_to_email?: string | null;
    passkey_used_at?: string | null;
    passkey_expires_at?: string | null;
    previous_schedule_id?: number | null;
    reschedule_reason?: string | null;
    rescheduled_at?: string | null;
    emergency_recovery?: {
      incident_id: number;
      status: 'scheduled' | 'resources_assigned' | 'notifications_queued' | 'notified' | 'notification_failed';
    } | null;
  }>;
  question_banks: Array<{
    id: number;
    title: string;
    is_active: boolean;
    subjects: Array<{
      id: number;
      name: string;
      is_active?: boolean;
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
    allow_late_entry?: false;
    disconnect_grace_seconds?: number;
    room_student_limit?: number;
    shuffle_questions?: boolean;
    shuffle_categories?: boolean;
    shuffle_both?: boolean;
    exam_set_definitions?: string[];
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

export type OfflinePackDashboardSnapshot = {
  actorId: number;
  downloadedAt: string | null;
  schedules: Array<{
    id: number;
    title: string;
    exam_date?: string;
    start_time?: string;
    end_time?: string;
    time_slot?: string;
    venue?: string;
    registration_count?: number;
    assigned_registration_count?: number;
    unassigned_registration_count?: number;
    accessible_registration_count?: number;
    integrity_warnings?: string[];
    rooms?: Array<{
      id: number;
      room_name: string;
      capacity: number;
      student_count: number;
    }>;
  }>;
  registrationsBySchedule: Record<string, number>;
  students: number;
  questions: number;
  durationMinutes: number;
  passingPercentage: number;
};

export type OfflineQueuedResult = {
  local_id: string;
  applicant_code: string;
  examination_schedule_id: number;
  examination_room_id?: number | null;
  question_bank_id?: number | null;
  applicant_name?: string;
  attendance_status: string;
  result_status: string;
  exam_set?: string | null;
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
  sync_status?: 'pending' | 'syncing' | 'synced' | 'failed';
  sync_error?: string | null;
  synced_at?: string | null;
};

export type OfflineEmergencyReport = {
  client_report_id: string;
  emergency_incident_id?: number;
  examination_schedule_id: number;
  examination_room_id: number;
  device_id: string;
  reason: string;
  started_at: string;
  synced: boolean;
  synced_at?: string | null;
};

const isEncryptedBlob = isEncryptedEnvelope;
let packLoadInFlight: Promise<OfflinePack | null> | null = null;

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
  throwOnReadFailure = false,
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
  } catch (error) {
    if (throwOnReadFailure) {
      console.error('[OfflineStore] Saved examination pack could not be read:',
        error instanceof Error ? error.name : 'StorageError');
      throw new Error('The saved examination pack could not be read. Its encrypted file was preserved; retry storage access or contact the proctor.');
    }
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

/** Convert date / timestamp string into canonical local YYYY-MM-DD */
export function toLocalDateString(input?: string | Date | null): string {
  if (!input) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) {
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
      return input.slice(0, 10);
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute a deterministic content fingerprint / hash for an OfflinePack.
 * Used for offline LAN compatibility checking between Proctor and Student devices.
 *
 * NOTE: MUST NOT include `exported_at` timestamp so that packs downloaded at
 * different times by Proctor and Student with identical questions produce the SAME hash.
 * Deterministic string representation of an OfflinePack for cryptographic hashing.
 * Sorts all keys, questions, options, and schedules to guarantee identical hashes.
 */
export function normalizePackForHashing(pack: OfflinePack | null): string {
  if (!pack) return 'no-pack';

  const sigs: string[] = [];
  for (const bank of pack.question_banks ?? []) {
    if (bank.is_active === false) continue;
    for (const subject of bank.subjects ?? []) {
      for (const q of subject.questions ?? []) {
        if (q.is_selected_for_exam === false) continue;
        if (q.status && q.status !== 'active') continue;

        let optionsStr = '';
        if (q.options && typeof q.options === 'object') {
          if (Array.isArray(q.options)) {
            optionsStr = q.options.map(String).join(';');
          } else {
            const sortedKeys = Object.keys(q.options).sort();
            optionsStr = sortedKeys
              .map((k) => `${k}:${(q.options as Record<string, string>)[k]}`)
              .join(';');
          }
        }

        sigs.push(`${q.id}:${(q.stem || '').trim()}:${(q.correct_answer || '').trim()}:${optionsStr}`);
      }
    }
  }

  const settings = pack.examination_settings;
  const settingsSig = settings
    ? `${settings.duration_minutes ?? 60}:${settings.room_student_limit ?? 60}:${Boolean(settings.shuffle_questions)}:${Boolean(settings.shuffle_categories)}:${Boolean(settings.shuffle_both)}`
    : 'default-settings';

  const scheduleSig = (pack.schedules ?? [])
    .map((s) => {
      const rooms = (s.rooms ?? [])
        .map((room) =>
          `${room.id}:${room.examination_schedule_id ?? ''}:${room.room_name}:${room.proctor_id ?? ''}:${room.room_id ?? ''}:${room.capacity}:${room.reschedule_capacity ?? ''}:${room.emergency_suspended ? 1 : 0}`,
        )
        .sort()
        .join(',');
      return `${s.id}:${s.exam_date || ''}:${s.start_time || ''}:${s.end_time || ''}:${s.status || ''}:${s.session_type || ''}:${s.schedule_revision ?? 1}:${s.rooms_revision ?? 0}:${rooms}`;
    })
    .sort()
    .join(';');
  const registrationSig = (pack.registrations ?? [])
    .map((r) =>
      `${r.id}:${r.examination_schedule_id}:${r.applicant_id}:${r.assigned_room_id ?? ''}:${r.exam_passkey_hash ?? ''}:${r.passkey_status ?? ''}:${r.passkey_expires_at ?? ''}:${r.emergency_recovery?.incident_id ?? ''}:${r.emergency_recovery?.status ?? ''}`,
    )
    .sort()
    .join(';');

  return `${pack.pack_version || 1}:${pack.pack_revision ?? 1}-${scheduleSig}-${registrationSig}-${settingsSig}-${sigs.sort().join('|')}`;
}

/** Cryptographic SHA-256 hash of OfflinePack */
export async function computePackHashAsync(pack: OfflinePack | null): Promise<string> {
  if (!pack) return 'no-pack';
  const raw = normalizePackForHashing(pack);
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  } catch {
    return computePackHash(pack);
  }
}

/**
 * Compute a deterministic content fingerprint / hash for an OfflinePack.
 * Used for offline LAN compatibility checking between Proctor and Student devices.
 */
export function computePackHash(pack: OfflinePack | null): string {
  if (!pack) return 'no-pack';
  const raw = normalizePackForHashing(pack);
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Keep only the admin-activated bank(s) and their selected questions.
 * Guards against cloud APIs that still export inactive banks.
 */
export function sanitizePackToActiveBanks(pack: OfflinePack): OfflinePack {
  const banks = (pack.question_banks ?? [])
    .filter((b) => Boolean(b.is_active))
    .map((bank) => ({
      ...bank,
      subjects: (bank.subjects ?? [])
        .filter((s) => s.is_active !== false)
        .map((subject) => ({
          ...subject,
          questions: (subject.questions ?? []).filter((q) => {
            if (q.is_selected_for_exam === false) return false;
            if (q.status && q.status !== 'active') return false;
            return true;
          }),
        })),
    }));

  return {
    ...pack,
    question_banks: banks,
  };
}

async function packBelongsToCurrentAccount(pack: OfflinePack): Promise<boolean> {
  const actorId = Number(pack.authorization?.actor_id ?? 0);
  if (!Number.isInteger(actorId) || actorId <= 0) return false;
  try {
    const raw = await appStorage.getItem(authStorageKeys().session);
    if (!raw) return false;
    const session = JSON.parse(raw) as { id?: string | number };
    return Number(session.id) === actorId;
  } catch {
    return false;
  }
}

function buildDashboardSnapshot(
  pack: OfflinePack,
  downloadedAt: string | null,
): OfflinePackDashboardSnapshot {
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

  const registrationsBySchedule: Record<string, number> = {};
  for (const registration of pack.registrations ?? []) {
    const key = String(registration.examination_schedule_id);
    registrationsBySchedule[key] = (registrationsBySchedule[key] ?? 0) + 1;
  }
  for (const schedule of pack.schedules ?? []) {
    const total = Number(schedule.registration_count);
    if (Number.isFinite(total) && total >= 0) {
      registrationsBySchedule[String(schedule.id)] = total;
    }
  }

  const gradingSettings = (pack as OfflinePack & {
    grading_settings?: Array<{ passing_percentage?: number }>;
  }).grading_settings;
  const rawPassingPercentage = Number(gradingSettings?.[0]?.passing_percentage ?? 75);

  return {
    actorId: Number(pack.authorization?.actor_id ?? 0),
    downloadedAt,
    schedules: (pack.schedules ?? []).map((schedule) => ({
      id: schedule.id,
      title: schedule.title,
      exam_date: schedule.exam_date,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      time_slot: schedule.time_slot,
      venue: schedule.venue,
      registration_count: schedule.registration_count,
      assigned_registration_count: schedule.assigned_registration_count,
      unassigned_registration_count: schedule.unassigned_registration_count,
      accessible_registration_count: schedule.accessible_registration_count,
      integrity_warnings: schedule.integrity_warnings,
      rooms: (schedule.rooms ?? []).map((room) => ({
        id: room.id,
        room_name: room.room_name,
        capacity: room.capacity,
        student_count: Number(room.student_count ?? 0),
      })),
    })),
    registrationsBySchedule,
    students: (pack.schedules ?? []).reduce((sum, schedule) => {
      const count = Number(schedule.registration_count);
      return sum + (Number.isFinite(count) && count >= 0 ? count : 0);
    }, 0) || (pack.applicants?.length ?? 0),
    questions,
    durationMinutes: pack.examination_settings?.duration_minutes ?? 60,
    passingPercentage: Number.isFinite(rawPassingPercentage) ? rawPassingPercentage : 75,
  };
}

export const OfflineStore = {
  // In-memory pack avoids AES decrypt + JSON.parse on every navigation (was 3–6 min).
  _packCache: null as OfflinePack | null,

  invalidatePackCache(): void {
    this._packCache = null;
  },

  async savePack(
    pack: OfflinePack,
    options?: { preserveDownloadedAt?: boolean },
  ): Promise<void> {
    const downloadedAt = options?.preserveDownloadedAt
      ? pack.downloaded_at || (await appStorage.getItem(STORAGE_KEYS.offlinePackAt)) || new Date().toISOString()
      : new Date().toISOString();
    const safe = sanitizePackToActiveBanks({
      ...pack,
      downloaded_at: downloadedAt,
      schedules: (pack.schedules ?? []).map((schedule) => ({
        ...schedule,
        status: schedule.status || 'ready',
      })),
    });
    await writeEncrypted(PACK_ENC_FILE, WEB_PACK_ENC_KEY, safe);
    this._packCache = safe;
    await appStorage.setItem(
      PACK_DASHBOARD_SUMMARY_KEY,
      JSON.stringify(buildDashboardSnapshot(safe, downloadedAt)),
    );
    // Remove legacy plaintext after successful encrypt.
    await deleteIfExists(PACK_FILE, WEB_PACK_KEY);
    // The pack is authoritative for schedules available offline. Drop any older
    // cloud schedule catalog so archived entries cannot survive a successful sync.
    await appStorage.deleteItem('tcc.offline.schedule.catalog');
    const allowedRoomKeys = new Set(
      safe.schedules.flatMap((schedule) =>
        (schedule.rooms ?? []).map((room) => this.roomKey(schedule.id, room.id)),
      ),
    );
    const openedRooms = await this.getOpenedRooms();
    let openedRoomsChanged = false;
    for (const key of Object.keys(openedRooms)) {
      if (allowedRoomKeys.has(key)) continue;
      delete openedRooms[key];
      openedRoomsChanged = true;
    }
    if (openedRoomsChanged) {
      if (Object.keys(openedRooms).length) {
        await appStorage.setItem(STORAGE_KEYS.offlineOpenedRooms, JSON.stringify(openedRooms));
      } else {
        await appStorage.deleteItem(STORAGE_KEYS.offlineOpenedRooms);
      }
    }
    await appStorage.setItem(STORAGE_KEYS.offlinePackReady, '1');
    await appStorage.setItem(STORAGE_KEYS.offlinePackAt, downloadedAt);
    try {
      const sha256 = await computePackHashAsync(safe);
      await appStorage.setItem('tcc.offline.pack.sha256', sha256);
    } catch {
      // ignore
    }
    try {
      const { persistDisconnectGraceSeconds } = await import('@/shared/utils/gracePeriod');
      await persistDisconnectGraceSeconds(safe.examination_settings?.disconnect_grace_seconds);
    } catch {
      // Non-fatal: devices fall back to default limit.
    }
  },

  /** Remove locally cached schedules and their student data when cloud sync no longer allows them. */
  async retainPackSchedules(allowedScheduleIds: Set<string>): Promise<void> {
    const pack = await this.getPack();
    if (!pack?.schedules?.length) return;

    const schedules = pack.schedules.filter((schedule) => allowedScheduleIds.has(String(schedule.id)));
    if (schedules.length === pack.schedules.length) return;

    const retainedIds = new Set(schedules.map((schedule) => String(schedule.id)));
    const registrations = (pack.registrations ?? []).filter((registration) =>
      retainedIds.has(String(registration.examination_schedule_id)),
    );
    const applicantIds = new Set(registrations.map((registration) => String(registration.applicant_id)));
    const applicants = (pack.applicants ?? []).filter((applicant) => applicantIds.has(String(applicant.id)));

    if (schedules.length) {
      await this.savePack(
        { ...pack, schedules, registrations, applicants },
        { preserveDownloadedAt: true },
      );
    } else {
      await this.clearPackFiles({ preserveBundledProctorSession: true });
    }

    const openedRooms = await this.getOpenedRooms();
    let roomsChanged = false;
    for (const key of Object.keys(openedRooms)) {
      const scheduleId = key.split(':', 1)[0];
      if (retainedIds.has(scheduleId)) continue;
      delete openedRooms[key];
      roomsChanged = true;
    }
    if (roomsChanged) {
      if (Object.keys(openedRooms).length) {
        await appStorage.setItem(STORAGE_KEYS.offlineOpenedRooms, JSON.stringify(openedRooms));
      } else {
        await appStorage.deleteItem(STORAGE_KEYS.offlineOpenedRooms);
      }
    }
  },

  /** Layer 3: Tamper Detection & Integrity Verification */
  async verifyPackIntegrity(): Promise<{ valid: boolean; error?: string; sha256?: string; pack?: OfflinePack }> {
    const pack = await this.getPack();
    if (!pack) {
      return { valid: false, error: 'No examination package found on this device.' };
    }

    const hasQuestions = (pack.question_banks ?? []).some((b) =>
      (b.subjects ?? []).some((s) => (s.questions ?? []).length > 0),
    );
    if (!hasQuestions) {
      return { valid: false, error: 'Examination package has empty or missing question bank.' };
    }

    if (!pack.schedules?.length) {
      return { valid: false, error: 'Examination package has no active schedules.' };
    }

    const currentSha256 = await computePackHashAsync(pack);
    const storedSha256 = await appStorage.getItem('tcc.offline.pack.sha256');

    if (storedSha256 && storedSha256 !== currentSha256) {
      console.error('[SECURITY VIOLATION] Package tampering detected! Stored hash does not match current content.');
      return {
        valid: false,
        error: 'Security Violation: Examination package tampering detected. Integrity check failed.',
        sha256: currentSha256,
      };
    }

    return { valid: true, sha256: currentSha256, pack };
  },

  async getPackDashboardSnapshot(): Promise<OfflinePackDashboardSnapshot | null> {
    const sessionRaw = await appStorage.getItem(authStorageKeys().session);
    let actorId: number | null = null;
    try {
      actorId = sessionRaw ? Number((JSON.parse(sessionRaw) as { id?: number | string }).id) : null;
    } catch (error) {
      console.warn('[OfflineStore] Cached proctor session could not be read for the dashboard summary:', {
        errorName: error instanceof Error ? error.name : 'StorageError',
      });
    }

    const summaryRaw = await appStorage.getItem(PACK_DASHBOARD_SUMMARY_KEY);
    if (summaryRaw && actorId != null && Number.isInteger(actorId) && actorId > 0) {
      try {
        const summary = JSON.parse(summaryRaw) as OfflinePackDashboardSnapshot;
        if (
          summary.actorId === actorId &&
          Array.isArray(summary.schedules) &&
          Number.isFinite(summary.students) &&
          Number.isFinite(summary.questions)
        ) {
          return summary;
        }
      } catch (error) {
        console.warn('[OfflineStore] Cached dashboard summary is invalid; rebuilding it from the saved pack:', {
          errorName: error instanceof Error ? error.name : 'StorageError',
        });
      }
    }

    const pack = await this.getPack();
    if (!pack) return null;
    const snapshot = buildDashboardSnapshot(
      pack,
      pack.downloaded_at ?? (await appStorage.getItem(STORAGE_KEYS.offlinePackAt)),
    );
    await appStorage.setItem(PACK_DASHBOARD_SUMMARY_KEY, JSON.stringify(snapshot));
    return snapshot;
  },

  async getPack(): Promise<OfflinePack | null> {
    if (this._packCache) {
      const cached = sanitizePackToActiveBanks(this._packCache);
      if (!await packBelongsToCurrentAccount(cached)) return null;
      this._packCache = cached;
      return cached;
    }
    if (packLoadInFlight) return packLoadInFlight;

    const load = async (): Promise<OfflinePack | null> => {
      const { data, needsMigrate } = await readEncryptedOrLegacy<OfflinePack>(
        PACK_ENC_FILE,
        PACK_FILE,
        WEB_PACK_ENC_KEY,
        WEB_PACK_KEY,
        true,
      );
      if (!data) return null;

      const safe = sanitizePackToActiveBanks(data);
      if (!await packBelongsToCurrentAccount(safe)) return null;
      const hadInactive =
        (data.question_banks?.length ?? 0) !== (safe.question_banks?.length ?? 0);

      if (needsMigrate || hadInactive) {
        // Migrate plaintext → encrypted, and drop inactive banks from older packs.
        await this.savePack(safe);
        return safe;
      }

      this._packCache = safe;
      return safe;
    };

    const pending = load();
    packLoadInFlight = pending;
    try {
      return await pending;
    } finally {
      if (packLoadInFlight === pending) packLoadInFlight = null;
    }
  },

  async hasPack(): Promise<boolean> {
    const pack = await this.getPack();
    return Boolean(pack?.schedules?.length);
  },

  /**
   * Rooms the proctor has explicitly opened. Key = `${scheduleId}:${roomId}`.
   * Default rooms stay Closed until an entry exists here.
   */
  async getOpenedRooms(): Promise<
    Record<
      string,
      {
        code: string;
        openedAt: string;
        status: 'lobby_open' | 'in_progress' | 'ended';
        ownerId?: number | null;
        proctorName?: string | null;
      }
    >
  > {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.offlineOpenedRooms);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<
        string,
        {
          code: string;
          openedAt: string;
          status?: 'lobby_open' | 'in_progress' | 'ended';
          ownerId?: number | null;
          proctorName?: string | null;
        }
      >;
      const out: Record<
        string,
        {
          code: string;
          openedAt: string;
          status: 'lobby_open' | 'in_progress' | 'ended';
          ownerId?: number | null;
          proctorName?: string | null;
        }
      > = {};
      for (const [key, value] of Object.entries(parsed || {})) {
        if (!value?.code) continue;
        out[key] = {
          code: String(value.code).toUpperCase(),
          openedAt: value.openedAt || new Date().toISOString(),
          status: value.status || 'lobby_open',
          ownerId: value.ownerId != null ? Number(value.ownerId) : null,
          proctorName: value.proctorName ? String(value.proctorName) : null,
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
    ownerId?: number | null,
    proctorName?: string | null,
  ): Promise<void> {
    const sid = await this.resolveOpenedScheduleId(scheduleId);
    const rid = Number(roomId);
    if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(rid) || rid <= 0) {
      console.error('[OfflineStore] Refusing setOpenedRoom with invalid ids', {
        scheduleId,
        roomId,
        sid,
        rid,
      });
      return;
    }
    const key = `${sid}:${rid}`;
    const all = await this.getOpenedRooms();
    // Drop legacy NaN keys for the same room if present.
    for (const existing of Object.keys(all)) {
      if (existing.startsWith('NaN:') && existing.endsWith(`:${rid}`)) {
        delete all[existing];
      }
    }
    all[key] = {
      code: code.trim().toUpperCase(),
      openedAt: all[key]?.openedAt || new Date().toISOString(),
      status,
      ownerId: ownerId !== undefined ? ownerId : (all[key]?.ownerId ?? null),
      proctorName: proctorName !== undefined ? proctorName : (all[key]?.proctorName ?? null),
    };
    await appStorage.setItem(STORAGE_KEYS.offlineOpenedRooms, JSON.stringify(all));
  },

  /** Remove opened-room entry so the room returns to idle and can be opened again. */
  async clearOpenedRoom(
    scheduleId: string | number,
    roomId: string | number,
  ): Promise<void> {
    const sid = await this.resolveOpenedScheduleId(scheduleId);
    const rid = Number(roomId);
    if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(rid) || rid <= 0) {
      return;
    }
    const key = `${sid}:${rid}`;
    const all = await this.getOpenedRooms();
    if (!all[key]) return;
    delete all[key];
    await appStorage.setItem(STORAGE_KEYS.offlineOpenedRooms, JSON.stringify(all));
  },

  async resolveOpenedScheduleId(scheduleId: string | number): Promise<number> {
    const direct = Number(String(scheduleId).replace(/^offline-/, '').split(/[:-]/)[0]);
    if (Number.isInteger(direct) && direct > 0) return direct;
    try {
      const pack = this._packCache ?? (await this.getPack());
      const { resolveNumericScheduleId } = await import(
        '@/features/examinations/services/peerExamServer'
      );
      return resolveNumericScheduleId(scheduleId, pack);
    } catch {
      return 0;
    }
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
    packRevision: number | null;
    lastUpdatedAt: string | null;
  }> {
    const at = await appStorage.getItem(STORAGE_KEYS.offlinePackAt);
    const pack = await this.getPack();
    if (!pack) {
      return {
        ready: false,
        at,
        schedules: 0,
        students: 0,
        questions: 0,
        passkeys: 0,
        packRevision: null,
        lastUpdatedAt: null,
      };
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
      passkeys: (pack.registrations ?? []).filter(
        (r) => Boolean(r.exam_passkey || r.exam_passkey_hash),
      ).length,
      packRevision: pack.pack_revision ?? null,
      lastUpdatedAt: pack.downloaded_at ?? at ?? null,
    };
  },

  /**
   * Check whether the exam pack was downloaded TODAY (local date YYYY-MM-DD)
   * or within the last 24 hours.
   */
  async isPackDownloadedToday(): Promise<{
    downloadedToday: boolean;
    packDate: string | null;
    today: string;
    hasPack: boolean;
  }> {
    const has = await this.hasPack();
    const today = toLocalDateString();
    if (!has) {
      return { downloadedToday: false, packDate: null, today, hasPack: false };
    }

    const at = await appStorage.getItem(STORAGE_KEYS.offlinePackAt);
    const pack = await this.getPack();
    const timestamp = at || pack?.exported_at || null;
    const packDate = timestamp ? toLocalDateString(timestamp) : null;
    let downloadedToday = Boolean(packDate && packDate === today);

    // Also consider valid if downloaded/acknowledged within the past 24 hours
    if (!downloadedToday && timestamp) {
      const tsMs = new Date(timestamp).getTime();
      if (!isNaN(tsMs) && tsMs > 0 && Date.now() - tsMs < 24 * 3600 * 1000 && Date.now() >= tsMs) {
        downloadedToday = true;
      }
    }

    return {
      downloadedToday,
      packDate,
      today,
      hasPack: true,
    };
  },

  /**
   * Mark the cached offline exam pack as acknowledged/ready for today.
   * Updates offlinePackAt so the proctor can open examination rooms without redundant prompts.
   */
  async markPackAcknowledgedToday(): Promise<void> {
    const nowIso = new Date().toISOString();
    await appStorage.setItem(STORAGE_KEYS.offlinePackAt, nowIso);
    await appStorage.setItem(STORAGE_KEYS.offlinePackReady, '1');
  },

  /**
   * Proctor-phone peer exam session (answers in flight). Encrypted because it
   * holds student answers before they are graded and queued.
   */
  async savePeerSession(state: unknown): Promise<void> {
    await writeEncrypted(PEER_FILE, WEB_PEER_KEY, state);
  },

  async getPeerSession<T>(): Promise<T | null> {
    const { data, needsMigrate } = await readEncryptedOrLegacy<T>(
      PEER_FILE,
      PEER_FILE,
      WEB_PEER_KEY,
      WEB_PEER_KEY,
    );
    if (data && needsMigrate) {
      await this.savePeerSession(data);
    }
    return data;
  },

  async clearPeerSession(): Promise<void> {
    await deleteIfExists(PEER_FILE, WEB_PEER_KEY);
  },

  async getResults(): Promise<OfflineQueuedResult[]> {
    try {
      const res = await readEncryptedFile<OfflineQueuedResult[]>(
        RESULTS_ENC_FILE,
        WEB_RESULTS_ENC_KEY,
        {
          legacyPlaintextPath: RESULTS_FILE,
          legacyWebKey: WEB_RESULTS_KEY,
          type: 'offline_results',
        },
      );
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      if (err instanceof StorageFileNotFoundError) {
        return [];
      }
      console.error(
        '[OfflineStore] Failed to decrypt offline results queue:',
        err instanceof Error ? err.name : 'StorageError',
      );
      throw err;
    }
  },

  async saveResults(rows: OfflineQueuedResult[]): Promise<void> {
    rows.forEach((r) => {
      const validSched = Number.isInteger(Number(r.examination_schedule_id)) && Number(r.examination_schedule_id) > 0;
      const validCode = Boolean(r.applicant_code && typeof r.applicant_code === 'string' && r.applicant_code.trim());
      if (!validSched || !validCode) {
        console.error(
          '[OfflineStore] Preserving invalid queued result for recovery: local_id=' +
            r?.local_id +
            ', schedule_id=' +
            r?.examination_schedule_id,
        );
      }
    });
    await writeEncryptedFile(RESULTS_ENC_FILE, WEB_RESULTS_ENC_KEY, rows, {
      meta: { type: 'offline_results' },
    });
  },

  async clearResults(): Promise<void> {
    await deleteEncryptedFile(RESULTS_ENC_FILE, WEB_RESULTS_ENC_KEY, {
      legacyPlaintextPath: RESULTS_FILE,
      legacyWebKey: WEB_RESULTS_KEY,
    });
    emitResultsChanged();
  },

  async getEmergencyReports(): Promise<OfflineEmergencyReport[]> {
    try {
      const result = await readEncryptedFile<OfflineEmergencyReport[]>(
        EMERGENCY_REPORTS_ENC_FILE,
        WEB_EMERGENCY_REPORTS_ENC_KEY,
        { type: 'offline_emergency_reports' },
      );
      return Array.isArray(result.data) ? result.data : [];
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) return [];
      console.error(
        '[OfflineStore] Failed to decrypt emergency report queue:',
        error instanceof Error ? error.name : 'StorageError',
      );
      throw error;
    }
  },

  async saveEmergencyReports(reports: OfflineEmergencyReport[]): Promise<void> {
    await writeEncryptedFile(
      EMERGENCY_REPORTS_ENC_FILE,
      WEB_EMERGENCY_REPORTS_ENC_KEY,
      reports,
      { meta: { type: 'offline_emergency_reports' } },
    );
  },

  async queueEmergencyReport(report: OfflineEmergencyReport): Promise<void> {
    const reports = await this.getEmergencyReports();
    if (reports.some((item) => item.client_report_id === report.client_report_id)) return;
    await this.saveEmergencyReports([...reports, report]);
  },

  async markEmergencyReportSynced(
    clientReportId: string,
    syncedAt = new Date().toISOString(),
  ): Promise<void> {
    const reports = await this.getEmergencyReports();
    let found = false;
    const updated = reports.map((report) => {
      if (report.client_report_id !== clientReportId) return report;
      found = true;
      return { ...report, synced: true, synced_at: syncedAt };
    });
    if (!found) {
      throw new Error(`Emergency report ${clientReportId} was not found in the local queue.`);
    }
    await this.saveEmergencyReports(updated);
  },

  async pendingEmergencyReports(): Promise<OfflineEmergencyReport[]> {
    return (await this.getEmergencyReports()).filter((report) => !report.synced);
  },

  async queueResult(row: OfflineQueuedResult): Promise<void> {
    // FIX 2 & FIX 3: Hard integrity validation before queueing
    if (!row || !Number.isInteger(Number(row.examination_schedule_id)) || Number(row.examination_schedule_id) <= 0) {
      const err = `[OfflineStore Integrity Failure] Refused to queue result with invalid examination_schedule_id: ${row?.examination_schedule_id}`;
      console.error(err);
      throw new Error(err);
    }
    if (!row.applicant_code || typeof row.applicant_code !== 'string' || !row.applicant_code.trim()) {
      const err = `[OfflineStore Integrity Failure] Refused to queue result with missing applicant_code`;
      console.error(err);
      throw new Error(err);
    }

    const rows = await this.getResults();
    const { matchQueuedResult } = await import('./resultQueueIdentity');
    const match = matchQueuedResult(rows, {
      localId: row.local_id,
      applicantCode: row.applicant_code,
      scheduleId: row.examination_schedule_id,
      answers: row.answers,
    });
    if (match.kind === 'duplicate') return;
    if (match.kind === 'conflict') {
      throw new Error(
        'A different result is already queued for this student and examination. The saved result was preserved.',
      );
    }

    const next = [...rows];
    next.push({
      ...row,
      synced: false,
      sync_status: 'pending',
      sync_error: null,
      synced_at: null,
    });
    await this.saveResults(next);
    emitResultsChanged();
  },

  async pendingResults(): Promise<OfflineQueuedResult[]> {
    const rows = await this.getResults();
    return rows.filter((r) => !r.synced && r.sync_status !== 'synced');
  },

  async updateResultSyncStatus(
    localIds: string[],
    status: 'pending' | 'syncing' | 'failed',
    error: string | Record<string, string> | null = null,
  ): Promise<void> {
    const ids = new Set(localIds);
    if (!ids.size) return;
    const rows = await this.getResults();
    await this.saveResults(
      rows.map((row) =>
        ids.has(row.local_id)
          ? {
              ...row,
              synced: false,
              sync_status: status,
              sync_error: typeof error === 'object' && error !== null
                ? error[row.local_id] ?? 'The server did not confirm this result.'
                : error,
              synced_at: null,
            }
          : row,
      ),
    );
    emitResultsChanged();
  },

  async markSynced(localIds: string[]): Promise<void> {
    const set = new Set(localIds);
    const rows = await this.getResults();
    await this.saveResults(
      rows.map((r) =>
        set.has(r.local_id)
          ? {
              ...r,
              synced: true,
              sync_status: 'synced' as const,
              sync_error: null,
              synced_at: new Date().toISOString(),
            }
          : r,
      ),
    );
    emitResultsChanged();
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

  /** Deletes cached exam pack files. Does not touch queued results. */
  async clearPackFiles(options?: { preserveBundledProctorSession?: boolean }): Promise<void> {
    this.invalidatePackCache();
    await deleteIfExists(PACK_ENC_FILE, WEB_PACK_ENC_KEY);
    await deleteIfExists(PACK_FILE, WEB_PACK_KEY);
    await appStorage.deleteItem(PACK_DASHBOARD_SUMMARY_KEY);
    await appStorage.deleteItem(STORAGE_KEYS.offlinePackReady);
    await appStorage.deleteItem(STORAGE_KEYS.offlinePackAt);
    await appStorage.deleteItem('tcc.offline.pack.sha256');
    if (!options?.preserveBundledProctorSession) {
      await this.clearBundledProctorSession();
    }
  },

  async bundleProctorSession(profile: {
    id: string;
    username: string;
    displayName: string;
    roleLabel: string;
    token?: string;
  }): Promise<void> {
    if (!profile?.token) return;
    await appStorage.setItem(
      STORAGE_KEYS.bundledProctorSession,
      JSON.stringify({ ...profile, offlineSession: true, bundledAt: new Date().toISOString() }),
    );
  },

  async getBundledProctorSession(): Promise<{
    id: string;
    username: string;
    displayName: string;
    roleLabel: string;
    token: string;
    offlineSession: true;
  } | null> {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.bundledProctorSession);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        id?: string;
        username?: string;
        displayName?: string;
        roleLabel?: string;
        token?: string;
      };
      if (!parsed?.token || !parsed.id) return null;
      return {
        id: String(parsed.id),
        username: String(parsed.username || ''),
        displayName: String(parsed.displayName || parsed.username || 'Proctor'),
        roleLabel: String(parsed.roleLabel || 'Proctor'),
        token: String(parsed.token),
        offlineSession: true,
      };
    } catch {
      return null;
    }
  },

  async clearBundledProctorSession(): Promise<void> {
    await appStorage.deleteItem(STORAGE_KEYS.bundledProctorSession);
  },
};
