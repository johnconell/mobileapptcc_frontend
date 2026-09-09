import type { Question } from '@/types';

export type DownloadPhase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'hash_complete'
  | 'ready'
  | 'incomplete'
  | 'error';

export type ExamPackProgress = {
  phase: DownloadPhase;
  phaseLabel: string;
  percent: number;
  questionsDownloaded: number;
  questionsExpected: number;
  assetsDownloaded: number;
  assetsExpected: number;
  configurationComplete: boolean;
  hashVerified: boolean;
  moduleReady: boolean;
  durationMinutes: number | null;
  hasSettings: boolean;
  error?: string;
};

export type StartupFailureCode =
  | 'PACK_MISSING'
  | 'DOWNLOAD_INCOMPLETE'
  | 'WAITING_FOR_START'
  | 'CONFIG_MISSING'
  | 'QUESTION_BANK_MISSING'
  | 'SESSION_NOT_ACTIVE'
  | 'HASH_FAILED'
  | 'PAYLOAD_INVALID';

export const INITIAL_PACK_PROGRESS: ExamPackProgress = {
  phase: 'idle',
  phaseLabel: 'Preparing Examination Pack',
  percent: 0,
  questionsDownloaded: 0,
  questionsExpected: 0,
  assetsDownloaded: 0,
  assetsExpected: 0,
  configurationComplete: false,
  hashVerified: false,
  moduleReady: false,
  durationMinutes: null,
  hasSettings: false,
};

export function phaseLabelFor(phase: DownloadPhase, percent = 0): string {
  switch (phase) {
    case 'preparing':
      return 'Preparing Examination Pack';
    case 'downloading':
      return `Downloading Module...\n${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    case 'verifying':
      return 'Verifying Examination Pack...';
    case 'hash_complete':
      return 'Hash Verification Complete';
    case 'ready':
      return 'Ready for Examination';
    case 'incomplete':
      return 'Exam Download Incomplete';
    case 'error':
      return 'Exam Pack Incomplete';
    default:
      return 'Preparing Examination Pack';
  }
}

export function countMediaAssets(questions: Question[]): number {
  let count = 0;
  for (const q of questions) {
    const extra = q as Question & {
      image?: string;
      imageUrl?: string;
      media?: string;
      asset?: string;
    };
    if (extra.image || extra.imageUrl || extra.media || extra.asset) count += 1;
    const texts = [q.question, ...Object.values(q.choices || {})];
    for (const text of texts) {
      if (
        typeof text === 'string' &&
        /(https?:\/\/|\.png|\.jpe?g|\.gif|\.webp|data:image)/i.test(text)
      ) {
        count += 1;
      }
    }
  }
  return count;
}

export function userFacingStartupError(code: StartupFailureCode, detail?: string): string {
  const messages: Record<StartupFailureCode, string> = {
    PACK_MISSING: 'Exam Pack Missing',
    DOWNLOAD_INCOMPLETE: 'Exam Download Incomplete',
    WAITING_FOR_START: 'Waiting for Proctor Start Signal',
    CONFIG_MISSING: 'Exam Configuration Missing',
    QUESTION_BANK_MISSING: 'Question Bank Not Found',
    SESSION_NOT_ACTIVE: 'Session Not Active',
    HASH_FAILED: 'Exam Pack Incomplete',
    PAYLOAD_INVALID: 'Exam Configuration Missing',
  };
  const title = messages[code];
  return detail ? `${title}\n\n${detail}` : title;
}

export function classifyPeerStartupError(raw: string, path = ''): string {
  const text = (raw || '').toLowerCase();
  if (!text || /^request rejected \(\d+\)$/.test(text.trim())) {
    if (path.includes('questions')) return 'Question Bank Not Found';
    if (path.includes('package')) return 'Exam Pack Missing';
    return 'Exam Pack Incomplete';
  }
  if (
    text.includes('not active') ||
    text.includes('has ended') ||
    text.includes('not open') ||
    text.includes('lobby')
  ) {
    return 'Session Not Active';
  }
  if (text.includes('no exam pack') || text.includes('no examination pack') || text.includes('pack')) {
    if (text.includes('incomplete') || text.includes('download')) return 'Exam Download Incomplete';
    return 'Exam Pack Missing';
  }
  if (text.includes('question')) return 'Question Bank Not Found';
  if (text.includes('config') || text.includes('duration') || text.includes('settings')) {
    return 'Exam Configuration Missing';
  }
  if (text.includes('hash') || text.includes('verif')) return 'Exam Pack Incomplete';
  return raw;
}

export function logStartupDiagnostic(step: string, extra?: Record<string, unknown>) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[STARTUP] ${step}${suffix}`);
}

export function validateExamStartup(input: {
  sessionId?: string | null;
  examId?: string | null;
  questions?: Question[] | null;
  durationMinutes?: number | null;
  hasSettings?: boolean;
  sessionStatus?: string | null;
  authorityStatus?: string | null;
  progress: ExamPackProgress;
}): { ok: true } | { ok: false; code: StartupFailureCode; detail: string } {
  const authority = String(input.authorityStatus || '').toUpperCase();
  const status = String(input.sessionStatus || '');
  if (authority === 'ENDED' || status === 'ended') {
    return { ok: false, code: 'SESSION_NOT_ACTIVE', detail: 'This examination has already ended.' };
  }
  const active =
    authority === 'ACTIVE' ||
    authority === 'STARTING' ||
    status === 'in_progress' ||
    status === 'active';
  if (!active) {
    return {
      ok: false,
      code: 'WAITING_FOR_START',
      detail: `Current session state is "${authority || status || 'unknown'}". The exam opens only when the session is active.`,
    };
  }

  if (input.progress.percent < 100 || !input.progress.moduleReady) {
    return {
      ok: false,
      code: 'DOWNLOAD_INCOMPLETE',
      detail: `Module download is ${Math.round(input.progress.percent)}%.`,
    };
  }
  if (!input.progress.hashVerified) {
    return { ok: false, code: 'HASH_FAILED', detail: 'Hash verification has not passed.' };
  }
  if (!input.questions?.length) {
    return { ok: false, code: 'QUESTION_BANK_MISSING', detail: 'No questions are stored on this device.' };
  }
  if (!input.sessionId) {
    return { ok: false, code: 'PAYLOAD_INVALID', detail: 'session_id is missing.' };
  }
  if (!input.examId) {
    return { ok: false, code: 'PAYLOAD_INVALID', detail: 'exam_id is missing.' };
  }
  if (!input.durationMinutes || input.durationMinutes <= 0) {
    return { ok: false, code: 'CONFIG_MISSING', detail: 'duration is missing from the examination pack.' };
  }
  if (!input.hasSettings && !input.progress.configurationComplete) {
    return { ok: false, code: 'CONFIG_MISSING', detail: 'Examination settings are missing from the pack.' };
  }
  return { ok: true };
}
