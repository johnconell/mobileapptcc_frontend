import { ApiError, apiRequest, getCloudApiBaseUrl, getApiBaseUrl } from '@/shared/services/api';
import {
  assertSecureApiBase,
  describeApiReachabilityProblem,
  studentPackDownloadFailureMessage,
} from '@/shared/services/apiReachability';
import { classifyPasskeyMatch, type PasskeyMatchClassification } from '@/features/examinations/services/passkeyClassification';
import {
  getPasskeyScheduleWindowState,
  passkeyScheduleWindowMessage,
} from '@/features/examinations/services/passkeyScheduleWindow';
import {
  OfflinePack,
  OfflineQueuedResult,
  OfflineStore,
  sanitizePackToActiveBanks,
} from '@/features/synchronization/services/offlineStore';
import { assertCloudInternetReachable } from '@/features/monitoring/services/wifiLanIp';
import type { ChoiceKey, Question, StudentRecord } from '@/shared/types';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  validateOfflineRoomAssignment,
  type OfflineRoomAuthority,
} from '@/features/examinations/services/offlineRoomAssignment';
import {
  matchOfflinePasskeyRegistrations,
  selectOfflinePasskeyRegistration,
  validateOfflinePasskeyEligibility,
} from '@/features/examinations/services/offlinePasskeyEligibility';
import { compareStudentNames } from '@/features/synchronization/utils/studentNameOrder';
import { normalizePasskey } from '@/features/examinations/services/passkeyFormat';

let queuedResultsSyncInProgress = false;

type OfflineResultSyncResponse = {
  success: boolean;
  message?: string;
  data?: {
    accepted_ids?: number[];
    accepted_client_ids?: string[];
    accepted_keys?: string[];
    created?: number;
    updated?: number;
    rejected?: Array<{
      client_local_id?: string;
      applicant_code?: string;
      reason?: string;
    }>;
  };
};

/** Pull typed exam code from plain text or METCC QR JSON. */
export function extractExaminationCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const code =
        parsed.examinationCode ?? parsed.exam_code ?? parsed.code ?? trimmed;
      return String(code).trim().toUpperCase();
    } catch {
      return trimmed.toUpperCase();
    }
  }
  return trimmed.toUpperCase();
}

function cloudBase(): string {
  return (getCloudApiBaseUrl() || getApiBaseUrl()).replace(/\/$/, '');
}

export function resultSyncFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'No Internet Connection: Results are saved locally and waiting to synchronize.';
    if (error.status === 401 || error.status === 403) return 'Authentication Expired: Please sign in again.';
    if (error.status === 422) {
      const payload = error.payload as OfflineResultSyncResponse | undefined;
      const reason = payload?.data?.rejected?.[0]?.reason;
      return reason
        ? `Result Not Synchronized: ${reason} The saved result is safe and can be retried.`
        : `${error.message} The saved result is safe and can be retried.`;
    }
    if (error.status === 429 || error.status >= 500) return 'Server Unavailable: Synchronization will automatically retry.';
  }
  if (error instanceof Error && /internet|network|connection|timed out|reach server/i.test(error.message)) {
    return 'No Internet Connection: Results are saved locally and waiting to synchronize.';
  }
  return 'The administrator server did not confirm this result. It remains saved locally for retry.';
}

export function isRetryableResultSyncError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof Error && /internet|network|connection|timed out|reach server/i.test(error.message);
}

async function cloudFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const base = cloudBase();
  assertSecureApiBase(base);
  const loopbackIssue = describeApiReachabilityProblem(base);
  if (loopbackIssue) {
    throw new Error(loopbackIssue);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  // Without this the request sits on the OS TCP timeout (~30–60s) when the phone
  // is on a different Wi‑Fi, so the student sees a frozen screen instead of a reason.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  let res: Response;
  let json: unknown;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    json = await res.json().catch(() => ({}));
  } catch {
    throw new Error(
      studentPackDownloadFailureMessage(
        base,
        `Cannot reach ${base}. Ensure Laravel listens on 0.0.0.0:8000 and the firewall allows port 8000.`,
      ),
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error(`[CLOUD FETCH] ${options.method ?? 'GET'} ${path} → HTTP ${res.status}`, json);
    const serverMsg = (json as { message?: string })?.message || '';
    throw new Error(
      serverMsg ||
        `Request failed (${res.status}).`,
    );
  }
  if (
    json &&
    typeof json === 'object' &&
    'success' in (json as object) &&
    (json as { success?: boolean }).success === false
  ) {
    console.error(`[CLOUD FETCH] ${options.method ?? 'GET'} ${path} → success:false`, json);
    throw new Error(
      (json as { message?: string })?.message ||
        `Request rejected by server (${res.status}).`,
    );
  }
  return json as T;
}

export function toChoiceRecord(
  options: any,
): Record<ChoiceKey, string> {
  const blank: Record<ChoiceKey, string> = { A: '', B: '', C: '', D: '' };
  if (!options) return blank;

  let opts = options;
  if (typeof opts === 'string') {
    try {
      opts = JSON.parse(opts);
    } catch {
      return blank;
    }
  }

  const extractText = (val: any): string => {
    if (val == null) return '';
    if (typeof val === 'string' || typeof val === 'number') return String(val).trim();
    if (typeof val === 'object') {
      return String(val.text ?? val.value ?? val.label ?? val.choice ?? val.option ?? '').trim();
    }
    return '';
  };

  if (Array.isArray(opts)) {
    opts.forEach((item, i) => {
      let key: ChoiceKey | null = null;
      let text = '';

      if (item && typeof item === 'object') {
        const itemKey = String(item.key ?? item.label ?? item.choice ?? '').trim().toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(itemKey)) {
          key = itemKey as ChoiceKey;
        }
        text = extractText(item);
      } else {
        text = extractText(item);
      }

      if (!key && i < 4) {
        key = String.fromCharCode(65 + i) as ChoiceKey;
      }

      if (key && ['A', 'B', 'C', 'D'].includes(key)) {
        blank[key] = text;
      }
    });
    return blank;
  }

  if (typeof opts === 'object') {
    (['A', 'B', 'C', 'D'] as ChoiceKey[]).forEach((k) => {
      const rawVal = opts[k] ?? opts[k.toLowerCase()];
      blank[k] = extractText(rawVal);
    });
    return blank;
  }

  return blank;
}

