import assert from 'node:assert/strict';
import test from 'node:test';
import { localApiRequest } from '../../features/local-testing/localApiTransport';
import { LOCAL_DATA_KEY, setLocalApiStorageForTests } from '../../features/local-testing/localApiStore';

const memory = new Map<string, string>();
setLocalApiStorageForTests({
  getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); },
  deleteItem: async (key) => { memory.delete(key); },
});

test.beforeEach(() => memory.delete(LOCAL_DATA_KEY));

test('backend-contract: seeds 30 students and two Manila-day schedules across two proctors', async () => {
  // Proctor 1 Login (Assigned to Schedule 101, Room 201)
  const login1 = await localApiRequest({ path: '/proctor/login', method: 'POST', body: { email: 'proctor1.local@tcc.test', username: 'proctor1.local@tcc.test', password: 'LocalTest123!' } });
  assert.equal(login1.status, 200);
  const token1 = login1.body.data.token;
  const schedules1 = await localApiRequest({ path: '/proctor/schedules', method: 'GET', token: token1 });
  assert.equal(schedules1.body.data.length, 1);
  assert.equal(schedules1.body.data[0].id, 101);

  // Proctor 2 Login (Assigned to Schedule 102, Room 202)
  const login2 = await localApiRequest({ path: '/proctor/login', method: 'POST', body: { email: 'proctor2.local@tcc.test', username: 'proctor2.local@tcc.test', password: 'LocalTest123!' } });
  assert.equal(login2.status, 200);
  const token2 = login2.body.data.token;
  const schedules2 = await localApiRequest({ path: '/proctor/schedules', method: 'GET', token: token2 });
  assert.equal(schedules2.body.data.length, 1);
  assert.equal(schedules2.body.data[0].id, 102);

  // Cross-proctor authorization check: Proctor 1 cannot view Proctor 2's schedule rooms
  const proctor1Forbidden = await localApiRequest({ path: '/proctor/schedules/102/rooms', method: 'GET', token: token1 });
  assert.equal(proctor1Forbidden.status, 403);

  // Cross-proctor authorization check: Proctor 2 cannot view Proctor 1's schedule rooms
  const proctor2Forbidden = await localApiRequest({ path: '/proctor/schedules/101/rooms', method: 'GET', token: token2 });
  assert.equal(proctor2Forbidden.status, 403);

  // Student list per schedule (15 students each, 30 total)
  const students1 = await localApiRequest({ path: '/exam/students?code=TCC10126', method: 'GET' });
  assert.equal(students1.body.data.length, 15);
  assert.equal(students1.body.data[0].studentId, 'APP-2026-0001');

  const students2 = await localApiRequest({ path: '/exam/students?code=TCC10226', method: 'GET' });
  assert.equal(students2.body.data.length, 15);
  assert.equal(students2.body.data[0].studentId, 'APP-2026-0016');
});

test('backend-contract negative: rejects outdated camelCase join payload', async () => {
  const response = await localApiRequest({ path: '/exam/join', method: 'POST', body: { examinationCode: 'TCC10126', applicantId: 1 } });
  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
});

test('backend-contract: submission is idempotent and preserves the first receipt', async () => {
  await localApiRequest({ path: '/exam/join', method: 'POST', body: { code: 'TCC10126', applicant_id: 1 } });
  const participation_token = '00000000-0000-4000-8000-000000000001';
  const payload = { participation_token, answers: [{ exam_question_id: 5001, selected_answer: 'A' }] };
  const first = await localApiRequest({ path: '/exam/submit', method: 'POST', body: payload });
  const retry = await localApiRequest({ path: '/exam/submit', method: 'POST', body: payload });
  assert.equal(first.status, 200);
  assert.equal(retry.body.already_submitted, true);
  assert.equal(retry.body.submittedAt, first.body.submittedAt);
});

test('backend-contract: unauthorized and unsupported requests remain visible failures', async () => {
  const unauthorized = await localApiRequest({ path: '/proctor/schedules', method: 'GET' });
  assert.equal(unauthorized.status, 401);
  const wrongMethod = await localApiRequest({ path: '/proctor/schedules', method: 'POST', token: 'local-api-token-901' });
  assert.equal(wrongMethod.status, 404);
});

test('backend-contract: question guards, autosave validation, and persisted settings match Laravel', async () => {
  const token = 'local-api-token-901';
  await localApiRequest({ path: '/proctor/sessions', method: 'POST', token, body: { examination_schedule_id: 101, examination_room_id: 201 } });
  await localApiRequest({ path: '/exam/join-passkey', method: 'POST', body: { code: 'TCC10126', passkey: 'P0000001' } });
  const participation_token = '00000000-0000-4000-8000-000000000001';
  const waiting = await localApiRequest({ path: `/exam/questions?participation_token=${participation_token}`, method: 'GET' });
  assert.equal(waiting.status, 409);
  await localApiRequest({ path: '/proctor/sessions/9101/start', method: 'POST', token });
  const questions = await localApiRequest({ path: `/exam/questions?participation_token=${participation_token}`, method: 'GET' });
  assert.equal(questions.body.data.length, 40);
  const invalid = await localApiRequest({ path: '/exam/save', method: 'POST', body: { participation_token, answers: [{ exam_question_id: 999999, selected_answer: 'Z' }] } });
  assert.equal(invalid.status, 422);
  const raw = memory.get(LOCAL_DATA_KEY)!;
  const fixture = JSON.parse(raw);
  assert.deepEqual(fixture.settings, { duration_minutes: 60, allow_late_entry: false, shuffle_questions: true, shuffle_categories: false, shuffle_both: false, disconnect_grace_seconds: 120, room_student_limit: 60 });
});

test('backend-contract: proctor schedule visibility and room access are strictly authorized', async () => {
  const token = 'local-api-token-901';
  const schedules = await localApiRequest({ path: '/proctor/schedules', method: 'GET', token });
  assert.equal(schedules.status, 200);
  assert.ok(Array.isArray(schedules.body.data));

  // Requesting rooms for unauthorized schedule returns 403
  const unauthorizedScheduleRooms = await localApiRequest({
    path: '/proctor/schedules/999/rooms',
    method: 'GET',
    token,
  });
  assert.equal(unauthorizedScheduleRooms.status, 403);
  assert.match(unauthorizedScheduleRooms.body.message, /not assigned to this examination schedule/i);

  // Opening session for unauthorized room returns 403
  const unauthorizedRoomSession = await localApiRequest({
    path: '/proctor/sessions',
    method: 'POST',
    token,
    body: { examination_schedule_id: 101, examination_room_id: 999 },
  });
  assert.equal(unauthorizedRoomSession.status, 403);
  assert.match(unauthorizedRoomSession.body.message, /not assigned to this examination room/i);
});

