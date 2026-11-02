import assert from 'node:assert/strict';
import test from 'node:test';
import { localApiRequest } from '../../features/local-testing/localApiTransport';
import { LOCAL_DATA_KEY, setLocalApiStorageForTests } from '../../features/local-testing/localApiStore';
import { validateOfflineRoomAssignment } from '../../features/examinations/services/offlineRoomAssignment';
import { ExamProgressStore } from '../../features/examinations/services/examProgressStore';
import {
  ExamSubmissionCoordinator,
  classifySubmissionError,
  generateSubmissionDigest,
} from '../../features/examinations/services/examSubmissionCoordinator';
import { ExamSubmissionStore, type FinalizedSubmission } from '../../features/examinations/services/examSubmissionStore';
import {
  writeEncryptedFile,
  readEncryptedFile,
  StorageDecryptionError,
} from '../../shared/services/encryptedStorage';
import {
  recalculateTimer,
  createInitialTimeSync,
} from '../../features/examinations/services/examTimerCoordinator';
import { QuestionRepository } from '../../features/examinations/repositories/QuestionRepository';
import { useExamStore } from '../../features/examinations/stores/examStore';

const memory = new Map<string, string>();
setLocalApiStorageForTests({
  getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); },
  deleteItem: async (key) => { memory.delete(key); },
});

test.beforeEach(async () => {
  memory.delete(LOCAL_DATA_KEY);
  await ExamProgressStore.clear();
  await ExamSubmissionStore.clear();
  useExamStore.getState().reset();
  ExamSubmissionCoordinator.cancelScheduledRetry();
});

test('MOB-FLOW-001: Proctor 1 Login → Authorized Schedule & Room (Schedule 101, Room 201) → Lobby Open', async () => {
  // 1. Authorized Proctor 1 Login -> 200 with Token
  const login = await localApiRequest({
    path: '/proctor/login',
    method: 'POST',
    body: { email: 'proctor1.local@tcc.test', username: 'proctor1.local@tcc.test', password: 'LocalTest123!' },
  });
  assert.equal(login.status, 200);
  const token = login.body.data.token;
  assert.equal(token, 'local-api-token-901');
  assert.equal(login.body.data.profile.displayName, 'Proctor Maria Santos');

  // 2. Authorized Schedules -> Only assigned Schedule 101 returned
  const schedulesRes = await localApiRequest({ path: '/proctor/schedules', method: 'GET', token });
  assert.equal(schedulesRes.status, 200);
  assert.equal(schedulesRes.body.data.length, 1);
  assert.equal(schedulesRes.body.data[0].id, 101);

  // 3. Authorized Rooms -> Only assigned Room 201 returned
  const roomsRes = await localApiRequest({ path: '/proctor/schedules/101/rooms', method: 'GET', token });
  assert.equal(roomsRes.status, 200);
  assert.equal(roomsRes.body.data.length, 1);
  assert.equal(roomsRes.body.data[0].id, 201);
  assert.equal(roomsRes.body.data[0].room_name, 'Computer Laboratory 1');

  // 4. Authorized Room Session Creation -> 200 OK (lobby_open)
  const openSession = await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token,
    body: { examination_schedule_id: 101, examination_room_id: 201 },
  });
  assert.equal(openSession.status, 200);
  assert.equal(openSession.body.data.status, 'lobby_open');
});