export function selectedQuestions(pack: OfflinePack): Array<{
  id: number;
  stem: string;
  options: Record<string, string> | string[] | null;
  correct_answer: string;
  category?: string;
}> {
  if (!pack.question_banks || !pack.question_banks.length) return [];

  // Only banks marked active by admin. Never fall back to inactive banks.
  const activeBanks = pack.question_banks.filter((b) =>
    Boolean(b.is_active) &&
    (!pack.active_question_bank_id || Number(b.id) === Number(pack.active_question_bank_id)),
  );
  if (!activeBanks.length) return [];

  const rows: Array<{
    id: number;
    stem: string;
    options: Record<string, string> | string[] | null;
    correct_answer: string;
    category?: string;
  }> = [];

  for (const bank of activeBanks) {
    for (const subject of bank.subjects ?? []) {
      if (subject.is_active === false) continue;
      for (const q of subject.questions ?? []) {
        if (q.is_selected_for_exam === false) continue;
        if (q.status && q.status !== 'active') continue;
        rows.push({
          id: q.id,
          stem: q.stem,
          options: q.options,
          correct_answer: q.correct_answer,
          category: subject.name,
        });
      }
    }
  }

  // If selected flags were missing from an older pack, still stay within active banks only.
  if (rows.length === 0) {
    for (const bank of activeBanks) {
      for (const subject of bank.subjects ?? []) {
        if (subject.is_active === false) continue;
        for (const q of subject.questions ?? []) {
          if (q.status && q.status !== 'active') continue;
          rows.push({
            id: q.id,
            stem: q.stem,
            options: q.options,
            correct_answer: q.correct_answer,
            category: subject.name,
          });
        }
      }
    }
  }

  return rows;
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Mirror the server ordering (ExamSessionService::questionsForSession): questions
 * stay grouped by category.
 */
function orderQuestionsByCategory<T extends { category?: string }>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.category || 'general';
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const ordered: T[] = [];
  for (const group of groups.values()) {
    ordered.push(...group);
  }
  return ordered;
}

/**
 * Build canonical question list from a pack. Shared across all nodes as the
 * single source of truth for the 100 questions.
 */
export function buildExamQuestions(pack: OfflinePack): Question[] {
  const ordered = orderQuestionsByCategory(selectedQuestions(pack));

  return ordered.map((q, index) => ({
    id: String(q.id),
    number: index + 1,
    subjectId: q.category || 'general',
    category: q.category,
    type: 'multiple_choice' as const,
    question: q.stem,
    choices: toChoiceRecord(q.options),
    correctAnswer: (String(q.correct_answer || 'A').toUpperCase().charAt(0) ||
      'A') as ChoiceKey,
    explanation: '',
  }));
}

export type ChoiceDisplayMap = Record<ChoiceKey, ChoiceKey>;

export type StudentExamPaper = {
  questions: Question[];
  /** display letter → original pack letter, per question id */
  choiceMaps: Record<string, ChoiceDisplayMap>;
};

function shuffleQuestionChoicesDeterministically(
  question: Question,
  choiceRng: () => number,
): {
  question: Question;
  displayToOriginal: ChoiceDisplayMap;
} {
  const keys = (['A', 'B', 'C', 'D'] as ChoiceKey[]).filter(
    (k) => String(question.choices?.[k] ?? '').trim() !== '',
  );
  const pool = keys.length >= 2 ? keys : (['A', 'B', 'C', 'D'] as ChoiceKey[]);
  const originalPairs = pool.map((key) => ({
    original: key,
    text: String(question.choices?.[key] ?? ''),
  }));
  const mixed = seededShuffle(originalPairs, choiceRng);
  const choices = { A: '', B: '', C: '', D: '' } as Record<ChoiceKey, string>;
  const displayToOriginal = { A: 'A', B: 'B', C: 'C', D: 'D' } as ChoiceDisplayMap;
  let correctAnswer: ChoiceKey = question.correctAnswer;

  mixed.forEach((pair, index) => {
    const display = pool[index] ?? (['A', 'B', 'C', 'D'] as ChoiceKey[])[index];
    if (!display) return;
    choices[display] = pair.text;
    displayToOriginal[display] = pair.original;
    if (pair.original === question.correctAnswer) {
      correctAnswer = display;
    }
  });

  return {
    question: {
      ...question,
      choices,
      correctAnswer,
    },
    displayToOriginal,
  };
}

/**
 * Build the paper for the set assigned by the authorized examination package.
 * Set labels and their order come from backend examination settings. The
 * legacy list is only used for packs created before set definitions existed.
 */
export function buildStudentExamPaper(
  pack: OfflinePack,
  examSet?: string,
): StudentExamPaper & { examSet: string } {
  const configuredSets = (pack.examination_settings?.exam_set_definitions ?? [])
    .map((label) => String(label).trim())
    .filter(Boolean);
  const availableSets = configuredSets.length > 0 ? configuredSets : ['Set 1', 'Set 2', 'Set 3', 'Set 4'];
  const requested = String(examSet ?? availableSets[0]).trim();
  const requestedIndex = availableSets.findIndex((label) => label.toLowerCase() === requested.toLowerCase());
  const numericIndex = Number.parseInt(requested.match(/\d+/)?.[0] ?? '', 10) - 1;
  const setIndex = requestedIndex >= 0
    ? requestedIndex
    : Number.isFinite(numericIndex) && numericIndex >= 0 && numericIndex < availableSets.length
      ? numericIndex
      : 0;
  const normalizedSetName = availableSets[setIndex];

  const baseQuestions = buildExamQuestions(pack);

  // Group by category to preserve category ordering
  const categoryGroups = new Map<string, Question[]>();
  for (const q of baseQuestions) {
    const cat = q.category || 'general';
    const group = categoryGroups.get(cat);
    if (group) group.push(q);
    else categoryGroups.set(cat, [q]);
  }

  const choiceMaps: Record<string, ChoiceDisplayMap> = {};
  const orderedQuestions: Question[] = [];

  let catIdx = 0;
  for (const [, catQuestions] of categoryGroups.entries()) {
    let questionsInCat = [...catQuestions];

    if (setIndex > 0) {
      const qRng = seededRandom(setIndex * 10007 + catIdx * 37 + 12345);
      questionsInCat = seededShuffle(questionsInCat, qRng);
    }

    for (const q of questionsInCat) {
      if (setIndex === 0) {
        // Set 1: Canonical choices A, B, C, D
        const displayToOriginal: ChoiceDisplayMap = { A: 'A', B: 'B', C: 'C', D: 'D' };
        choiceMaps[q.id] = displayToOriginal;
        orderedQuestions.push(q);
      } else {
        // Set 2, 3, 4: Deterministic choice shuffle
        const choiceRng = seededRandom(setIndex * 100003 + hashStringToInt(q.id) + 67891);
        const { question, displayToOriginal } = shuffleQuestionChoicesDeterministically(q, choiceRng);
        choiceMaps[question.id] = displayToOriginal;
        orderedQuestions.push(question);
      }
    }

    catIdx++;
  }

  const finalQuestions = orderedQuestions.map((q, index) => ({
    ...q,
    number: index + 1,
  }));

  return {
    questions: finalQuestions,
    choiceMaps,
    examSet: normalizedSetName,
  };
}

