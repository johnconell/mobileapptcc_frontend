import { getCloudApiBaseUrl, getApiBaseUrl } from '@/services/api';
import {
  OfflinePack,
  OfflineQueuedResult,
  OfflineStore,
} from '@/services/offlineStore';
import type { ChoiceKey, Question } from '@/types';

function cloudBase(): string {
  return (getCloudApiBaseUrl() || getApiBaseUrl()).replace(/\/$/, '');
}

async function cloudFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${cloudBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || `Cloud request failed (${res.status})`);
  }
  return json as T;
}

function toChoiceRecord(
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

function selectedQuestions(pack: OfflinePack): Array<{
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

function grade(
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
export const OfflineExamRepository = {
  async downloadPackFromCloud(examDate?: string): Promise<OfflinePack> {
    // Pack export requires ADMIN_SYNC_TOKEN (or admin Sanctum). A proctor
    // login token must NOT be preferred — it causes 401 Unauthorized.
    const syncToken = process.env.EXPO_PUBLIC_SYNC_TOKEN?.trim() || null;
    if (!syncToken) {
      throw new Error(
        'Missing EXPO_PUBLIC_SYNC_TOKEN in the app .env (must match ADMIN_SYNC_TOKEN on the server). Restart Expo after changing it.',
      );
    }
    const q = examDate ? `?exam_date=${encodeURIComponent(examDate)}` : '';

    const json = await cloudFetch<{ success: boolean; data: OfflinePack }>(
      `/sync/exam-day-pack${q}`,
      { token: syncToken },
    );
    if (!json.data) throw new Error('Cloud returned an empty exam pack.');
    await OfflineStore.savePack(json.data);
    // Keep LAN / online mode. Offline mode turns on only when a student/proctor
    // uses an OFF-{scheduleId} exam code.
    return json.data;
  },

  async getCachedSchedules() {
    const pack = await OfflineStore.getPack();
    if (!pack) return [];
    // Match online grouping: one schedule card per exam date.
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        schoolYear: string;
        examinationDate: string;
        examinationDateIso: string;
        batchCount: number;
        description?: string;
      }
    >();
    for (const s of pack.schedules) {
      const date = s.exam_date || 'unknown';
      const key = `date-${date}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: s.title || 'Entrance Examination',
          schoolYear: date.slice(0, 4) || '',
          examinationDate: date,
          examinationDateIso: date,
          batchCount: 0,
          description: s.venue,
        });
      }
      const item = map.get(key)!;
      item.batchCount += 1;
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

  async getLobbyStudentsForSchedule(scheduleId: string) {
    const roster = await this.getStudentsForSchedule(scheduleId);
    const now = new Date().toISOString();
    return roster.map((s) => ({
      id: String(s.registration_id ?? s.id),
      studentId: s.studentId,
      fullName: s.fullName,
      email: s.email,
      programCode: s.programCode,
      programName: s.programName,
      avatarInitials: s.avatarInitials || 'ST',
      status: 'waiting' as const,
      joinedAt: now,
      startedAt: null,
      lastActivityAt: now,
      violationCount: 0,
      terminationReason: null,
    }));
  },

  async getQuestions(): Promise<Question[]> {
    const pack = await OfflineStore.getPack();
    if (!pack) throw new Error('No offline exam pack. Download while online first.');
    const rows = selectedQuestions(pack);
    const shuffle = pack.examination_settings?.shuffle_questions !== false;
    const ordered = shuffle ? [...rows].sort(() => Math.random() - 0.5) : rows;
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
  },

  /** Offline exam codes look like OFF-12 (schedule id 12). */
  parseOfflineCode(code: string): number | null {
    const m = code.trim().toUpperCase().match(/^OFF-(\d+)$/);
    return m ? Number(m[1]) : null;
  },

  makeOfflineCode(scheduleId: string | number): string {
    return `OFF-${scheduleId}`;
  },

  async resolveOfflineCode(code: string) {
    const scheduleId = this.parseOfflineCode(code);
    if (!scheduleId) return null;
    const pack = await OfflineStore.getPack();
    if (!pack) return null;
    const schedule = pack.schedules.find((s) => s.id === scheduleId);
    if (!schedule) return null;
    return {
      valid: true as const,
      schedule: {
        id: String(schedule.id),
        name: schedule.title,
        schoolYear: schedule.batch_code || '',
        examinationDate: schedule.exam_date || '',
        examinationDateIso: schedule.exam_date || '',
        batchCount: 1,
      },
      session: {
        id: `offline-${schedule.id}`,
        scheduleId: String(schedule.id),
        timeLabel: schedule.time_slot || 'Offline exam',
        startTime: schedule.start_time || '',
        endTime: schedule.end_time || '',
        venue: schedule.venue || 'Offline',
        batchNumber: schedule.batch_code || '',
        registeredStudents: pack.registrations.filter(
          (r) => r.examination_schedule_id === schedule.id,
        ).length,
        durationMinutes: pack.examination_settings?.duration_minutes ?? 90,
        totalQuestions: selectedQuestions(pack).length,
      },
      message: 'Offline examination ready on this device.',
    };
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

    const payload = {
      results: pending.map((r) => ({
        lan_registration_id: 0,
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

    const json = await cloudFetch<{
      success: boolean;
      message?: string;
      data?: { accepted_ids?: number[] };
    }>('/sync/offline-results', {
      method: 'POST',
      body: payload,
      token: syncToken,
    });

    await OfflineStore.markSynced(pending.map((p) => p.local_id));
    return {
      synced: pending.length,
      message: json.message || `Synced ${pending.length} result(s) to the administrator.`,
    };
  },
};