test('MOB-FLOW-002: Proctor 2 Login → Authorized Schedule & Room (Schedule 102, Room 202) → Session Open', async () => {
  // 1. Authorized Proctor 2 Login -> 200 with Token
  const login = await localApiRequest({
    path: '/proctor/login',
    method: 'POST',
    body: { email: 'proctor2.local@tcc.test', username: 'proctor2.local@tcc.test', password: 'LocalTest123!' },
  });
  assert.equal(login.status, 200);
  const token = login.body.data.token;
  assert.equal(token, 'local-api-token-902');
  assert.equal(login.body.data.profile.displayName, 'Proctor Juan Reyes');

  // 2. Authorized Schedules -> Only assigned Schedule 102 returned
  const schedulesRes = await localApiRequest({ path: '/proctor/schedules', method: 'GET', token });
  assert.equal(schedulesRes.status, 200);
  assert.equal(schedulesRes.body.data.length, 1);
  assert.equal(schedulesRes.body.data[0].id, 102);

  // 3. Authorized Rooms -> Only assigned Room 202 returned
  const roomsRes = await localApiRequest({ path: '/proctor/schedules/102/rooms', method: 'GET', token });
  assert.equal(roomsRes.status, 200);
  assert.equal(roomsRes.body.data.length, 1);
  assert.equal(roomsRes.body.data[0].id, 202);
  assert.equal(roomsRes.body.data[0].room_name, 'Computer Laboratory 2');

  // 4. Authorized Room Session Creation -> 200 OK (lobby_open)
  const openSession = await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token,
    body: { examination_schedule_id: 102, examination_room_id: 202 },
  });
  assert.equal(openSession.status, 200);
  assert.equal(openSession.body.data.status, 'lobby_open');
});

test('MOB-FLOW-003: Student Admission → Question Delivery Guards & Session Activation', async () => {
  const token = 'local-api-token-901';
  // 1. Open lobby for Schedule 101, Room 201
  await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token,
    body: { examination_schedule_id: 101, examination_room_id: 201 },
  });

  // 2. Resolve exam via code
  const resolveRes = await localApiRequest({ path: '/exam/resolve', method: 'POST', body: { code: 'TCC10126' } });
  assert.equal(resolveRes.status, 200);
  assert.equal(resolveRes.body.valid, true);

  // 3. Student list returns 15 assigned examinees for Room 201
  const studentsRes = await localApiRequest({ path: '/exam/students?code=TCC10126', method: 'GET' });
  assert.equal(studentsRes.status, 200);
  assert.equal(studentsRes.body.data.length, 15);
  assert.equal(studentsRes.body.data[0].studentId, 'APP-2026-0001');

  // 4. Student validates passkey and joins
  const passkeyRes = await localApiRequest({
    path: '/exam/passkey/validate',
    method: 'POST',
    body: { code: 'TCC10126', passkey: 'P0000001' },
  });
  assert.equal(passkeyRes.status, 200);

  const joinRes = await localApiRequest({
    path: '/exam/join-passkey',
    method: 'POST',
    body: { code: 'TCC10126', passkey: 'P0000001' },
  });
  assert.equal(joinRes.status, 200);
  const participationToken = joinRes.body.data.participation_token;

  // 5. Guard: Cannot fetch questions while session is lobby_open
  const waitingQuestions = await localApiRequest({
    path: `/exam/questions?participation_token=${participationToken}`,
    method: 'GET',
  });
  assert.equal(waitingQuestions.status, 409);
  assert.match(waitingQuestions.body.message, /not started yet/i);

  // 6. Proctor starts session
  await localApiRequest({ path: '/proctor/sessions/9101/start', method: 'POST', token });

  // 7. Now questions are delivered (40 items across ENG, MATH, SCI, LOG)
  const startedQuestions = await localApiRequest({
    path: `/exam/questions?participation_token=${participationToken}`,
    method: 'GET',
  });
  assert.equal(startedQuestions.status, 200);
  assert.equal(startedQuestions.body.data.length, 40);
  assert.equal(startedQuestions.body.data[0].choices.A, 'Option A');
});

