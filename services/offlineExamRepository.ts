import { getCloudApiBaseUrl, getApiBaseUrl } from '@/services/api';
import {
  describeApiReachabilityProblem,
  studentPackDownloadFailureMessage,
} from '@/services/apiReachability';
import { classifyPasskeyMatch, type PasskeyMatchClassification } from '@/services/passkeyClassification';
import {
  OfflinePack,
  OfflineQueuedResult,
  OfflineStore,
} from '@/services/offlineStore';
import type { ChoiceKey, Question, StudentRecord } from '@/types';

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
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
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

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { message?: string })?.message ||
        `Request failed (${res.status}).`,
    );
  }
  return json as T;
}

export function toChoiceRecord(
  options: Record<string, string> | string[] | null | undefined,
): Record<ChoiceKey, string> {
  const blank: Record<ChoiceKey, string> = { A: '', B: '', C: '', D: '' };
  if (!options) return blank;
  if (Array.isArray(options)) {
    options.slice(0, 4).forEach((text, i) => {
      blank[String.fromCharCode(65 + i) as ChoiceKey] = String(text);
    });
    return blank;
  }
  (['A', 'B', 'C', 'D'] as ChoiceKey[]).forEach((k) => {
    blank[k] = String(options[k] ?? options[k.toLowerCase()] ?? '');
  });
  return blank;
}