/** Map a student's display-letter answer back to the pack's original letter. */
export function toOriginalAnswerLetter(
  choiceMaps: Record<string, ChoiceDisplayMap> | undefined,
  questionId: string,
  displayLetter: string | null | undefined,
): string | null {
  if (displayLetter == null || displayLetter === '') return null;
  const letter = String(displayLetter).toUpperCase().charAt(0) as ChoiceKey;
  const mapped = choiceMaps?.[questionId]?.[letter];
  return mapped ?? letter;
}

export function grade(
  pack: OfflinePack,
  answers: Record<string, string | null>,
): Pick<
  OfflineQueuedResult,
  'score' | 'items_correct' | 'items_total' | 'result_status' | 'answers'
> {
  const qs = selectedQuestions(pack);
  const total = Math.max(1, qs.length);
  let correct = 0;
  const graded = qs.map((q) => {
    const selected = (answers[String(q.id)] ?? '').toString().toUpperCase();
    const isCorrect = selected !== '' && selected === String(q.correct_answer).toUpperCase();
    if (isCorrect) correct++;
    return {
      exam_question_id: q.id,
      selected_answer: selected || null,
      is_correct: isCorrect,
    };
  });
  const score = Math.round((correct / total) * 10000) / 100;
  const passing =
    Number((pack as { grading_settings?: Array<{ passing_percentage?: number }> }).grading_settings?.[0]
      ?.passing_percentage) > 0
      ? Number(
          (pack as { grading_settings?: Array<{ passing_percentage?: number }> }).grading_settings?.[0]
            ?.passing_percentage,
        )
      : 75;
  return {
    score,
    items_correct: correct,
    items_total: total,
    result_status: score >= passing ? 'passed' : 'failed',
    answers: graded,
  };
}

/**
 * Offline-first exam (no room PC):
 * 1) Online once: download pack from cloud into phone cache
 * 2) Offline: take / proctor from cache
 * 3) Online again: sync queued results to cloud
 */
export interface OfflinePasskeyValidationResult {
  classification: PasskeyMatchClassification;
  message?: string;
  student?: StudentRecord;
  schedule?: {
    id?: number;
    title?: string;
    exam_date?: string;
    time_slot?: string;
    session_type?: 'regular' | 'rescheduled';
    reschedule_state?: 'proposed' | 'confirmed' | 'review_required' | null;
    schedule_revision?: number;
  };
}

export type OfflinePasskeyAuthority =
  | number
  | (OfflineRoomAuthority & { source: 'peer_session' });