test('MOB-FLOW-004: Student Answering, Autosave Checkpoint & Final Submission Receipt', async () => {
  const token = 'local-api-token-901';
  await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token,
    body: { examination_schedule_id: 101, examination_room_id: 201 },
  });
  await localApiRequest({ path: '/proctor/sessions/9101/start', method: 'POST', token });

  await localApiRequest({
    path: '/exam/join-passkey',
    method: 'POST',
    body: { code: 'TCC10126', passkey: 'P0000001' },
  });
  const participationToken = '00000000-0000-4000-8000-000000000001';

  // 1. Valid Autosave -> 200 OK
  const saveRes = await localApiRequest({
    path: '/exam/save',
    method: 'POST',
    body: {
      participation_token: participationToken,
      answers: [
        { exam_question_id: 5001, selected_answer: 'A' },
        { exam_question_id: 5002, selected_answer: 'B' },
      ],
    },
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.body.data.saved, true);

  // 2. Submit Final Examination -> 200 OK with confirmation and score
  const submitRes = await localApiRequest({
    path: '/exam/submit',
    method: 'POST',
    body: {
      participation_token: participationToken,
      answers: [
        { exam_question_id: 5001, selected_answer: 'A' },
        { exam_question_id: 5002, selected_answer: 'B' },
      ],
    },
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.already_submitted, false);
  assert.ok(typeof submitRes.body.data.score === 'number');
  assert.equal(submitRes.body.data.items_total, 40);

  // 3. Repeated Submit is Idempotent -> 200 OK with already_submitted: true
  const resubmitRes = await localApiRequest({
    path: '/exam/submit',
    method: 'POST',
    body: {
      participation_token: participationToken,
      answers: [{ exam_question_id: 5001, selected_answer: 'A' }],
    },
  });
  assert.equal(resubmitRes.status, 200);
  assert.equal(resubmitRes.body.already_submitted, true);
  assert.equal(resubmitRes.body.submittedAt, submitRes.body.submittedAt);
});

test('MOB-RECOVERY-001: Student Admission → Correct Room vs Wrong Room / Missing Assignment Rejection', () => {
  const schedule = {
    id: 101,
    title: 'Entrance Exam Batch 1',
    exam_date: '2026-11-02',
    time_slot: '08:00–09:00',
    rooms_managed: true,
    rooms: [
      { id: 201, examination_schedule_id: 101, room_name: 'Room 201' },
      { id: 202, examination_schedule_id: 101, room_name: 'Room 202' },
    ],
  };

  // Case A: Correct Room Admission -> Allowed
  const correctAdmission = validateOfflineRoomAssignment({
    schedule,
    registration: { examination_schedule_id: 101, assigned_room_id: 201 },
    authority: { scheduleId: 101, roomId: 201 },
  });
  assert.equal(correctAdmission.ok, true);

  // Case B: Wrong Room Rejection -> Denied without leaking other students
  const wrongRoomAdmission = validateOfflineRoomAssignment({
    schedule,
    registration: { examination_schedule_id: 101, assigned_room_id: 202 },
    authority: { scheduleId: 101, roomId: 201 }, // Student entered Room 201 instead of Room 202
  });
  assert.equal(wrongRoomAdmission.ok, false);
  if (!wrongRoomAdmission.ok) {
    assert.equal(wrongRoomAdmission.code, 'wrong_room');
    assert.match(wrongRoomAdmission.message, /does not match the examination room/);
  }

  // Case C: Missing Room Assignment -> Denied, requires proctor recovery
  const missingRoom = validateOfflineRoomAssignment({
    schedule,
    registration: { examination_schedule_id: 101, assigned_room_id: null },
    authority: { scheduleId: 101, roomId: 201 },
  });
  assert.equal(missingRoom.ok, false);
  if (!missingRoom.ok) {
    assert.equal(missingRoom.code, 'assignment_data_unavailable');
    assert.equal(missingRoom.recoveryRequired, true);
    assert.match(missingRoom.message, /Room assignment data is missing or outdated/);
  }
});

