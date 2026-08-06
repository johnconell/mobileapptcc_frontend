import * as Network from 'expo-network';

import {
  buildExamQuestions,
  grade,
  OfflineExamRepository,
} from '@/services/offlineExamRepository';
import { OfflineStore, type OfflinePack } from '@/services/offlineStore';
import type {
  ExamTerminationReason,
  LobbySnapshot,
  LobbyStudent,
  LobbyStudentStatus,
  Question,
} from '@/types';

export const PEER_PORT = 9777;
export const PEER_PATH_PREFIX = '/p2p';

/**
 * expo-http-server is a native module: absent in Expo Go and on web. Loading it
 * lazily keeps those environments running (without peer hosting) instead of
 * crashing at import time.
 */
type HttpServerModule = typeof import('expo-http-server');

let httpServer: HttpServerModule | null | undefined;

function loadHttpServer(): HttpServerModule | null {
  if (httpServer !== undefined) return httpServer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    httpServer = require('expo-http-server') as HttpServerModule;
  } catch {
    httpServer = null;
  }
  return httpServer;
}

export function isPeerHostingSupported(): boolean {
  return loadHttpServer() !== null;
}

type PeerStudentState = {
  token: string;
  registrationId: number;
  applicantId: number;
  applicantCode: string;
  fullName: string;
  email: string;
  programCode: string;
  programName: string;
  avatarInitials: string;
  status: LobbyStudentStatus;
  joinedAt: string;
  startedAt: string | null;
  lastActivityAt: string;
  violationCount: number;
  terminationReason: ExamTerminationReason | null;
  answers: Record<string, string | null>;
  /** Question ids in this student's shuffled order, so a reload keeps it. */
  order: string[];
  submittedAt: string | null;
  score: number | null;
};

type PeerViolation = {
  id: number;
  registration_id: number;
  studentName: string;
  studentId: string;
  type: string;
  message?: string | null;
  violationCount: number;
  occurredAt: string;
};

type PeerSessionState = {
  scheduleId: number;
  roomId: number | null;
  examCode: string;
  status: 'lobby_open' | 'in_progress' | 'ended';
  openedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  students: Record<string, PeerStudentState>;
  violations: PeerViolation[];
  violationSeq: number;
};

type JsonResponse = {
  statusCode?: number;
  contentType?: string;
  body?: string;
};

let session: PeerSessionState | null = null;
let routesRegistered = false;
let running = false;
let hostIp: string | null = null;
let listeners: Array<() => void> = [];

function ok(data: unknown, message?: string): JsonResponse {
  return {
    statusCode: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message, data }),
  };
}

function fail(status: number, message: string): JsonResponse {
  return {
    statusCode: status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message }),
  };
}

function parseBody(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseParams(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = String(value ?? '');
    }
    return out;
  } catch {
    return {};
  }
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A failing subscriber must not stop the exam.
    }
  });
}

async function persist() {
  if (session) await OfflineStore.savePeerSession(session);
}