export function selectedQuestions(pack: OfflinePack): Array<{
  id: number;
  stem: string;
  options: Record<string, string> | string[] | null;
  correct_answer: string;
  category?: string;
}> {
  const bank =
    pack.question_banks.find((b) => b.is_active) ?? pack.question_banks[0];
  if (!bank) return [];
  const rows: Array<{
    id: number;
    stem: string;
    options: Record<string, string> | string[] | null;
    correct_answer: string;
    category?: string;
  }> = [];
  for (const subject of bank.subjects ?? []) {
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
  return rows;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Mirror the server ordering (ExamSessionService::questionsForSession): questions
 * stay grouped by category, shuffled only within their own category. Category
 * order follows the pack unless shuffle_categories is on.
 */
function orderQuestionsByCategory<T extends { category?: string }>(
  rows: T[],
  options: { shuffleQuestions: boolean; shuffleCategories: boolean },
): T[] {
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

  const categoryOrder = options.shuffleCategories
    ? shuffled([...groups.keys()])
    : [...groups.keys()];

  const ordered: T[] = [];
  for (const category of categoryOrder) {
    const group = groups.get(category) ?? [];
    ordered.push(...(options.shuffleQuestions ? shuffled(group) : group));
  }
  return ordered;
}

/**
 * Build the student-facing question list from a pack. Shared by the offline
 * path and the proctor peer server so both phones see the same shape.
 */
export function buildExamQuestions(pack: OfflinePack): Question[] {
  const settings = pack.examination_settings;
  const shuffleBoth = settings?.shuffle_both === true;
  const ordered = orderQuestionsByCategory(selectedQuestions(pack), {
    shuffleQuestions: shuffleBoth || settings?.shuffle_questions !== false,
    shuffleCategories: shuffleBoth || settings?.shuffle_categories === true,
  });

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
  return {
    score,
    items_correct: correct,
    items_total: total,
    result_status: score >= 75 ? 'passed' : 'failed',
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
  };
}

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

    // Pack export requires ADMIN_SYNC_TOKEN (or admin Sanctum). A proctor
    // login token must NOT be preferred — it causes 401 Unauthorized.
    const syncToken = process.env.EXPO_PUBLIC_SYNC_TOKEN?.trim() || null;
    if (!syncToken) {
      throw new Error(
        'Missing EXPO_PUBLIC_SYNC_TOKEN in the app .env (must match ADMIN_SYNC_TOKEN on the server). Restart Expo after changing it.',
      );
    }
    const params = new URLSearchParams();
    if (examDate) params.set('exam_date', examDate);
    if (options?.includeAuth) params.set('include_auth', '1');
    const q = params.toString() ? `?${params.toString()}` : '';

    report(20, 'Downloading exam pack…');
    const json = await cloudFetch<{
      success: boolean;
      data: OfflinePack & { proctors?: unknown };
    }>(`/sync/exam-day-pack${q}`, { token: syncToken, timeoutMs: 120000 });
    if (!json.data) throw new Error('Cloud returned an empty exam pack.');

    report(55, 'Processing students and questions…');
    if (options?.includeAuth && json.data.proctors) {
      report(65, 'Caching proctor accounts…');
      const { ProctorAuthCache } = await import('@/services/proctorAuthCache');
      await ProctorAuthCache.saveFromPackProctors(json.data.proctors);
    }

    // Never leave password hashes in the on-disk exam pack (student devices).
    const { proctors: _proctors, ...safePack } = json.data;
    report(80, 'Saving securely on this phone…');
    await OfflineStore.savePack(safePack as OfflinePack);
    report(100, 'Download complete');
    return safePack as OfflinePack;
  },

  async getCachedSchedules() {
    const pack = await OfflineStore.getPack();
    if (!pack) return [];
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
          schoolYear: date.slice(0, 4) || String(new Date().getFullYear()),
          examinationDate: date,
          examinationDateIso: date,
          batchCount: 0,
          description: s.venue,
          timeLabel: s.time_slot,
          batchNumber: s.batch_code,
          venue: s.venue,
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
      const parts = name.trim().split(/\s+/);
      const id = String(a?.id ?? r.applicant_id);
      const claimed = claims.has(id);
      return {
        id,
        studentId: a?.applicant_code || String(r.applicant_id),
        firstName: parts[0] || name,
        middleName: '',
        lastName: parts.slice(1).join(' ') || '',
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
    });
  },

  /**
   * Validate a student examination key against the offline pack.
   * Resolves the schedule from (in order):
   * 1) explicit scheduleIdOverride (peer host session)
   * 2) opened-room map for modern codes like K7M2P9QX
   * 3) legacy OFF-{scheduleId}[-R{roomId}] codes
   */
  async validatePasskey(
    examinationCode: string,
    passkey: string,
    scheduleIdOverride?: number | null,
  ): Promise<OfflinePasskeyValidationResult | null> {
    const pack = await OfflineStore.getPack();
    if (!pack) return null;

    let scheduleId: number | null =
      scheduleIdOverride != null && Number.isFinite(Number(scheduleIdOverride))
        ? Number(scheduleIdOverride)
        : null;

    if (scheduleId == null) {
      const opened = await OfflineStore.findOpenedRoomByCode(examinationCode);
      if (opened) {
        scheduleId = opened.scheduleId;
      } else {
        const parsed = this.parseOfflineCode(examinationCode);
        if (parsed) scheduleId = parsed.scheduleId;
      }
    }

    if (scheduleId == null) return null;

    const normalized = passkey.trim().toUpperCase();
    const matches = pack.registrations.filter(
      (r) => String(r.exam_passkey || '').toUpperCase() === normalized,
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
      return {
        classification,
        message:
          classification === 'wrong_schedule'
            ? `This examination key belongs to ${otherSchedule?.title || 'a different examination schedule'}. Use the correct key for this room.`
            : 'Invalid examination key for this session.',
        schedule: otherSchedule
          ? {
              id: otherSchedule.id,
              title: otherSchedule.title,
              exam_date: otherSchedule.exam_date,
              time_slot: otherSchedule.time_slot,
            }
          : undefined,
      };
    }

    const reg = matches.find(
      (r) => Number(r.examination_schedule_id) === scheduleId,
    );
    if (!reg) return null;

    const a = pack.applicants.find((x) => Number(x.id) === Number(reg.applicant_id));
    if (!a) return null;
    const name = (a.name || '').trim() || 'Student';
    const parts = name.trim().split(/\s+/);
    const schedule = pack.schedules.find((s) => Number(s.id) === scheduleId);
    return {
      classification: 'valid',
      student: {
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
        selectable: true,
      },
      schedule: schedule
        ? {
            id: schedule.id,
            title: schedule.title,
            exam_date: schedule.exam_date,
            time_slot: schedule.time_slot,
          }
        : undefined,
    };
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
        registeredStudents: pack.registrations.filter(
          (r) => Number(r.examination_schedule_id) === Number(schedule.id),
        ).length,
        durationMinutes: pack.examination_settings?.duration_minutes ?? 90,
        totalQuestions: selectedQuestions(pack).length,
        examinationCode: examCode,
      },
      examinationCode: examCode,
      message: room
        ? `Examination ready for ${room.room_name}.`
        : 'Examination ready on this device.',
    };
  },

  async resolveOfflineCode(code: string) {
    const extracted = extractExaminationCode(code);

    // Prefer explicitly opened rooms (normal codes like K7M2P9QX).
    const opened = await OfflineStore.findOpenedRoomByCode(extracted);
    if (opened) {
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
      (p) => p?.examination_settings?.duration_minutes ?? 90,
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
    const row: OfflineQueuedResult = {
      local_id: `${input.applicantCode}-${input.scheduleId}-${Date.now()}`,
      applicant_code: input.applicantCode,
      examination_schedule_id: Number(input.scheduleId),
      applicant_name: input.applicantName,
      attendance_status: 'present',
      ...graded,
      submitted_at: new Date().toISOString(),
      synced: false,
    };
    await OfflineStore.queueResult(row);
    return row;
  },

    async syncQueuedToCloud(): Promise<{ synced: number; message: string }> {
    const pending = await OfflineStore.pendingResults();
    if (!pending.length) {
      return { synced: 0, message: 'No offline results waiting to sync.' };
    }

    const syncToken = process.env.EXPO_PUBLIC_SYNC_TOKEN?.trim() || null;
    if (!syncToken) {
      throw new Error(
        'Missing EXPO_PUBLIC_SYNC_TOKEN in the app .env (must match ADMIN_SYNC_TOKEN on the server).',
      );
    }

    // FIX 2 & FIX 3: Filter and auto-repair any invalid schedule IDs before payload creation
    const pack = await OfflineStore.getPack();
    const validPending = pending.map((r) => {
      let schedId = Number(r.examination_schedule_id);
      if (!Number.isInteger(schedId) || schedId <= 0) {
        if (pack) {
          const { resolveNumericScheduleId } = require('@/services/peerExamServer');
          schedId = resolveNumericScheduleId(r.examination_schedule_id, pack);
        }
      }
      return {
        ...r,
        examination_schedule_id: schedId,
      };
    }).filter((r) => Number.isInteger(r.examination_schedule_id) && r.examination_schedule_id > 0);

    if (!validPending.length) {
      throw new Error('Sync Failed: Local queued results have invalid schedule IDs. Run "Recover Unsynced Results" to repair them.');
    }

    console.log(`[SYNC AUDIT START] Sending ${validPending.length} queued result(s) to cloud server...`);

    const payload = {
      results: validPending.map((r) => ({
        lan_registration_id: 0,
        client_local_id: r.local_id,
        applicant_code: r.applicant_code,
        examination_schedule_id: r.examination_schedule_id,
        attendance_status: r.attendance_status,
        result_status: r.result_status,
        score: r.score,
        items_correct: r.items_correct,
        items_total: r.items_total,
        grade_point: r.grade_point,
        answers: r.answers,
      })),
    };

    let json: any = null;
    try {
      json = await cloudFetch<{
        success: boolean;
        message?: string;
        data?: {
          accepted_ids?: number[];
          accepted_client_ids?: string[];
          accepted_keys?: string[];
          created?: number;
          updated?: number;
        };
      }>('/sync/offline-results', {
        method: 'POST',
        body: payload,
        token: syncToken,
      });
    } catch (error) {
      console.error('[SYNC AUDIT ERROR] Network request failed:', error);
      throw error;
    }

    const acceptedClient = new Set(json?.data?.accepted_client_ids ?? []);
    const acceptedKeys = new Set(json?.data?.accepted_keys ?? []);
    const syncedIds = validPending
      .filter((p) => {
        if (acceptedClient.has(p.local_id)) return true;
        return acceptedKeys.has(`${p.applicant_code}|${p.examination_schedule_id}`);
      })
      .map((p) => p.local_id);

    // FIX 6: Never claim success if 0 items were accepted by server!
    if (syncedIds.length === 0 || json?.success === false) {
      const serverMsg = json?.message || 'Server rejected all records in batch.';
      const rejectedList = (json as any)?.data?.rejected;
      const rejDetails = Array.isArray(rejectedList) && rejectedList.length > 0
        ? ` Rejection Reasons: ${rejectedList.map((r: any) => `${r.applicant_code}: ${r.reason}`).join('; ')}`
        : '';

      console.error(`[SYNC AUDIT FAILURE] 0 records accepted. Server Message: ${serverMsg}.${rejDetails}`);
      throw new Error(`Sync Failed: No results were accepted by the server. (${serverMsg})${rejDetails}`);
    }

    await OfflineStore.markSynced(syncedIds);

    const skipped = validPending.length - syncedIds.length;
    const auditMsg = skipped > 0
      ? `Partial Sync: ${syncedIds.length} result(s) saved to Admin; ${skipped} record(s) rejected by server.`
      : `Sync Complete: All ${syncedIds.length} result(s) successfully saved to Admin server.`;

    console.log(`[SYNC AUDIT COMPLETE] ${auditMsg}`);

    return {
      synced: syncedIds.length,
      message: auditMsg,
    };
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
    const { resolveNumericScheduleId } = require('@/services/peerExamServer');

    let repaired = 0;
    const fixedRows = all.map((row) => {
      let schedId = Number(row.examination_schedule_id);
      if (!Number.isInteger(schedId) || schedId <= 0) {
        schedId = resolveNumericScheduleId(row.examination_schedule_id, pack);
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
