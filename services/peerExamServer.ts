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
export const MAX_ROOM_CAPACITY = 60;

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
  reconnectCode: string | null;
  reconnectCodeExpiresAt: string | null;
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
  students: Record<number, PeerStudentState>; // Keyed by registrationId (unique)
  tokenMap: Record<string, number>; // Maps token -> registrationId for fast lookup
  violations: PeerViolation[];
  violationSeq: number;
};

type JsonResponse = {
  status?: number;     // Standard
  statusCode?: number; // Legacy compatibility
  headers?: Record<string, string>;
  contentType?: string;
  body?: string;
};

let session: PeerSessionState | null = null;
let routesRegistered = false;
let running = false;
let hostIp: string | null = null;
let listeners: Array<() => void> = [];

// Performance optimizations & Bulletproof Caching
let _cachedSnapshot: LobbySnapshot | null = null;
let _snapshotDirty = true; // Flag to rebuild only when necessary
let _packCache: OfflinePack | null = null;
let _resolvedCache: any = null;
let _resolvedAt = 0;
let _builtQuestionsCache: Question[] | null = null;

function invalidateSnapshot() {
  _snapshotDirty = true;
  _cachedSnapshot = null;
}

function ok(data: unknown, message?: string): JsonResponse {
  return {
    status: 200,
    statusCode: 200,
    contentType: 'application/json',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, message, data }),
  };
}

function fail(status: number, message: string): JsonResponse {
  console.warn(`[SERVER REJECT] Status ${status}: ${message}`);
  return {
    status,
    statusCode: status,
    contentType: 'application/json',
    headers: { 'Content-Type': 'application/json' },
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

/**
 * Robust parameter extractor. expo-http-server doesn't always parse query strings
 * from the URL automatically, so we do it manually as a fallback.
 */
function parseParams(request: any): Record<string, string> {
  const out: Record<string, string> = {};

  // 1. Try manual URL query string parsing (most reliable for GET requests)
  if (request.url && request.url.includes('?')) {
    try {
      const queryString = request.url.split('?')[1];
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key) out[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    } catch (e) {
      console.error('[SERVER] Query parse error:', e);
    }
  }

  // 2. Merge in provided JSON params/query if available from the bridge
  const raw = request.paramsJson || request.queryJson;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          out[key] = String(value ?? '');
        }
      }
    } catch { /* ignore */ }
  }

  // 3. Fallback to direct object properties
  const obj = request.params || request.query || {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = String(value ?? '');
  }

  return out;
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
  const regId = session.tokenMap?.[token];
  if (regId != null) {
    return session.students[regId] ?? null;
  }
  // Fallback for legacy sessions without tokenMap
  return Object.values(session.students).find(s => s.token === token) ?? null;
}

function toLobbyStudent(state: PeerStudentState): LobbyStudent {
  let status = state.status;

  // Real-time status: if no heartbeat for > 60s, they are disconnected.
  // Increased from 20s to be more resilient to network lag during exam start.
  if (status !== 'finished' && status !== 'terminated') {
    const lastSeen = new Date(state.lastActivityAt).getTime();
    const idleSeconds = (Date.now() - lastSeen) / 1000;
    if (idleSeconds > 60) {
      status = 'disconnected';
    }
  }

    return {
    id: String(state.registrationId),
    studentId: state.applicantCode,
    fullName: state.fullName,
    email: state.email,
    programCode: state.programCode,
    programName: state.programName,
    avatarInitials: state.avatarInitials,
    status,
    joinedAt: state.joinedAt,
    startedAt: state.startedAt,
    lastActivityAt: state.lastActivityAt,
    violationCount: state.violationCount,
    terminationReason: state.terminationReason,
    reconnectCode: state.reconnectCode,
    reconnectCodeExpiresAt: state.reconnectCodeExpiresAt,
  };
}

function remainingSeconds(state: PeerSessionState): number | null {
  if (state.status !== 'in_progress' || !state.startedAt) return null;
  const elapsed = (Date.now() - new Date(state.startedAt).getTime()) / 1000;
  return Math.max(0, Math.round(state.durationMinutes * 60 - elapsed));
}