test('MOB-RECOVERY-002: Unauthorized Proctor Schedule & Room Access Rejection (403 Forbidden)', async () => {
  // Proctor 1 logs in
  const login1 = await localApiRequest({
    path: '/proctor/login',
    method: 'POST',
    body: { email: 'proctor1.local@tcc.test', username: 'proctor1.local@tcc.test', password: 'LocalTest123!' },
  });
  const token1 = login1.body.data.token;

  // Proctor 1 attempts to access Schedule 102's rooms (assigned to Proctor 2) -> 403 Forbidden
  const forbiddenScheduleRooms = await localApiRequest({
    path: '/proctor/schedules/102/rooms',
    method: 'GET',
    token: token1,
  });
  assert.equal(forbiddenScheduleRooms.status, 403);
  assert.match(forbiddenScheduleRooms.body.message, /not assigned to this examination schedule/i);

  // Proctor 1 attempts to open a session in Room 202 -> 403 Forbidden
  const forbiddenRoomSession = await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token: token1,
    body: { examination_schedule_id: 102, examination_room_id: 202 },
  });
  assert.equal(forbiddenRoomSession.status, 403);

  // Invalid password -> 401 Unauthorized
  const badLogin = await localApiRequest({
    path: '/proctor/login',
    method: 'POST',
    body: { email: 'proctor1.local@tcc.test', username: 'proctor1.local@tcc.test', password: 'WrongPassword999' },
  });
  assert.equal(badLogin.status, 401);
});

test('MOB-RECOVERY-003: Corrupted-Storage & Bit-Flip Tamper Detection', async () => {
  const { encryptJson, decryptJson, StorageDecryptionError } = await import('../../shared/services/encryptedStorage');
  const payload = { sensitive: 'exam answers payload', applicantId: 1001 };
  const ciphertextJson = await encryptJson(payload);

  const parsed = JSON.parse(ciphertextJson);
  const ctBytes = Buffer.from(parsed.ct, 'base64');
  ctBytes[0] ^= 0xff; // Corrupt ciphertext byte
  parsed.ct = ctBytes.toString('base64');
  const tamperedJson = JSON.stringify(parsed);

  await assert.rejects(
    async () => {
      await decryptJson(tamperedJson);
    },
    (err: unknown) => {
      assert.ok(err instanceof StorageDecryptionError);
      return true;
    },
  );
});

test('MOB-RECOVERY-004: Interruption Recovery, Wall-Clock Deduction & Expired-Timer Handling', () => {
  const startedAt = '2026-11-02T08:00:00.000Z';
  const deadline = '2026-11-02T09:00:00.000Z';
  const saveTime = new Date('2026-11-02T08:10:00.000Z').getTime();
  const timeSync = createInitialTimeSync();
  timeSync.lastKnownDeviceTimeMs = saveTime;

  // Case 1: Student reopens 30m later at 8:40 AM -> deduct wall-clock time
  const resumeTime = new Date('2026-11-02T08:40:00.000Z').getTime();
  const recalculatedActive = recalculateTimer({
    startedAt,
    deadline,
    timeSync,
    nowDeviceMs: resumeTime,
  });
  assert.equal(recalculatedActive.remainingSeconds, 20 * 60);
  assert.equal(recalculatedActive.isExpired, false);
  assert.equal(recalculatedActive.isAnsweringAllowed, true);

  // Case 2: Student reopens at 9:05 AM (after deadline) -> expired, locked, no extra time
  const expiredTime = new Date('2026-11-02T09:05:00.000Z').getTime();
  const recalculatedExpired = recalculateTimer({
    startedAt,
    deadline,
    timeSync,
    nowDeviceMs: expiredTime,
  });
  assert.equal(recalculatedExpired.remainingSeconds, 0);
  assert.equal(recalculatedExpired.isExpired, true);
  assert.equal(recalculatedExpired.isAnsweringAllowed, false);
});