export const OfflineExamRepository = {
  async downloadPackFromCloud(
    examDate?: string,
    options?: {
      includeAuth?: boolean;
      onProgress?: (progress: { percent: number; label: string }) => void;
    },
  ): Promise<OfflinePack> {
    const report = (percent: number, label: string) => {
      try {
        options?.onProgress?.({ percent, label });
      } catch {
        // UI progress must never break the download.
      }
    };

    report(5, 'Connecting…');

    // The authenticated proctor endpoint returns only this account's assigned
    // schedules, rooms, registrations, and applicants.
    const currentYear = new Date().getFullYear();
    if (examDate) {
      const dateYear = parseInt(examDate.slice(0, 4), 10);
      if (!isNaN(dateYear) && dateYear > currentYear) {
        throw new Error('This schedule date is in a future calendar year and cannot be downloaded.');
      }
    }

    const params = new URLSearchParams();
    if (examDate) params.set('exam_date', examDate);
    if (options?.includeAuth) params.set('include_auth', '1');
    const q = params.toString() ? `?${params.toString()}` : '';

    report(20, 'Downloading exam pack…');
    const json = await apiRequest<{
      success: boolean;
      data: OfflinePack & { proctors?: unknown };
    }>(`/proctor/exam-day-pack${q}`, {
      baseUrl: getCloudApiBaseUrl() || getApiBaseUrl(),
      timeoutMs: 12000,
    });
    if (!json.data) throw new Error('Cloud returned an empty exam pack.');
    if (!Array.isArray(json.data.schedules) || !Array.isArray(json.data.registrations)) {
      throw new Error('Cloud returned an invalid examination pack. Your existing pack was preserved.');
    }
    if (json.data.schedules.length === 0) {
      throw new Error('Cloud returned no examination schedules. Your existing downloaded pack was preserved.');
    }

    report(55, 'Processing students and questions…');
    if (options?.includeAuth && json.data.proctors) {
      report(65, 'Caching proctor accounts…');
      const { ProctorAuthCache } = await import('@/features/authentication/services/proctorAuthCache');
      await ProctorAuthCache.saveFromPackProctors(json.data.proctors);
    }

    // Never leave password hashes in the on-disk exam pack (student devices).
    // Also drop inactive banks — cloud may still export them until Hostinger is updated.
    const { proctors: _proctors, ...rawPack } = json.data;
    const safePack = sanitizePackToActiveBanks(rawPack as OfflinePack);
    report(80, 'Saving securely on this phone…');
    await OfflineStore.savePack(safePack);
    try {
      const { persistDisconnectGraceSeconds } = await import('@/shared/utils/gracePeriod');
      await persistDisconnectGraceSeconds(safePack.examination_settings?.disconnect_grace_seconds);
    } catch {
      // Non-fatal: devices fall back to default limit.
    }
    try {
      const { useProctorStore } = await import('@/features/proctors/stores/proctorStore');
      const live = useProctorStore.getState().profile;
      if (live?.token) {
        await OfflineStore.bundleProctorSession(live);
      }
    } catch {
      // Pack is still usable without a bundled session.
    }
    report(100, 'Download complete');
    try {
      const params = new URLSearchParams();
      if (examDate) params.set('exam_date', examDate);
      const at = await appStorage.getItem(STORAGE_KEYS.offlinePackAt);
      if (at) params.set('since', at);
      const q = params.toString() ? `?${params.toString()}` : '';
      const statusJson = await apiRequest<{
        success: boolean;
        data?: { content_fingerprint?: string };
      }>(`/proctor/exam-day-pack-status${q}`, {
        baseUrl: getCloudApiBaseUrl() || getApiBaseUrl(),
        timeoutMs: 12000,
      });
      if (statusJson.data?.content_fingerprint) {
        await appStorage.setItem(
          'tcc.offline.pack.content_fingerprint',
          statusJson.data.content_fingerprint,
        );
      }
    } catch {
      // Fingerprint cache is optional.
    }
    return safePack;
  },

  /**
   * Ask the cloud whether the local pack is stale (new reschedules / roster changes).
   */
  async checkPackUpdateStatus(options?: {
    examDate?: string;
  }): Promise<{
    updateRequired: boolean;
    packRevision: number | null;
    rescheduledSince: number;
    rescheduledToday: number;
    questionsChangedSince: number;
    questionsChangedToday: number;
    registrationCount: number;
    reason: 'reschedule' | 'questions' | 'fingerprint' | 'stale_day' | null;
    message: string;
    contentFingerprint?: string;
  }> {
    const todayCheck = await OfflineStore.isPackDownloadedToday();
    if (!todayCheck.downloadedToday) {
      return {
        updateRequired: true,
        packRevision: null,
        rescheduledSince: 0,
        rescheduledToday: 0,
        questionsChangedSince: 0,
        questionsChangedToday: 0,
        registrationCount: 0,
        reason: 'stale_day',
        message: "Download or update today's exam pack before opening rooms.",
      };
    }

    const network = await Network.getNetworkStateAsync().catch(() => null);
    if (network?.isInternetReachable !== true) {
      return {
        updateRequired: false,
        packRevision: null,
        rescheduledSince: 0,
        rescheduledToday: 0,
        questionsChangedSince: 0,
        questionsChangedToday: 0,
        registrationCount: 0,
        reason: null,
        message: 'Offline mode: using the downloaded exam pack.',
      };
    }

    const since = (await appStorage.getItem(STORAGE_KEYS.offlinePackAt)) || undefined;
    const fingerprint =
      (await appStorage.getItem('tcc.offline.pack.content_fingerprint')) || undefined;

    const params = new URLSearchParams();
    if (options?.examDate) params.set('exam_date', options.examDate);
    if (since) params.set('since', since);
    if (fingerprint) params.set('fingerprint', fingerprint);
    const q = params.toString() ? `?${params.toString()}` : '';

    try {
      const json = await apiRequest<{
        success: boolean;
        data?: {
          update_required?: boolean;
          rescheduled_since?: number;
          rescheduled_today?: number;
          questions_changed_since?: number;
          questions_changed_today?: number;
          registration_count?: number;
          reason?: 'reschedule' | 'questions' | 'fingerprint' | null;
          content_fingerprint?: string;
          pack_revision?: number;
        };
      }>(`/proctor/exam-day-pack-status${q}`, {
        baseUrl: getCloudApiBaseUrl() || getApiBaseUrl(),
        timeoutMs: 5000,
      });

      const data = json.data ?? {};
      const packRevision = Number.isFinite(Number(data.pack_revision))
        ? Number(data.pack_revision)
        : null;
      const rescheduledSince = Number(data.rescheduled_since ?? 0);
      const rescheduledToday = Number(data.rescheduled_today ?? 0);
      const questionsChangedSince = Number(data.questions_changed_since ?? 0);
      const questionsChangedToday = Number(data.questions_changed_today ?? 0);
      const updateRequired =
        Boolean(data.update_required) ||
        rescheduledSince > 0 ||
        questionsChangedSince > 0;
      if (data.content_fingerprint) {
        await appStorage.setItem(
          'tcc.offline.pack.cloud_fingerprint',
          data.content_fingerprint,
        );
      }

      let message = 'Exam pack is up to date.';
      let reason: 'reschedule' | 'questions' | 'fingerprint' | null = null;
      if (updateRequired) {
        if (
          data.reason === 'reschedule' ||
          rescheduledSince > 0 ||
          rescheduledToday > 0
        ) {
          reason = 'reschedule';
          const n = rescheduledSince || rescheduledToday;
          message =
            n > 0
              ? `${n} applicant(s) were rescheduled since your last download. Tap Update Exam Pack.`
              : 'Applicants were rescheduled. Tap Update Exam Pack to refresh the roster.';
        } else if (
          data.reason === 'questions' ||
          questionsChangedSince > 0 ||
          questionsChangedToday > 0
        ) {
          reason = 'questions';
          const n = questionsChangedSince || questionsChangedToday;
          message =
            n > 0
              ? `${n} question(s) were added or updated since your last download. Tap Update Exam Pack.`
              : 'Questions were added or updated. Tap Update Exam Pack to refresh the module.';
        } else {
          reason = data.reason === 'fingerprint' ? 'fingerprint' : 'questions';
          message = 'Exam pack changed on the server. Tap Update Exam Pack to refresh.';
        }
      }

      return {
        updateRequired,
        packRevision,
        rescheduledSince,
        rescheduledToday,
        questionsChangedSince,
        questionsChangedToday,
        registrationCount: Number(data.registration_count ?? 0),
        reason: updateRequired ? reason : null,
        message,
        contentFingerprint: data.content_fingerprint,
      };
    } catch {
      return {
        updateRequired: false,
        packRevision: null,
        rescheduledSince: 0,
        rescheduledToday: 0,
        questionsChangedSince: 0,
        questionsChangedToday: 0,
        registrationCount: 0,
        reason: null,
        message: 'Could not reach the server to check for pack updates.',
      };
    }
  },

  async getCachedSchedules() {
    const pack = await OfflineStore.getPack();
    if (!pack) return [];
    const downloadedAt = pack.downloaded_at ?? (await OfflineStore.getPackMeta()).at ?? undefined;
    // Group by date + title so different exams on the same day are distinct.
    const map = new Map<string, any>();
    for (const s of pack.schedules) {
      const date = s.exam_date || 'unknown';
      const title = s.title || 'Entrance Examination';
      const key = `date-${date}-${title.replace(/\s+/g, '-')}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: title,
          schoolYear: s.academic_year || date.slice(0, 4) || String(new Date().getFullYear()),
          examinationDate: date,
          examinationDateIso: date,
          batchCount: 0,
          description: s.venue,
          timeLabel: s.time_slot,
          batchNumber: s.batch_code,
          venue: s.venue,
          offlineReady: true,
          packVersion: pack.pack_version,
          downloadedAt,
          status: 'ready',
        });
      }
      const item = map.get(key)!;
      item.batchCount += 1;

      // For multiple sessions, we clear specific fields to show the generic group card.
      if (item.batchCount > 1) {
        item.timeLabel = undefined;
        item.batchNumber = undefined;
        item.description = s.venue || item.description;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      String(b.examinationDateIso).localeCompare(String(a.examinationDateIso)),
    );
  },

  async getStudentsForSchedule(scheduleId: string) {
    const pack = await OfflineStore.getPack();
    if (!pack) return [];
    const sid = Number(String(scheduleId).replace(/^offline-/, ''));
    if (!sid) return [];
    const claims = new Set(await OfflineStore.getLocalClaims());
    const regs = pack.registrations.filter(
      (r) => Number(r.examination_schedule_id) === sid,
    );
    return regs.map((r) => {
      const a = pack.applicants.find((x) => Number(x.id) === Number(r.applicant_id));
      const name = (a?.name || '').trim() || 'Student';
      const id = String(a?.id ?? r.applicant_id);
      const claimed = claims.has(id);
      return {
        id,
        studentId: a?.applicant_code || String(r.applicant_id),
        firstName: a?.first_name || '',
        middleName: a?.middle_name || '',
        lastName: a?.last_name || '',
        fullName: name,
        email: a?.gmail || a?.email || '',
        programId: a?.course_applied || '',
        programCode: a?.course_applied || '',
        programName: a?.course_applied || '',
        sex: 'Male' as const,
        avatarInitials: name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0] || '')
          .join('')
          .toUpperCase(),
        registration_id: r.id,
        selectable: !claimed,
        selectionStatus: claimed ? ('ready' as const) : ('available' as const),
        statusLabel: claimed ? 'Ready' : 'Not scanned',
      };
    }).sort((left, right) => compareStudentNames(
      { firstName: left.firstName, middleName: left.middleName, lastName: left.lastName, id: Number(left.registration_id) },
      { firstName: right.firstName, middleName: right.middleName, lastName: right.lastName, id: Number(right.registration_id) },
    ));
  },

  /**
   * Validate a student examination key against the offline pack.
   * Resolves the schedule from (in order):
   * 1) explicit peer host authority (schedule + room)
   * 2) opened-room map for modern codes like K7M2P9QX
   * 3) legacy OFF-{scheduleId}[-R{roomId}] codes
   */
  async validatePasskey(
    examinationCode: string,
    passkey: string,
    authorityOverride?: OfflinePasskeyAuthority | null,
  ): Promise<OfflinePasskeyValidationResult | null> {
    const pack = await OfflineStore.getPack();
    if (!pack) return null;

    let scheduleId: number | null =
      typeof authorityOverride === 'number' && Number.isFinite(authorityOverride)
        ? Number(authorityOverride)
        : authorityOverride && typeof authorityOverride === 'object'
          ? Number(authorityOverride.scheduleId)
          : null;
    let targetRoomId: number | null =
      authorityOverride && typeof authorityOverride === 'object'
        ? authorityOverride.roomId
        : null;

    if (scheduleId == null) {
      const opened = await OfflineStore.findOpenedRoomByCode(examinationCode);
      if (opened) {
        scheduleId = opened.scheduleId;
        targetRoomId = opened.roomId;
      } else {
        const parsed = this.parseOfflineCode(examinationCode);
        if (parsed) {
          scheduleId = parsed.scheduleId;
          targetRoomId = parsed.roomId;
        }
      }
    }

    if (scheduleId == null) return null;

    const scheduleRegistrations = pack.registrations.filter(
      (registration) => Number(registration.examination_schedule_id) === scheduleId,
    );
    const scheduleHasPasskeyData = scheduleRegistrations.some(
      (registration) =>
        /^[0-9a-f]{64}$/i.test(String(registration.exam_passkey_hash || '')) ||
        Boolean(String(registration.exam_passkey || '').trim()),
    );
    if (scheduleRegistrations.length > 0 && !scheduleHasPasskeyData) {
      return {
        classification: 'invalid',
        message:
          'Passkey records are missing from the proctor phone examination pack. Ask the proctor to update the pack and reopen this room.',
      };
    }

    const normalized = normalizePasskey(passkey);
    const normalizedHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      normalized,
    );
    const matches = matchOfflinePasskeyRegistrations(
      pack.registrations,
      normalized,
      normalizedHash,
    );
    if (!matches.length) return null;

    const matchingScheduleIds = matches.map((r) => String(r.examination_schedule_id ?? ''));
    const classification = classifyPasskeyMatch({
      currentScheduleId: scheduleId,
      matchingScheduleIds,
    });

    if (classification !== 'valid') {
      const otherScheduleId = matchingScheduleIds.find(
        (value) => Number(value) !== scheduleId,
      );
      const otherSchedule = otherScheduleId
        ? pack.schedules.find((s) => Number(s.id) === Number(otherScheduleId))
        : undefined;
      const currentSchedule = pack.schedules.find((s) => Number(s.id) === scheduleId);
      const wrongDate = Boolean(
        otherSchedule?.exam_date &&
          currentSchedule?.exam_date &&
          String(otherSchedule.exam_date).slice(0, 10) !==
            String(currentSchedule.exam_date).slice(0, 10),
      );
      return {
        classification,
        message:
          classification === 'wrong_schedule'
            ? 'You are not scheduled for this examination session. Please check your assigned examination date and time.'
            : 'Invalid examination key for this session.',
        schedule: otherSchedule
          ? {
              id: otherSchedule.id,
              title: otherSchedule.title,
              exam_date: otherSchedule.exam_date,
              time_slot: otherSchedule.time_slot,
              session_type: otherSchedule.session_type,
              reschedule_state: otherSchedule.reschedule_state,
              schedule_revision: otherSchedule.schedule_revision,
            }
          : undefined,
      };
    }

    const reg = selectOfflinePasskeyRegistration(matches, scheduleId);
    if (!reg) return null;

    // Laravel rescheduling moves this same registration row. Selecting another
    // row only by applicant ID can substitute a different schedule or room and
    // reject the exact registration whose passkey hash matched.
    const a = pack.applicants.find((x) => Number(x.id) === Number(reg.applicant_id));
    if (!a) return null;
    const name = (a.name || '').trim() || 'Student';
    const parts = name.trim().split(/\s+/);
    const schedule = pack.schedules.find((s) => Number(s.id) === scheduleId);
    if (!schedule) return null;

    const roomDecision = validateOfflineRoomAssignment({
      schedule,
      registration: reg,
      authority: { scheduleId, roomId: targetRoomId },
    });
    if (!roomDecision.ok) {
      return {
        classification:
          roomDecision.code === 'wrong_schedule' ? 'wrong_schedule' : 'invalid',
        message: roomDecision.message,
        schedule: {
          id: schedule.id,
          title: schedule.title,
          exam_date: schedule.exam_date,
          time_slot: schedule.time_slot,
          session_type: schedule.session_type,
          reschedule_state: schedule.reschedule_state,
          schedule_revision: schedule.schedule_revision,
        },
      };
    }

    const eligibility = validateOfflinePasskeyEligibility(reg);
    if (!eligibility.ok) {
      return {
        classification: eligibility.classification,
        message: eligibility.message,
        schedule: {
          id: schedule.id,
          title: schedule.title,
          exam_date: schedule.exam_date,
          time_slot: schedule.time_slot,
          session_type: schedule.session_type,
          reschedule_state: schedule.reschedule_state,
          schedule_revision: schedule.schedule_revision,
        },
      };
    }

    const windowState = getPasskeyScheduleWindowState(schedule);
    if (windowState !== 'valid') {
      return {
        classification: 'invalid',
        message: windowState === 'invalid'
          ? 'This examination key has no valid schedule window.'
          : passkeyScheduleWindowMessage(schedule, windowState),
        schedule: {
          id: schedule.id,
          title: schedule.title,
          exam_date: schedule.exam_date,
          time_slot: schedule.time_slot,
          session_type: schedule.session_type,
          reschedule_state: schedule.reschedule_state,
          schedule_revision: schedule.schedule_revision,
        },
      };
    }

    const studentRecord: StudentRecord = {
      id: String(a.id),
      studentId: a.applicant_code || String(a.id),
      firstName: parts[0] || name,
      middleName: '',
      lastName: parts.slice(1).join(' ') || '',
      fullName: name,
      email: a.gmail || a.email || '',
      programId: a.course_applied || '',
      programCode: a.course_applied || '',
      programName: a.course_applied || '',
      sex: 'Male' as const,
      avatarInitials: name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] || '')
        .join('')
        .toUpperCase(),
      registration_id: reg.id,
      selectionStatus: 'ready' as const,
      // Keep the backend assignment as provenance. The paper builder may use
      // its legacy Set 1 fallback for old packs, but sync must not claim that
      // fallback was an assigned set when the registration has no assignment.
      examSet: reg.exam_set || undefined,
      selectable: true,
    };

    const scheduleObj = {
      id: schedule.id,
      title: schedule.title,
      exam_date: schedule.exam_date,
      time_slot: schedule.time_slot,
      session_type: schedule.session_type,
      reschedule_state: schedule.reschedule_state,
      schedule_revision: schedule.schedule_revision,
    };

    // Check if this applicant has already completed this examination schedule
    const codeUpper = (a.applicant_code || '').trim().toUpperCase();
    const existingResults = await OfflineStore.getResults();
    const alreadySubmitted = existingResults.some((r) => {
      const matchCode = (r.applicant_code || '').trim().toUpperCase() === codeUpper;
      const matchSched = Number(r.examination_schedule_id) === Number(scheduleId);
      return matchCode && matchSched;
    });

    if (alreadySubmitted) {
      return {
        classification: 'already_completed',
        message: 'Examination Already Completed\nYou have already taken this examination. Multiple attempts are not permitted.',
        student: studentRecord,
        schedule: scheduleObj,
      };
    }

    return {
      classification: 'valid',
      student: studentRecord,
      schedule: scheduleObj,
    };
  },

  /** Re-check a previously admitted peer student before resume/content access. */
  async validateRegistrationRoom(
    registrationId: number,
    authority: OfflineRoomAuthority,
  ) {
    const pack = await OfflineStore.getPack();
    if (!pack) {
      return {
        ok: false as const,
        code: 'assignment_data_unavailable' as const,
        recoveryRequired: true,
        message:
          'The examination pack is unavailable on the proctor phone. Ask the proctor to update the examination pack and reopen this room.',
      };
    }
    const schedule = pack.schedules.find(
      (candidate) => Number(candidate.id) === Number(authority.scheduleId),
    );
    const registration = pack.registrations.find(
      (candidate) => Number(candidate.id) === Number(registrationId),
    );
    if (!registration) {
      return {
        ok: false as const,
        code: 'assignment_data_unavailable' as const,
        recoveryRequired: true,
        message:
          'This registration is not present in the proctor phone’s examination pack. Ask the proctor to update the examination pack and reopen this room.',
      };
    }
    return validateOfflineRoomAssignment({ schedule, registration, authority });
  },

  async getLobbyStudentsForSchedule(_scheduleId: string) {
    // Waiting list = students who actually joined (handled by PeerExamServer).
    // Never pre-fill from the full offline roster.
    return [];
  },

  async getQuestions(): Promise<Question[]> {
    const pack = await OfflineStore.getPack();
    if (!pack) throw new Error('No offline exam pack. Download while online first.');
    return buildExamQuestions(pack);
  },

  /**
   * Same alphabet as Laravel ExamSessionService::generateUniqueCode —
   * 8 chars, no ambiguous I/O/0/1.
   */
  generateExamCode(existing: Set<string> = new Set()): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)]!;
      }
      if (!existing.has(code)) return code;
    }
    return `X${Date.now().toString(36).slice(-7).toUpperCase()}`;
  },

  /** Legacy OFF-12-R3 still accepted for older QRs. */
  parseOfflineCode(code: string): { scheduleId: number; roomId: number | null } | null {
    const m = code
      .trim()
      .toUpperCase()
      .match(/^OFF-(\d+)(?:-R(\d+))?$/);
    if (!m) return null;
    return {
      scheduleId: Number(m[1]),
      roomId: m[2] ? Number(m[2]) : null,
    };
  },

  /** @deprecated Prefer generateExamCode + OfflineStore.setOpenedRoom */
  makeOfflineCode(scheduleId: string | number, roomId?: string | number | null): string {
    const sid = String(scheduleId).replace(/^offline-/, '');
    if (roomId != null && String(roomId).trim() !== '') {
      return `OFF-${sid}-R${roomId}`;
    }
    return `OFF-${sid}`;
  },

  offlineQrPayload(code: string, scheduleId: string | number, roomId?: string | number | null): string {
    return JSON.stringify({
      v: 1,
      type: 'metcc_offline',
      code,
      examinationCode: code,
      schedule_id: Number(String(scheduleId).replace(/^offline-/, '')),
      room_id: roomId != null ? Number(roomId) : null,
    });
  },

  async resolveScheduleRoom(
    scheduleId: number,
    roomId: number | null,
    examCode: string,
  ) {
    const pack = await OfflineStore.getPack();
    if (!pack) return null;
    const schedule = pack.schedules.find((s) => Number(s.id) === scheduleId);
    if (!schedule) return null;

    const rooms = schedule.rooms ?? [];
    const room =
      (roomId != null ? rooms.find((r) => Number(r.id) === roomId) : null) ??
      rooms[0] ??
      null;

    const examDate = schedule.exam_date || '';
    const title = schedule.title || 'Entrance Examination';
    const sid = `date-${examDate}-${title.replace(/\s+/g, '-')}`;

    return {
      valid: true as const,
      schedule: {
        id: sid,
        name: schedule.title,
        schoolYear: schedule.batch_code || '',
        examinationDate: schedule.exam_date || '',
        examinationDateIso: schedule.exam_date || '',
        batchCount: 1,
        sessionType: schedule.session_type || 'regular',
        rescheduleState: schedule.reschedule_state ?? null,
        scheduleRevision: Number(schedule.schedule_revision ?? 1),
      },
      session: {
        id: `offline-${schedule.id}${room ? `-r${room.id}` : ''}`,
        scheduleId: sid,
        roomId: room ? String(room.id) : null,
        roomName: room?.room_name,
        timeLabel: schedule.time_slot || 'Offline exam',
        startTime: schedule.start_time || '',
        endTime: schedule.end_time || '',
        venue: room?.room_name || schedule.venue || 'Offline',
        batchNumber: schedule.batch_code || '',
        sessionType: schedule.session_type || 'regular',
        rescheduleState: schedule.reschedule_state ?? null,
        scheduleRevision: Number(schedule.schedule_revision ?? 1),
        registeredStudents: pack.registrations.filter(
          (r) => Number(r.examination_schedule_id) === Number(schedule.id),
        ).length,
        durationMinutes: pack.examination_settings?.duration_minutes ?? 60,
        totalQuestions: selectedQuestions(pack).length,
        examinationCode: examCode,
      },
      examinationCode: examCode,
      message: room
        ? `Examination ready for ${room.room_name}.`
        : 'Examination ready on this device.',
    };
  },

  async resolveOfflineCode(code: string): Promise<{
    valid: boolean;
    message?: string;
    schedule?: any;
    session?: any;
    examinationCode?: string;
  } | null> {
    const extracted = extractExaminationCode(code);

    // Prefer explicitly opened rooms (normal codes like K7M2P9QX).
    const opened = await OfflineStore.findOpenedRoomByCode(extracted);
    if (opened) {
      if (opened.status === 'ended') {
        return {
          valid: false,
          message: 'This examination has already ended and is no longer available for applicants.',
        };
      }
      return this.resolveScheduleRoom(opened.scheduleId, opened.roomId, opened.code);
    }

    // Legacy OFF-* codes.
    const parsed = this.parseOfflineCode(extracted);
    if (!parsed) return null;
    const examCode = this.makeOfflineCode(parsed.scheduleId, parsed.roomId);
    return this.resolveScheduleRoom(parsed.scheduleId, parsed.roomId, examCode);
  },

  durationMinutes(): Promise<number> {
    return OfflineStore.getPack().then(
      (p) => p?.examination_settings?.duration_minutes ?? 60,
    );
  },

  async submitLocal(input: {
    scheduleId: string;
    applicantCode: string;
    applicantName?: string;
    answers: Record<string, string | null>;
  }): Promise<OfflineQueuedResult> {
    const pack = await OfflineStore.getPack();
    if (!pack) throw new Error('No offline pack on this device.');
    const graded = grade(pack, input.answers);
    const uuid =
      typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    let scheduleId = Number(input.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      const { resolveNumericScheduleId } = await import(
        '@/features/examinations/services/peerExamServer'
      );
      scheduleId = resolveNumericScheduleId(input.scheduleId, pack, input.applicantCode);
    }
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      throw new Error('The examination schedule is invalid. The result was not queued.');
    }
    const applicant = pack.applicants.find(
      (row) => row.applicant_code.trim().toUpperCase() === input.applicantCode.trim().toUpperCase(),
    );
    const registration = applicant
      ? pack.registrations.find(
          (row) =>
            Number(row.applicant_id) === Number(applicant.id) &&
            Number(row.examination_schedule_id) === scheduleId,
        )
      : undefined;
    if (!registration) {
      throw new Error('This student is not assigned to the selected examination. The result was not queued.');
    }
    const row: OfflineQueuedResult = {
      local_id: uuid,
      applicant_code: input.applicantCode,
      examination_schedule_id: scheduleId,
      examination_room_id: registration.assigned_room_id ?? null,
      question_bank_id: pack.active_question_bank_id ?? null,
      applicant_name: input.applicantName,
      attendance_status: 'present',
      exam_set: registration.exam_set ?? undefined,
      ...graded,
      submitted_at: new Date().toISOString(),
      synced: false,
      sync_status: 'pending',
      sync_error: null,
    };
    await OfflineStore.queueResult(row);
    return row;
  },

  async syncQueuedToCloud(): Promise<{ synced: number; message: string }> {
    if (queuedResultsSyncInProgress) {
      return { synced: 0, message: 'Result synchronization is already in progress.' };
    }
    queuedResultsSyncInProgress = true;
    try {
      const pending = await OfflineStore.pendingResults();
      if (!pending.length) {
        return { synced: 0, message: 'No offline results waiting to sync.' };
      }

      const pack = await OfflineStore.getPack();
      const hasInvalidSchedule = pending.some((result) =>
        !Number.isInteger(Number(result.examination_schedule_id)) ||
        Number(result.examination_schedule_id) <= 0,
      );
      const resolveScheduleId =
        pack && hasInvalidSchedule
          ? (await import('@/features/examinations/services/peerExamServer')).resolveNumericScheduleId
          : null;
      const validPending = pending
        .map((result) => {
          let scheduleId = Number(result.examination_schedule_id);
          if ((!Number.isInteger(scheduleId) || scheduleId <= 0) && pack && resolveScheduleId) {
            scheduleId = resolveScheduleId(
              result.examination_schedule_id,
              pack,
              result.applicant_code,
            );
          }
          return { ...result, examination_schedule_id: scheduleId };
        })
        .filter(
          (result) =>
            Number.isInteger(result.examination_schedule_id) &&
            result.examination_schedule_id > 0,
        );

      const validIds = new Set(validPending.map((result) => result.local_id));
      const invalidIds = pending
        .filter((result) => !validIds.has(result.local_id))
        .map((result) => result.local_id);
      await OfflineStore.updateResultSyncStatus(
        invalidIds,
        'failed',
        'Invalid Result Data: The examination schedule could not be identified. The saved result was preserved for recovery.',
      );

      if (!validPending.length) {
        throw new Error(
          'Invalid Result Data: No queued result has a valid examination schedule. The local results were preserved for recovery.',
        );
      }

      const syncingIds = validPending.map((result) => result.local_id);
      await OfflineStore.updateResultSyncStatus(syncingIds, 'syncing');

      console.log(`[SYNC AUDIT START] Sending ${validPending.length} queued result(s) to cloud server...`);

      const payload = {
        results: validPending.map((result) => ({
          client_local_id: result.local_id,
          applicant_code: result.applicant_code,
          examination_schedule_id: result.examination_schedule_id,
          examination_room_id: result.examination_room_id ?? null,
          question_bank_id: result.question_bank_id ?? null,
          exam_set: result.exam_set || null,
          submitted_at: result.submitted_at,
          answers: result.answers.map(({ exam_question_id, selected_answer }) => ({
            exam_question_id,
            selected_answer,
          })),
        })),
      };

      let json: OfflineResultSyncResponse;
      try {
        await assertCloudInternetReachable();
        json = await apiRequest<OfflineResultSyncResponse>('/proctor/sync/offline-results', {
          method: 'POST',
          body: payload,
          auth: true,
          baseUrl: cloudBase(),
        });
      } catch (error) {
        console.error('[SYNC AUDIT ERROR] Network request failed:', error);
        await OfflineStore.updateResultSyncStatus(
          syncingIds,
          'failed',
          resultSyncFailureMessage(error),
        );
        throw error;
      }

      console.log(`[SYNC AUDIT] Server response success=${json.success} accepted_client_ids=${(json.data?.accepted_client_ids ?? []).length}`);

      const acceptedClient = new Set(json.data?.accepted_client_ids ?? []);
      const syncedIds = validPending
        .filter((result) => acceptedClient.has(result.local_id))
        .map((result) => result.local_id);

      if (syncedIds.length === 0 || json.success === false) {
        const serverMsg = json.message || 'Server rejected all records in batch.';
        const rejectedList = json.data?.rejected ?? [];
        const rejectionById: Record<string, string> = {};
        for (const result of rejectedList) {
          if (result.client_local_id) {
            rejectionById[result.client_local_id] =
              `Invalid Result Data: ${result.reason ?? 'The result was rejected by the server.'}`;
          }
        }
        const rejectionDetails = rejectedList.length > 0
          ? ` Rejection Reasons: ${rejectedList.map((result) => `${result.applicant_code ?? 'Unknown student'}: ${result.reason ?? 'Invalid result data'}`).join('; ')}`
          : '';

        console.error(`[SYNC AUDIT FAILURE] 0 records accepted. Server Message: ${serverMsg}.${rejectionDetails}`, json);
        await OfflineStore.updateResultSyncStatus(
          syncingIds,
          'failed',
          Object.keys(rejectionById).length
            ? rejectionById
            : `Invalid Result Data: ${serverMsg}.${rejectionDetails}`,
        );
        throw new Error(`Invalid Result Data: No results were accepted. ${serverMsg}${rejectionDetails}`);
      }

      await OfflineStore.markSynced(syncedIds);
      const failedIds = syncingIds.filter((id) => !syncedIds.includes(id));
      const skipped = validPending.length - syncedIds.length;
      const rejectedList = json.data?.rejected ?? [];
      const rejectionById: Record<string, string> = {};
      for (const result of rejectedList) {
        if (result.client_local_id) {
          rejectionById[result.client_local_id] =
            `Invalid Result Data: ${result.reason ?? 'The result was rejected by the server.'}`;
        }
      }
      const rejectionDetails = rejectedList.length > 0
        ? rejectedList.map((result) => `${result.applicant_code ?? 'Unknown student'}: ${result.reason ?? 'Invalid result data'}`).join('; ')
        : '';
      await OfflineStore.updateResultSyncStatus(
        failedIds,
        'failed',
        skipped > 0
          ? Object.keys(rejectionById).length
            ? rejectionById
            : `Invalid Result Data: ${rejectionDetails || 'The server did not accept this result.'}`
          : null,
      );

      const auditMsg = skipped > 0
        ? `Partial Sync: ${syncedIds.length} result(s) confirmed by the server; ${skipped} remain saved locally. ${rejectionDetails}`
        : `Synchronization Successful: ${syncedIds.length} examination result(s) were confirmed by the server.`;

      console.log(`[SYNC AUDIT COMPLETE] ${auditMsg}`);

      return {
        synced: syncedIds.length,
        message: auditMsg,
      };
    } finally {
      queuedResultsSyncInProgress = false;
    }
  },

  /**
   * FIX 9: RECOVERY TOOL — Scans OfflineStore, repairs corrupt schedule IDs using offline pack,
   * resets sync flags for unsynced records, and resends.
   */
  async recoverAndResendUnsynced(): Promise<{
    scanned: number;
    repaired: number;
    synced: number;
    message: string;
  }> {
    console.log('[RECOVERY TOOL] Scanning OfflineStore for unsynced or corrupt results...');
    const all = await OfflineStore.getResults();
    const pack = await OfflineStore.getPack();
    const { resolveNumericScheduleId } = require('@/features/examinations/services/peerExamServer');

    let repaired = 0;
    const fixedRows = all.map((row) => {
      let schedId = Number(row.examination_schedule_id);
      if (!Number.isInteger(schedId) || schedId <= 0) {
        schedId = resolveNumericScheduleId(row.examination_schedule_id, pack, row.applicant_code);
        if (schedId <= 0 && pack?.registrations && pack.applicants) {
          const app = pack.applicants.find((a) => a.applicant_code === row.applicant_code);
          if (app) {
            const reg = pack.registrations.find((r) => Number(r.applicant_id) === Number(app.id));
            if (reg && Number(reg.examination_schedule_id) > 0) {
              schedId = Number(reg.examination_schedule_id);
            }
          }
        }
        if (schedId <= 0 && pack?.schedules?.length === 1 && Number(pack.schedules[0].id) > 0) {
          schedId = Number(pack.schedules[0].id);
        }

        if (schedId > 0) {
          repaired++;
        }
      }

      return {
        ...row,
        examination_schedule_id: schedId > 0 ? schedId : row.examination_schedule_id,
        synced: false, // Reset synced flag to force re-evaluation by sync worker
        sync_status: 'pending' as const,
        sync_error: null,
        synced_at: null,
      };
    });

    if (repaired > 0 || all.length > 0) {
      await OfflineStore.saveResults(fixedRows);
      console.log(`[RECOVERY TOOL] Repaired ${repaired} record(s) out of ${all.length} total record(s).`);
    }

    const syncRes = await this.syncQueuedToCloud();
    return {
      scanned: all.length,
      repaired,
      synced: syncRes.synced,
      message: `Recovery Complete: ${repaired} record(s) repaired. ${syncRes.message}`,
    };
  },
};