/** Live roster only — students who scanned, entered a key, and joined. */
async function buildSnapshot(state: PeerSessionState): Promise<LobbySnapshot> {
  // Return cached if clean (Critical Fix for Root Cause 1)
  if (!_snapshotDirty && _cachedSnapshot) return _cachedSnapshot;

  const now = Date.now();
  if (!_resolvedCache || now - _resolvedAt > 5000) {
    _resolvedCache = await OfflineExamRepository.resolveScheduleRoom(
      state.scheduleId,
      state.roomId,
      state.examCode,
    );
    _resolvedAt = now;
  }
  const resolved = _resolvedCache;

  const students: LobbyStudent[] = [];
  let waiting = 0;
  let taking = 0;
  let finished = 0;
  let warning = 0;
  let terminated = 0;
  let disconnected = 0;

  for (const s of Object.values(state.students)) {
    const student = toLobbyStudent(s);
    students.push(student);

    if (student.status === 'waiting') waiting++;
    else if (student.status === 'taking_exam') taking++;
    else if (student.status === 'finished') finished++;
    else if (student.status === 'warning') {
        warning++;
        taking++;
    }
    else if (student.status === 'terminated') terminated++;
    else if (student.status === 'disconnected') disconnected++;
  }

  const registeredCount =
    Number(resolved?.session?.registeredStudents ?? 0) || students.length;

  _cachedSnapshot = {
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
    registeredCount,
    connectedCount: students.length,
    notYetConnectedCount: Math.max(0, registeredCount - students.length),
    waitingCount: waiting,
    takingCount: taking,
    finishedCount: finished,
    warningCount: warning,
    terminatedCount: terminated,
    disconnectedCount: disconnected,
    violationsDetected: state.violations.length,
    recentViolations: state.violations.slice(-8).reverse(),
    students,
    can_control: true,
    is_owner: true,
    remainingSeconds: remainingSeconds(state),
    wifiSsid: state.wifiSsid,
  };

  _snapshotDirty = false;
  return _cachedSnapshot;
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
    wifi_ssid: state.wifiSsid,
  });
}

export type PeerQrTarget = {
  host: string;
  port: number;
  code: string;
  scheduleId: number | null;
  roomId: number | null;
  wifiSsid: string | null;
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
      wifiSsid: parsed.wifi_ssid ? String(parsed.wifi_ssid) : null,
    };
  } catch {
    return null;
  }
}