test('MOB-RECOVERY-005: Finalized Submission → Failed Delivery Retry → Idempotent Local Receipt Deduplication', async () => {
  const finalized: FinalizedSubmission = {
    submissionId: 'sub-e2e-1',
    attemptId: 'att-e2e-1',
    idempotencyKey: 'idemp_sess1_stud1_att1',
    sessionId: 'sess-101',
    studentId: 'stud-1',
    applicantCode: 'APP-2026-0001',
    studentName: 'Applicant01 Santos',
    answers: { '5001': 'A', '5002': 'C' },
    finalReason: 'submitted',
    status: 'pending',
    destination: 'proctor_peer',
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ExamSubmissionStore.save(finalized);

  // 1. Transient Network Failure -> increment attempt count, schedule bounded retry
  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const netErr = new Error('Network connection timeout');
      (netErr as any).status = 0;
      throw netErr;
    };

    const retryResult = await ExamSubmissionCoordinator.deliver();
    assert.ok(retryResult != null);
    assert.equal(retryResult.status, 'retrying');
    assert.equal(retryResult.attemptCount, 1);
    assert.equal(retryResult.lastError?.isTransient, true);
  } finally {
    ExamSubmissionCoordinator.cancelScheduledRetry();
    QuestionRepository.submitAnswers = originalSubmit;
  }

  // 2. Re-attempt succeeds -> transitions to confirmed with verification digest
  try {
    QuestionRepository.submitAnswers = async () => {
      return {
        success: true,
        submittedAt: new Date().toISOString(),
        destination: 'proctor_peer',
        alreadySubmitted: false,
      };
    };

    const successResult = await ExamSubmissionCoordinator.deliver({ isManualRetry: true });
    assert.ok(successResult != null);
    assert.equal(successResult.status, 'confirmed');
    assert.equal(successResult.receipt?.destination, 'proctor_peer');
    assert.match(successResult.receipt?.confirmationCode || '', /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }

  // 3. Lost Response / Duplicate Re-delivery -> receives already_submitted, preserves confirmed receipt
  try {
    QuestionRepository.submitAnswers = async () => {
      const dupErr = new Error('Examination submission was already confirmed.');
      (dupErr as any).status = 422;
      throw dupErr;
    };

    const duplicateDelivery = await ExamSubmissionCoordinator.deliver();
    assert.ok(duplicateDelivery != null);
    assert.equal(duplicateDelivery.status, 'confirmed');
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('MOB-CONTRACT-001: API Contract Conformance → Rejects Unsupported Endpoints and Malformed Payloads', async () => {
  // 1. Rejects outdated camelCase join payload
  const camelJoin = await localApiRequest({
    path: '/exam/join',
    method: 'POST',
    body: { examinationCode: 'TCC10126', applicantId: 1 },
  });
  assert.equal(camelJoin.status, 422);

  // 2. Rejects unsupported HTTP method
  const wrongMethod = await localApiRequest({
    path: '/proctor/schedules',
    method: 'POST',
    token: 'local-api-token-901',
  });
  assert.equal(wrongMethod.status, 404);

  // 3. Rejects invalid answers format in save
  await localApiRequest({ path: '/exam/join', method: 'POST', body: { code: 'TCC10126', applicant_id: 1 } });
  const badAnswer = await localApiRequest({
    path: '/exam/save',
    method: 'POST',
    body: {
      participation_token: '00000000-0000-4000-8000-000000000001',
      answers: [{ exam_question_id: 999999, selected_answer: 'Z' }],
    },
  });
  assert.equal(badAnswer.status, 422);
});

test('MOB-FLOW-006: Single Schedule Multi-Room Enforcement & Reconnect Guards', async () => {
  // Proctor 1 opens Room 201 for Schedule 101
  const token = 'local-api-token-901';
  await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token,
    body: { examination_schedule_id: 101, examination_room_id: 201 },
  });

  const singleSched = {
    id: 101,
    rooms_managed: true,
    rooms: [
      { id: 201, examination_schedule_id: 101, room_name: 'Room 201' },
      { id: 202, examination_schedule_id: 101, room_name: 'Room 202' },
    ],
  };

  // Student assigned to Room 201 entering Room 201 -> OK
  const okResult = validateOfflineRoomAssignment({
    schedule: singleSched,
    registration: { examination_schedule_id: 101, assigned_room_id: 201 },
    authority: { scheduleId: 101, roomId: 201 },
  });
  assert.equal(okResult.ok, true);

  // Candidate assigned to Room 201 attempting to enter Room 202 on same Schedule 101 -> wrong_room
  const wrongRoom = validateOfflineRoomAssignment({
    schedule: singleSched,
    registration: { examination_schedule_id: 101, assigned_room_id: 201 },
    authority: { scheduleId: 101, roomId: 202 },
  });
  assert.equal(wrongRoom.ok, false);
  if (!wrongRoom.ok) {
    assert.equal(wrongRoom.code, 'wrong_room');
  }
});