function makeToken(registrationId: number): string {
  return `peer-${registrationId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function studentByToken(token: string): PeerStudentState | null {
  if (!session || !token) return null;
  return session.students[token] ?? null;
}

function toLobbyStudent(state: PeerStudentState): LobbyStudent {
  return {
    id: String(state.registrationId),
    studentId: state.applicantCode,
    fullName: state.fullName,
    email: state.email,
    programCode: state.programCode,
    programName: state.programName,
    avatarInitials: state.avatarInitials,
    status: state.status,
    joinedAt: state.joinedAt,
    startedAt: state.startedAt,
    lastActivityAt: state.lastActivityAt,
    violationCount: state.violationCount,
    terminationReason: state.terminationReason,
  };
}

function remainingSeconds(state: PeerSessionState): number | null {
  if (state.status !== 'in_progress' || !state.startedAt) return null;
  const elapsed = (Date.now() - new Date(state.startedAt).getTime()) / 1000;
  return Math.max(0, Math.round(state.durationMinutes * 60 - elapsed));
}

/** Roster from the pack merged with everyone who actually joined this room. */
async function buildSnapshot(state: PeerSessionState): Promise<LobbySnapshot> {
  const resolved = await OfflineExamRepository.resolveOfflineCode(state.examCode);
  const roster = await OfflineExamRepository.getLobbyStudentsForSchedule(
    String(state.scheduleId),
  );

  const joined = Object.values(state.students);
  const joinedByRegistration = new Map(joined.map((s) => [String(s.registrationId), s]));

  const students: LobbyStudent[] = roster.map((row) => {
    const live = joinedByRegistration.get(row.id);
    return live ? toLobbyStudent(live) : { ...row, terminationReason: null };
  });
  for (const live of joined) {
    if (!roster.some((row) => row.id === String(live.registrationId))) {
      students.push(toLobbyStudent(live));
    }
  }

  const count = (status: LobbyStudentStatus) =>
    students.filter((s) => s.status === status).length;
  const connected = joined.length;

  return {
    schedule: resolved?.schedule as LobbySnapshot['schedule'],
    session: {
      ...(resolved?.session as LobbySnapshot['session']),
      remainingSeconds: remainingSeconds(state),
      durationMinutes: state.durationMinutes,
    },
    status: state.status,
    examinationCode: state.examCode,
    qrValue: peerQrPayload(state),
    roomName: resolved?.session?.roomName ?? null,
    roomId: state.roomId,
    registeredCount: students.length,
    connectedCount: connected,
    notYetConnectedCount: Math.max(0, students.length - connected),
    waitingCount: count('waiting'),
    takingCount: count('taking_exam'),
    finishedCount: count('finished'),
    warningCount: count('warning'),
    terminatedCount: count('terminated'),
    violationsDetected: state.violations.length,
    recentViolations: state.violations.slice(-8).reverse(),
    students,
    can_control: true,
    is_owner: true,
    remainingSeconds: remainingSeconds(state),
  };
}

/**
 * QR payload the student phone scans. Carries the proctor phone's LAN address so
 * the student app can talk directly to it with no Laravel server involved.
 */
export function peerQrPayload(state: PeerSessionState): string {
  return JSON.stringify({
    v: 1,
    type: 'metcc_peer',
    code: state.examCode,
    examinationCode: state.examCode,
    host: hostIp,
    port: PEER_PORT,
    schedule_id: state.scheduleId,
    room_id: state.roomId,
  });
}

export type PeerQrTarget = {
  host: string;
  port: number;
  code: string;
  scheduleId: number | null;
  roomId: number | null;
};

/** Read a scanned QR string; returns null when it is not a peer QR. */
export function parsePeerQr(raw: string): PeerQrTarget | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.type !== 'metcc_peer') return null;
    const host = String(parsed.host ?? '').trim();
    const code = String(parsed.examinationCode ?? parsed.code ?? '')
      .trim()
      .toUpperCase();
    if (!host || !code) return null;
    return {
      host,
      port: Number(parsed.port) || PEER_PORT,
      code,
      scheduleId: parsed.schedule_id != null ? Number(parsed.schedule_id) : null,
      roomId: parsed.room_id != null ? Number(parsed.room_id) : null,
    };
  } catch {
    return null;
  }
}

function registerRoutes(mod: HttpServerModule) {
  if (routesRegistered) return;
  routesRegistered = true;

  const p = (path: string) => `${PEER_PATH_PREFIX}${path}`;

  mod.route(p('/ping'), 'GET', async () => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    return ok({
      code: session.examCode,
      status: session.status,
      schedule_id: session.scheduleId,
      room_id: session.roomId,
    });
  });

  mod.route(p('/resolve'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const code = String(body.code ?? '').trim().toUpperCase();
    if (code && code !== session.examCode) {
      return fail(404, 'That examination code is not the one open in this room.');
    }
    const resolved = await OfflineExamRepository.resolveOfflineCode(session.examCode);
    if (!resolved) return fail(500, 'Proctor phone has no exam pack for this schedule.');
    return ok(
      {
        schedule: resolved.schedule,
        session: resolved.session,
        examinationCode: session.examCode,
        status: session.status,
      },
      resolved.message,
    );
  });

  mod.route(p('/passkey'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const passkey = String(body.passkey ?? '').trim().toUpperCase();
    if (!passkey) return fail(422, 'Enter your examination key.');

    const validated = await OfflineExamRepository.validatePasskey(
      session.examCode,
      passkey,
    );
    if (!validated) return fail(404, 'Invalid examination key for this examination.');
    return ok({ student: validated.student, schedule: validated.schedule });
  });

  mod.route(p('/join'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    if (session.status === 'ended') {
      return fail(409, 'This examination has already ended.');
    }

    const body = parseBody(request.body);
    const passkey = String(body.passkey ?? '').trim().toUpperCase();
    const validated = await OfflineExamRepository.validatePasskey(
      session.examCode,
      passkey,
    );
    if (!validated) return fail(404, 'Invalid examination key for this examination.');

    const registrationId = Number(validated.student.registration_id ?? 0);
    const existing = Object.values(session.students).find(
      (s) => s.registrationId === registrationId,
    );
    if (existing?.submittedAt) {
      return fail(409, 'This examination key has already been submitted.');
    }

    const now = new Date().toISOString();
    const pack = await OfflineStore.getPack();
    if (!pack) return fail(500, 'Proctor phone has no exam pack.');

    let student = existing;
    if (student) {
      // Rejoin (app restart / reconnect): keep answers and question order.
      student.lastActivityAt = now;
    } else {
      const questions = buildExamQuestions(pack);
      student = {
        token: makeToken(registrationId),
        registrationId,
        applicantId: Number(validated.student.id),
        applicantCode: validated.student.studentId,
        fullName: validated.student.fullName,
        email: String(body.gmail ?? validated.student.email ?? ''),
        programCode: validated.student.programCode,
        programName: validated.student.programName,
        avatarInitials: validated.student.avatarInitials,
        status: session.status === 'in_progress' ? 'taking_exam' : 'waiting',
        joinedAt: now,
        startedAt: session.status === 'in_progress' ? now : null,
        lastActivityAt: now,
        violationCount: 0,
        terminationReason: null,
        answers: {},
        order: questions.map((q) => q.id),
        submittedAt: null,
        score: null,
      };
      session.students[student.token] = student;
    }

    await persist();
    notify();

    return ok({
      registration_id: registrationId,
      participation_token: student.token,
      lobby: await buildSnapshot(session),
    });
  });

  mod.route(p('/lobby'), 'GET', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const params = parseParams(request.paramsJson);
    const student = studentByToken(params.participation_token ?? '');
    if (!student) return fail(404, 'You are no longer joined to this examination.');

    student.lastActivityAt = new Date().toISOString();
    if (session.status === 'in_progress' && student.status === 'waiting') {
      student.status = 'taking_exam';
      student.startedAt = student.startedAt ?? student.lastActivityAt;
      await persist();
      notify();
    }

    return ok(await buildSnapshot(session));
  });

  mod.route(p('/questions'), 'GET', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const params = parseParams(request.paramsJson);
    const student = studentByToken(params.participation_token ?? '');
    if (!student) return fail(404, 'You are no longer joined to this examination.');
    if (session.status !== 'in_progress') {
      return fail(409, 'The proctor has not started the examination yet.');
    }

    const pack = await OfflineStore.getPack();
    if (!pack) return fail(500, 'Proctor phone has no exam pack.');

    // Replay this student's stored order so a reload never reshuffles mid-exam.
    const built = buildExamQuestions(pack);
    const byId = new Map(built.map((q) => [q.id, q]));
    const questions: Question[] = student.order
      .map((id) => byId.get(id))
      .filter((q): q is Question => Boolean(q))
      .map((q, index) => ({ ...q, number: index + 1 }));

    return ok({
      questions: questions.length ? questions : built,
      durationMinutes: session.durationMinutes,
      answers: student.answers,
    });
  });

  mod.route(p('/answers'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const student = studentByToken(String(body.participation_token ?? ''));
    if (!student) return fail(404, 'You are no longer joined to this examination.');

    const answers = body.answers;
    if (answers && typeof answers === 'object') {
      for (const [questionId, choice] of Object.entries(
        answers as Record<string, unknown>,
      )) {
        student.answers[questionId] = choice == null ? null : String(choice).toUpperCase();
      }
    }
    student.lastActivityAt = new Date().toISOString();
    await persist();
    notify();

    return ok({ saved: Object.keys(student.answers).length });
  });

  mod.route(p('/submit'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const student = studentByToken(String(body.participation_token ?? ''));
    if (!student) return fail(404, 'You are no longer joined to this examination.');

    const answers = body.answers;
    if (answers && typeof answers === 'object') {
      for (const [questionId, choice] of Object.entries(
        answers as Record<string, unknown>,
      )) {
        student.answers[questionId] = choice == null ? null : String(choice).toUpperCase();
      }
    }

    const pack = await OfflineStore.getPack();
    if (!pack) return fail(500, 'Proctor phone has no exam pack.');

    const graded = grade(pack, student.answers);
    const now = new Date().toISOString();
    student.submittedAt = now;
    student.lastActivityAt = now;
    student.score = graded.score;
    if (student.status !== 'terminated') student.status = 'finished';
    if (!student.terminationReason) student.terminationReason = 'submitted';

    await OfflineStore.queueResult({
      local_id: `${student.applicantCode}-${session.scheduleId}-${Date.now()}`,
      applicant_code: student.applicantCode,
      examination_schedule_id: session.scheduleId,
      applicant_name: student.fullName,
      attendance_status: 'present',
      ...graded,
      submitted_at: now,
      synced: false,
    });

    await persist();
    notify();

    // Score is deliberately not returned: results are released by the admin.
    return ok({ submitted: true, items_total: graded.items_total });
  });

  mod.route(p('/violation'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const student = studentByToken(String(body.participation_token ?? ''));
    if (!student) return fail(404, 'You are no longer joined to this examination.');

    student.violationCount += 1;
    student.lastActivityAt = new Date().toISOString();
    session.violationSeq += 1;
    session.violations.push({
      id: session.violationSeq,
      registration_id: student.registrationId,
      studentName: student.fullName,
      studentId: student.applicantCode,
      type: String(body.type ?? 'unknown').slice(0, 60),
      message: body.message ? String(body.message).slice(0, 500) : null,
      violationCount: student.violationCount,
      occurredAt: student.lastActivityAt,
    });
    if (session.violations.length > 60) {
      session.violations = session.violations.slice(-60);
    }
    if (student.violationCount >= 3 && student.status === 'taking_exam') {
      student.status = 'warning';
    }

    await persist();
    notify();

    return ok({
      violation_count: student.violationCount,
      lobby_status: student.status,
    });
  });

  mod.route(p('/heartbeat'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const student = studentByToken(String(body.participation_token ?? ''));
    if (!student) return fail(404, 'You are no longer joined to this examination.');
    student.lastActivityAt = new Date().toISOString();
    return ok({ status: session.status, remainingSeconds: remainingSeconds(session) });
  });
}

async function resolveHostIp(): Promise<string | null> {
  try {
    const ip = await Network.getIpAddressAsync();
    if (ip && ip !== '0.0.0.0' && !ip.startsWith('127.')) return ip;
    return null;
  } catch {
    return null;
  }
}

export const PeerExamServer = {
  isSupported: isPeerHostingSupported,

  subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((fn) => fn !== listener);
    };
  },

  info(): { running: boolean; host: string | null; port: number; code: string | null } {
    return {
      running,
      host: hostIp,
      port: PEER_PORT,
      code: session?.examCode ?? null,
    };
  },

  /** Restore a session after the proctor app was killed mid-examination. */
  async restore(): Promise<boolean> {
    if (session) return true;
    const saved = await OfflineStore.getPeerSession<PeerSessionState>();
    if (!saved || saved.status === 'ended') return false;
    session = saved;
    return true;
  },

  async start(input: {
    scheduleId: string | number;
    roomId: string | number | null;
    examCode: string;
  }): Promise<{ host: string | null; port: number; qrValue: string }> {
    const mod = loadHttpServer();
    if (!mod) {
      throw new Error(
        'This build cannot host an examination. Peer mode needs a development build (Expo Go and the web preview do not include the local server).',
      );
    }

    const scheduleId = Number(String(input.scheduleId).replace(/^offline-/, ''));
    const roomId =
      input.roomId != null && String(input.roomId).trim() !== ''
        ? Number(input.roomId)
        : null;

    const pack: OfflinePack | null = await OfflineStore.getPack();
    if (!pack) {
      throw new Error(
        'Download the exam pack first. The proctor phone serves the students from it.',
      );
    }

    hostIp = await resolveHostIp();
    if (!hostIp) {
      throw new Error(
        'This phone has no Wi‑Fi address. Connect to the exam Wi‑Fi (or turn on a hotspot) and try again.',
      );
    }

    const reopening =
      session &&
      session.scheduleId === scheduleId &&
      session.roomId === roomId &&
      session.status !== 'ended';

    if (!reopening) {
      session = {
        scheduleId,
        roomId,
        examCode: input.examCode.trim().toUpperCase(),
        status: 'lobby_open',
        openedAt: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
        durationMinutes: pack.examination_settings?.duration_minutes ?? 90,
        students: {},
        violations: [],
        violationSeq: 0,
      };
    }

    if (!running) {
      mod.setup(PEER_PORT);
      registerRoutes(mod);
      mod.start();
      running = true;
    }

    await persist();
    notify();

    return { host: hostIp, port: PEER_PORT, qrValue: peerQrPayload(session!) };
  },

  async snapshot(): Promise<LobbySnapshot | null> {
    if (!session) return null;
    return buildSnapshot(session);
  },

  async startExam(): Promise<LobbySnapshot> {
    if (!session) throw new Error('Open the room lobby first.');
    const now = new Date().toISOString();
    session.status = 'in_progress';
    session.startedAt = session.startedAt ?? now;
    for (const student of Object.values(session.students)) {
      if (student.status === 'waiting') {
        student.status = 'taking_exam';
        student.startedAt = student.startedAt ?? now;
      }
    }
    await persist();
    notify();
    return buildSnapshot(session);
  },

  async endExam(): Promise<LobbySnapshot> {
    if (!session) throw new Error('Open the room lobby first.');
    const now = new Date().toISOString();
    session.status = 'ended';
    session.endedAt = now;
    for (const student of Object.values(session.students)) {
      if (student.status === 'taking_exam' || student.status === 'warning') {
        student.status = 'finished';
        student.terminationReason = student.terminationReason ?? 'time_expired';
      }
    }
    await persist();
    notify();
    return buildSnapshot(session);
  },

  async terminateStudent(registrationId: string | number): Promise<LobbySnapshot | null> {
    if (!session) return null;
    const target = Object.values(session.students).find(
      (s) => s.registrationId === Number(registrationId),
    );
    if (target) {
      target.status = 'terminated';
      target.terminationReason = 'proctor_terminated';
      await persist();
      notify();
    }
    return buildSnapshot(session);
  },

  async stop(): Promise<void> {
    const mod = loadHttpServer();
    try {
      mod?.stop();
    } catch {
      // Server may already be down.
    }
    running = false;
    routesRegistered = false;
  },

  async reset(): Promise<void> {
    await this.stop();
    session = null;
    hostIp = null;
    await OfflineStore.clearPeerSession();
  },
};