function registerRoutes(mod: HttpServerModule) {
  if (routesRegistered) return;
  routesRegistered = true;

  const p = (path: string) => `${PEER_PATH_PREFIX}${path}`;

  mod.route(p('/health'), 'GET', async () => {
    return ok({
      server: 'proctor',
      mode: 'offline',
      status: session ? 'ready' : 'idle',
      session_status: session?.status ?? null,
    });
  });

  /**
   * Ultra-fast signal endpoint (Minecraft-style).
   * RETURNS ONLY PRIMITIVES. NO STUDENT LIST. NO HEAVY OBJECTS.
   * Fixing Root Cause 1 (Congestion) and 2 (Token Gate).
   */
  mod.route(p('/status'), 'GET', async (request) => {
    if (!session) return fail(503, 'Offline');

    // We try to find the student for personalized status, but the
    // ROOM status is always returned regardless of token.
    const params = parseParams(request);
    const student = studentByToken(params.participation_token ?? '');

    return ok({
      examStarted: session.status !== 'lobby_open',
      roomStatus: session.status,
      myStatus: student?.status ?? 'anonymous',
      serverTime: Date.now(),
      v: session.status === 'in_progress' ? 2 : 1 // Simple versioning
    });
  });

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
    const resolved = await OfflineExamRepository.resolveScheduleRoom(
      session.scheduleId,
      session.roomId,
      session.examCode,
    );
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
      session.scheduleId,
    );
    if (!validated) return fail(404, 'Invalid examination key for this examination.');
    if (validated.classification === 'wrong_schedule') {
      return ok({
        classification: 'wrong_schedule',
        message: validated.message || 'This examination key belongs to a different schedule.',
        schedule: validated.schedule,
      });
    }
    return ok({
      student: validated.student,
      schedule: validated.schedule,
      classification: validated.classification,
      message: validated.message,
    });
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
      session.scheduleId,
    );
    if (!validated) return fail(404, 'Invalid examination key for this examination.');
    if (validated.classification === 'wrong_schedule') {
      return fail(409, validated.message || 'This examination key belongs to a different schedule.');
    }

    if (!validated.student) {
      return fail(404, 'Unable to continue with that examination key.');
    }

    const registrationId = Number(validated.student.registration_id ?? 0);
    const existing = session.students[registrationId];

    if (!existing && Object.keys(session.students).length >= MAX_ROOM_CAPACITY) {
      return fail(409, 'Room Full. Maximum capacity of 60 students reached. Please contact the Proctor.');
    }

    if (existing?.submittedAt) {
      return fail(409, 'This examination key has already been submitted.');
    }

    const now = new Date().toISOString();
    const pack = await OfflineStore.getPack();
    if (!pack) return fail(500, 'Proctor phone has no exam pack.');

    let student = existing;
    if (student) {
      // Rejoin: refresh activity and return the existing token
      student.lastActivityAt = now;
      console.log(`[SESSION] Student ${student.applicantCode} rejoined.`);
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
        reconnectCode: null,
        reconnectCodeExpiresAt: null,
      };
      session.students[registrationId] = student;
      if (!session.tokenMap) session.tokenMap = {};
      session.tokenMap[student.token] = registrationId;
      console.log(`[SESSION] Student ${student.applicantCode} joined lobby.`);
      console.log('[SERVER] Student connected. Registration ID:', registrationId);
    }

    invalidateSnapshot();
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
    const params = parseParams(request);
    const token = params.participation_token ?? '';
    const student = studentByToken(token);

    if (!student) {
      console.warn(`[SERVER] Token not found: ${token.slice(0, 10)}...`);
      return fail(404, 'You are no longer joined to this examination. Please scan the QR again.');
    }

    console.log('[SERVER] Heartbeat received from student:', student.applicantCode);
    const now = new Date().toISOString();
    student.lastActivityAt = now;

    let changed = false;
    if (session.status === 'in_progress' && student.status === 'waiting') {
      student.status = 'taking_exam';
      student.startedAt = student.startedAt ?? now;
      changed = true;
      invalidateSnapshot();
      console.log(`[SESSION] Student ${student.applicantCode} transitioned: waiting -> taking_exam`);
    }

    // Always notify proctor UI that a heartbeat was received to keep the list fresh
    notify();

    if (changed) {
      await persist();
    }

    const snapshot = await buildSnapshot(session);

    // DETECT STUDENT REQUEST: If polling via participation_token, return MINIFIED snapshot.
    // This solves the 250-student "Data Bloat" that causes LAN congestion.
    return ok({
        ...snapshot,
        students: [], // Empty for students to save bandwidth
        recentViolations: [],
        my_status: student.status,
        registration_id: student.registrationId
    });
  });

  mod.route(p('/leave'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const token = String(body.participation_token ?? '');
    const student = studentByToken(token);
    if (student) {
      console.log(`[SESSION] Student ${student.applicantCode} left the lobby.`);
      delete session.students[student.registrationId];
      if (session.tokenMap) delete session.tokenMap[token];
      invalidateSnapshot();
      await persist();
      notify();
    }
    return ok({ left: true });
  });

  mod.route(p('/questions'), 'GET', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const params = parseParams(request);
    const student = studentByToken(params.participation_token ?? '');
    if (!student) return fail(404, 'You are no longer joined to this examination.');
    if (session.status !== 'in_progress') {
      return fail(409, 'The proctor has not started the examination yet.');
    }

    if (!_packCache) {
      _packCache = await OfflineStore.getPack();
      _builtQuestionsCache = null; // Invalidate built questions if pack changes
    }
    const pack = _packCache;
    if (!pack) return fail(500, 'Proctor phone has no exam pack.');

    // Replay this student's stored order so a reload never reshuffles mid-exam.
    if (!_builtQuestionsCache) {
      console.log('[SERVER] Building exam questions cache...');
      _builtQuestionsCache = buildExamQuestions(pack);
    }
    const built = _builtQuestionsCache;

    const byId = new Map(built.map((q) => [q.id, q]));
    const questions: Question[] = student.order
      .map((id) => byId.get(id))
      .filter((q): q is Question => Boolean(q))
      .map((q, index) => ({ ...q, number: index + 1 }));

    console.log(`[SESSION] Student ${student.applicantCode} fetched questions. Count: ${questions.length}`);
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
    invalidateSnapshot();
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

    invalidateSnapshot();
    await persist();
    notify();

    console.log(`[SUBMISSION] Student ${student.applicantCode} submitted successfully.`);
    console.log('[SERVER] Data stored successfully.');
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

    invalidateSnapshot();
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

  mod.route(p('/allow-reconnect'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const registrationId = Number(body.registration_id ?? 0);
    const student = session.students[registrationId];
    if (!student) return fail(404, 'Student not found.');

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); // 15 mins

    student.reconnectCode = pin;
    student.reconnectCodeExpiresAt = expiresAt;

    console.log(`[SERVER] Issued Reconnect PIN ${pin} for student ${student.applicantCode}`);

    invalidateSnapshot();
    await persist();
    notify();

    return ok({
      reconnect_code: pin,
      expires_at: expiresAt,
      student_name: student.fullName
    });
  });

  mod.route(p('/reconnect'), 'POST', async (request) => {
    if (!session) return fail(503, 'No examination is open on the proctor phone.');
    const body = parseBody(request.body);
    const token = String(body.participation_token ?? '');
    const pin = String(body.reconnect_code ?? '').trim();

    const student = studentByToken(token);
    if (!student) return fail(404, 'Session not found. Please scan the QR again.');

    if (!student.reconnectCode || student.reconnectCode !== pin) {
      return fail(403, 'Invalid reconnect PIN. Please ask the Proctor for a new PIN.');
    }

    const now = new Date().toISOString();
    if (student.reconnectCodeExpiresAt && student.reconnectCodeExpiresAt < now) {
      return fail(403, 'Reconnect PIN has expired. Please ask the Proctor for a new PIN.');
    }

    // Clear PIN and resume status
    student.reconnectCode = null;
    student.reconnectCodeExpiresAt = null;
    student.lastActivityAt = now;
    if (student.status === 'disconnected') {
      student.status = 'taking_exam';
    }

    console.log(`[SERVER] Student ${student.applicantCode} reconnected via PIN.`);

    invalidateSnapshot();
    await persist();
    notify();

    return ok({ success: true, status: student.status });
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
    if (!session) {
      const saved = await OfflineStore.getPeerSession<PeerSessionState>();
      if (!saved || saved.status === 'ended') return false;
      session = saved;
    }

    // Encrypted state alone is not enough — restart HTTP so students can reconnect.
    const mod = loadHttpServer();
    if (!mod) return Boolean(session);

    hostIp = await resolveHostIp();
    if (!running) {
      try {
        mod.setup(PEER_PORT);
        registerRoutes(mod);
        mod.start();
        running = true;
      } catch {
        // Port may already be bound from a previous JS context; treat as running.
        running = true;
      }
    }

    await persist();
    notify();
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
    const netState = await Network.getNetworkStateAsync();
    const wifiSsid = netState.type === Network.NetworkStateType.WIFI ? netState.ssid : null;

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

    // Peer host serves one room at a time. Require Close Lobby / End Examination
    // before opening a different room so room status stays consistent.
    if (
      session &&
      !reopening &&
      session.status !== 'ended' &&
      (session.scheduleId !== scheduleId || session.roomId !== roomId)
    ) {
      throw new Error(
        'Close or end the current room lobby before opening another room.',
      );
    }

    if (!reopening) {
      console.log('[SERVER] Starting FRESH examination session. Clearing roster.');
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
        tokenMap: {},
        violations: [],
        violationSeq: 0,
        wifiSsid,
      };
    }

    if (!running) {
      try {
        mod.setup(PEER_PORT);
        registerRoutes(mod);
        mod.start();
        running = true;
      } catch (err) {
        console.warn('[SERVER] Could not start server (may be already running):', err);
        running = true;
      }
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
    console.log('[START_EVENT] START_BUTTON_CLICKED');
    const now = new Date().toISOString();
    session.status = 'in_progress';
    session.startedAt = session.startedAt ?? now;
    console.log('[START_EVENT] SESSION_UPDATED. Status: in_progress');
    console.log('[LOBBY DEBUG] Proctor Action: START EXAM. New Status:', session.status);
    console.log('[SESSION] Proctor started examination. Status: started');

    for (const student of Object.values(session.students)) {
      if (student.status === 'waiting') {
        student.status = 'taking_exam';
        student.startedAt = student.startedAt ?? now;
      }
    }
    if (session.roomId != null) {
      await OfflineStore.setOpenedRoom(
        session.scheduleId,
        session.roomId,
        session.examCode,
        'in_progress',
      );
      console.log('[START_EVENT] ROOM_UPDATED');
    }
    console.log('[START_EVENT] BROADCAST_SENT (via polling update)');
    invalidateSnapshot();
    await persist();
    notify();
    return buildSnapshot(session);
  },

  async endExam(): Promise<LobbySnapshot> {
    if (!session) throw new Error('Open the room lobby first.');
    if (session.status === 'lobby_open') {
      throw new Error('Examination has not started. Close the lobby instead.');
    }
    const now = new Date().toISOString();
    session.status = 'ended';
    session.endedAt = now;
    for (const student of Object.values(session.students)) {
      if (student.status === 'taking_exam' || student.status === 'warning') {
        student.status = 'finished';
        student.terminationReason = student.terminationReason ?? 'time_expired';
      }
    }
    if (session.roomId != null) {
      await OfflineStore.setOpenedRoom(
        session.scheduleId,
        session.roomId,
        session.examCode,
        'ended',
      );
    }
    invalidateSnapshot();
    await persist();
    notify();
    return buildSnapshot(session);
  },

  /**
   * Close lobby before exam start — room returns to idle and can be opened again.
   */
  async closeLobby(): Promise<void> {
    if (!session) return;
    if (session.status === 'in_progress') {
      throw new Error('Examination has started. Use End Examination instead.');
    }
    const scheduleId = session.scheduleId;
    const roomId = session.roomId;
    await this.reset();
    if (roomId != null) {
      await OfflineStore.clearOpenedRoom(scheduleId, roomId);
    }
  },

  async terminateStudent(registrationId: string | number): Promise<LobbySnapshot | null> {
    if (!session) return null;
    const currentSession = session;
    const target = currentSession.students[Number(registrationId)];
    if (target) {
      target.status = 'terminated';
      target.terminationReason = 'proctor_terminated';
      invalidateSnapshot();
      await persist();
      notify();
    }
    return buildSnapshot(currentSession);
  },

  async allowReconnect(registrationId: string | number): Promise<{ reconnectCode: string; expiresAt: string; studentName?: string } | null> {
    if (!session) return null;
    const student = session.students[Number(registrationId)];
    if (!student) return null;

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();

    student.reconnectCode = pin;
    student.reconnectCodeExpiresAt = expiresAt;

    await persist();
    notify();

    return {
      reconnectCode: pin,
      expiresAt: expiresAt,
      studentName: student.fullName
    };
  },

  async removeStudent(registrationId: string | number): Promise<LobbySnapshot | null> {
    if (!session) return null;
    const currentSession = session;
    const id = Number(registrationId);
    if (currentSession.students[id]) {
      delete currentSession.students[id];
      invalidateSnapshot();
      await persist();
      notify();
    }
    return buildSnapshot(currentSession);
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

  async refreshHostIp(): Promise<string | null> {
    const ip = await resolveHostIp();
    if (ip) {
      hostIp = ip;
      if (session) {
        session.hostIp = ip;
        await persist();
      }
      notify();
    }
    return ip;
  },
};
