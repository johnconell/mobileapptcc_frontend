import { loadLocalApiState, saveLocalApiState } from './localApiStore';
import type { LocalAttempt } from './fixtures';
import { isValidPasskey, normalizePasskey } from '@/features/examinations/services/passkeyFormat';

export type LocalTransportRequest = { path: string; method: string; body?: unknown; token?: string | null };
export type LocalTransportResult = { status: number; body: any };

const ok = (body: any): LocalTransportResult => ({ status: 200, body });
const fail = (status: number, message: string, errors?: Record<string, string[]>): LocalTransportResult => ({ status, body: { success: false, message, ...(errors ? { errors } : {}) } });
const objectBody = (body: unknown): Record<string, any> => body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, any> : {};
const uuid = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

export async function localApiRequest(request: LocalTransportRequest): Promise<LocalTransportResult> {
  const method = request.method.toUpperCase();
  const url = new URL(request.path, 'https://local.test');
  const path = url.pathname;
  const body = objectBody(request.body);
  const state = await loadLocalApiState();
  const proctorList = state.proctors && state.proctors.length > 0
    ? state.proctors
    : [state.proctor];

  if (path === '/proctor/login' && method === 'POST') {
    const login = typeof body.email === 'string' && body.email.trim() ? body.email : body.username;
    if (typeof login !== 'string' || !login.trim() || typeof body.password !== 'string') return fail(422, 'Email or username is required.');
    const cleanLogin = login.trim().toLowerCase();
    const foundProctor = proctorList.find((p) =>
      (p.email.toLowerCase() === cleanLogin || (cleanLogin === 'proctor.local@tcc.test' && p.id === 901)) &&
      body.password === p.password,
    );
    if (!foundProctor) return fail(401, 'Invalid credentials.');
    return ok({
      success: true,
      message: 'Login successful.',
      data: {
        token: foundProctor.token,
        profile: {
          id: String(foundProctor.id),
          username: foundProctor.email,
          displayName: foundProctor.name,
          roleLabel: 'Proctor',
        },
      },
    });
  }

  const publicExam = path.startsWith('/exam/');
  const currentProctor = proctorList.find((p) => p.token === request.token);
  if (!publicExam && !currentProctor) return fail(401, 'Unauthenticated.');

  const proctorId = currentProctor ? currentProctor.id : 0;
  const authorizedRooms = state.rooms.filter(
    (room) => Number(room.assigned_proctor_id) === proctorId,
  );
  const authorizedScheduleIds = new Set(
    authorizedRooms.map((room) => Number(room.schedule_id)),
  );
  const authorizedSchedules = state.schedules.filter((schedule) =>
    authorizedScheduleIds.has(Number(schedule.id)),
  );

  if (path === '/proctor/me' && method === 'GET') return ok({ success: true, data: { profile: { id: String(currentProctor!.id), username: currentProctor!.email, displayName: currentProctor!.name, roleLabel: 'Proctor' } } });
  if (path === '/proctor/logout' && method === 'POST') return ok({ success: true, message: 'Logged out.' });
  if (path === '/proctor/schedules' && method === 'GET') return ok({ success: true, data: authorizedSchedules, meta: { server_now: new Date().toISOString(), academic_year: state.academicYear } });
  if (path === '/proctor/exam-day-pack' && method === 'GET') {
    const schedules = authorizedSchedules.map((schedule) => ({
      ...schedule,
      academic_year: state.academicYear.name,
      rooms_managed: true,
      rooms_revision: 1,
      rooms_published_at: state.generatedAt,
      rooms: authorizedRooms
        .filter((room) => Number(room.schedule_id) === Number(schedule.id))
        .map((room) => ({
          id: Number(room.id),
          examination_schedule_id: Number(schedule.id),
          room_name: String(room.room_name),
          capacity: Number(room.capacity),
          proctor_id: currentProctor!.id,
        })),
    }));
    const registrations = state.students.map((student, index) => {
      const scheduleId = index < 15 ? 101 : 102;
      const roomId = scheduleId === 101 ? 201 : 202;
      const passkey = Object.entries(state.passkeys).find(([, applicantId]) => applicantId === Number(student.id))?.[0] ?? null;
      return {
        id: Number(student.registration_id),
        examination_schedule_id: scheduleId,
        applicant_id: Number(student.id),
        assigned_room_id: roomId,
        exam_passkey: passkey,
      };
    }).filter((registration) => authorizedScheduleIds.has(registration.examination_schedule_id) && authorizedRooms.some((r) => Number(r.id) === registration.assigned_room_id));
    const regApplicantIds = new Set(registrations.map((r) => r.applicant_id));
    return ok({
      success: true,
      data: {
        pack_version: 1,
        pack_revision: state.fixtureVersion,
        exported_at: new Date().toISOString(),
        authorization: { actor_id: currentProctor!.id, scope: 'assigned_rooms', schedule_ids: [...authorizedScheduleIds] },
        schedules,
        applicants: state.students
          .filter((student) => regApplicantIds.has(Number(student.id)))
          .map((student) => ({
            id: Number(student.id),
            applicant_code: student.studentId,
            name: student.fullName,
            email: student.email,
            course_applied: student.programCode,
          })),
        registrations,
        proctors: [{ id: currentProctor!.id, name: currentProctor!.name, email: currentProctor!.email, status: 'active' }],
        question_banks: [{
          id: 1,
          title: 'Local Active Examination Bank',
          is_active: true,
          subjects: [{
            id: 1,
            name: 'Local Examination',
            is_active: true,
            questions: state.questions.map((question) => ({
              id: Number(question.id),
              stem: question.question,
              options: question.choices,
              correct_answer: question.correctAnswer,
              is_selected_for_exam: true,
              status: 'active',
            })),
          }],
        }],
        examination_settings: state.settings,
      },
    });
  }
  if (path === '/proctor/exam-day-pack-status' && method === 'GET') {
    const studentCount = authorizedRooms.reduce((sum, r) => sum + Number(r.student_count || 0), 0);
    return ok({ success: true, data: {
      update_required: false,
      pack_revision: state.fixtureVersion,
      registration_count: studentCount,
      schedule_count: authorizedSchedules.length,
      content_fingerprint: `local-${state.fixtureVersion}-${[...authorizedScheduleIds].join('-')}`,
    } });
  }

  let match = path.match(/^\/proctor\/schedules\/(\d+)\/rooms$/);
  if (match && method === 'GET') {
    const scheduleId = Number(match[1]);
    if (!authorizedScheduleIds.has(scheduleId)) return fail(403, 'You are not assigned to this examination schedule.');
    return ok({ success: true, data: authorizedRooms.filter((room) => Number(room.schedule_id) === scheduleId).map((room) => ({ ...room, proctor_id: currentProctor!.id, proctor_name: currentProctor!.name, can_open: true, can_control: true, connected_count: 0, status: state.sessionStatus[String(scheduleId)] })) });
  }
  if (path === '/proctor/sessions' && method === 'POST') {
    if (!Number.isInteger(body.examination_schedule_id) || !Number.isInteger(body.examination_room_id)) return fail(422, 'The given data was invalid.', { examination_schedule_id: ['The examination schedule id field is required.'], examination_room_id: ['The examination room id field is required.'] });
    const scheduleId = Number(body.examination_schedule_id);
    const roomId = Number(body.examination_room_id);
    if (!authorizedScheduleIds.has(scheduleId)) return fail(403, 'You are not assigned to this examination schedule.');
    if (!authorizedRooms.some((room) => Number(room.id) === roomId && Number(room.schedule_id) === scheduleId)) return fail(403, 'You are not assigned to this examination room.');
    state.sessionStatus[String(scheduleId)] = 'lobby_open'; await saveLocalApiState(state);
    return ok({ success: true, message: 'Examination lobby opened.', data: lobby(state, scheduleId) });
  }
  match = path.match(/^\/proctor\/schedules\/(\d+)\/lobby$/);
  if (match && method === 'GET') {
    const scheduleId = Number(match[1]);
    if (!authorizedScheduleIds.has(scheduleId)) return fail(403, 'You are not assigned to this examination schedule.');
    return ok({ success: true, data: state.sessionStatus[match[1]] === 'idle' ? null : lobby(state, scheduleId) });
  }
  match = path.match(/^\/proctor\/sessions\/(\d+)\/(start|close|end)$/);
  if (match && method === 'POST') {
    const scheduleId = Number(match[1]) - 9000;
    if (!authorizedScheduleIds.has(scheduleId)) return fail(403, 'You are not assigned to this examination session.');
    const next = match[2] === 'start' ? 'in_progress' : 'ended';
    state.sessionStatus[String(scheduleId)] = next; await saveLocalApiState(state);
    return ok({ success: true, data: lobby(state, scheduleId) });
  }
  if (path === '/exam/resolve' && method === 'POST') {
    if (typeof body.code !== 'string') return fail(422, 'The given data was invalid.', { code: ['The code field is required.'] });
    const scheduleId = scheduleForCode(body.code);
    if (!scheduleId) return fail(404, 'Invalid or inactive examination code.');
    const snapshot = lobby(state, scheduleId);
    return ok({ success: true, valid: true, message: 'Examination found.', data: snapshot, schedule: snapshot.schedule, session: snapshot.session, examinationCode: codeFor(scheduleId) });
  }
  if (path === '/exam/students' && method === 'GET') {
    if (!currentProctor) return fail(401, 'Authentication required for legacy student lists.');
    const scheduleId = scheduleForCode(url.searchParams.get('code') ?? '');
    if (!scheduleId) return fail(404, 'Invalid or inactive examination code.');
    if (!authorizedScheduleIds.has(scheduleId)) return fail(403, 'You are not assigned to this examination schedule.');
    const range = scheduleId === 101 ? [0, 15] : [15, 30];
    return ok({
      success: true,
      data: state.students.slice(range[0], range[1]).map(({ email, ...student }) => student),
    });
  }
  if ((path === '/exam/claim' || path === '/exam/release-claim') && method === 'POST') {
    if (!currentProctor) return fail(401, 'Authentication required for legacy student claims.');
    if (typeof body.code !== 'string' || !Number.isInteger(body.applicant_id)) return fail(422, 'The given data was invalid.', { applicant_id: ['The applicant id field must be an integer.'] });
    const scheduleId = scheduleForCode(body.code);
    if (!scheduleId || !authorizedScheduleIds.has(scheduleId)) return fail(403, 'You are not assigned to this examination schedule.');
    const student = state.students.find((row) => Number(row.id) === body.applicant_id);
    if (!student) return fail(422, 'The selected applicant id is invalid.');
    return ok({ success: true, message: path.endsWith('release-claim') ? 'Student name released.' : 'Student name reserved.', ...(path.endsWith('/claim') ? { data: { registration_id: student.registration_id, selectionStatus: 'ready' } } : {}) });
  }
  if (path === '/exam/join' && method === 'POST') {
    const scheduleId = scheduleForCode(body.code);
    if (!scheduleId || !Number.isInteger(body.applicant_id)) return fail(422, 'The given data was invalid.');
    const student = state.students.find((row) => Number(row.id) === body.applicant_id);
    if (!student) return fail(422, 'The selected applicant id is invalid.');
    const participationToken = uuid(Number(student.id));
    state.attempts[participationToken] ??= { registrationId: student.registration_id!, applicantId: Number(student.id), scheduleId, participationToken, answers: {}, remainingSeconds: 3600, status: 'waiting', submittedAt: null, score: null };
    await saveLocalApiState(state);
    return ok({ success: true, message: 'Joined examination lobby.', data: { registration_id: student.registration_id, participation_token: participationToken, lobby: lobby(state, scheduleId) } });
  }
  if (path === '/exam/passkey/validate' && method === 'POST') {
    const scheduleId = scheduleForCode(body.code);
    if (!scheduleId || typeof body.passkey !== 'string' || !isValidPasskey(body.passkey)) return fail(422, 'The given data was invalid.');
    const applicantId = state.passkeys[normalizePasskey(body.passkey)];
    const validRange = scheduleId === 101 ? applicantId >= 1 && applicantId <= 15 : applicantId >= 16 && applicantId <= 30;
    if (!applicantId || !validRange) return fail(422, 'Invalid examination key for this schedule.');
    return ok({ success: true, message: 'Examination key verified.', data: { student: state.students[applicantId - 1], schedule: state.schedules.find((row) => Number(row.id) === scheduleId) } });
  }
  if (path === '/exam/join-passkey' && method === 'POST') {
    const scheduleId = scheduleForCode(body.code);
    const applicantId = typeof body.passkey === 'string' ? state.passkeys[normalizePasskey(body.passkey)] : undefined;
    if (!scheduleId || !applicantId) return fail(422, 'Invalid examination key.');
    const student = state.students[applicantId - 1];
    const participationToken = uuid(applicantId);
    state.attempts[participationToken] ??= { registrationId: student.registration_id!, applicantId, scheduleId, participationToken, answers: {}, remainingSeconds: 3600, status: 'waiting', submittedAt: null, score: null };
    await saveLocalApiState(state);
    return ok({ success: true, message: 'Joined examination lobby.', data: { registration_id: student.registration_id, participation_token: participationToken, lobby: lobby(state, scheduleId) } });
  }
  if (path === '/exam/lobby' && method === 'GET') {
    const attempt = state.attempts[url.searchParams.get('participation_token') ?? ''];
    const scheduleId = attempt?.scheduleId ?? scheduleForCode(url.searchParams.get('code') ?? '');
    if (!scheduleId) return fail(404, 'Invalid participation token.');
    return ok({ success: true, data: lobby(state, scheduleId) });
  }
  if (path === '/exam/questions' && method === 'GET') {
    const attempt = state.attempts[url.searchParams.get('participation_token') ?? ''];
    if (!attempt) return fail(404, 'Invalid participation token.');
    if (state.sessionStatus[String(attempt.scheduleId)] === 'lobby_open') return fail(409, 'The examination has not started yet. Please wait for your proctor.');
    if (attempt.submittedAt) return fail(422, 'You already submitted this examination.');
    return ok({ success: true, data: state.questions });
  }
  if ((path === '/exam/save' || path === '/exam/submit') && method === 'POST') {
    const attempt = state.attempts[String(body.participation_token ?? '')];
    if (!attempt) return fail(404, 'Invalid participation token.');
    if (!Array.isArray(body.answers)) return fail(422, 'The given data was invalid.', { answers: ['The answers field is required.'] });
    for (const answer of body.answers) {
      if (!Number.isInteger(answer?.exam_question_id) || !state.questions.some((q) => Number(q.id) === answer.exam_question_id)) return fail(422, 'The given data was invalid.', { 'answers.0.exam_question_id': ['The selected answers.0.exam question id is invalid.'] });
      if (answer.selected_answer !== null && !['A', 'B', 'C', 'D'].includes(answer.selected_answer)) return fail(422, 'The given data was invalid.', { 'answers.0.selected_answer': ['The selected answer is invalid.'] });
      attempt.answers[String(answer.exam_question_id)] = answer.selected_answer;
    }
    if (path === '/exam/save') { await saveLocalApiState(state); return ok({ success: true, message: 'Progress saved.', data: { saved: true, saved_at: new Date().toISOString() } }); }
    if (attempt.submittedAt) return ok({ success: true, message: 'Examination submission was already confirmed.', submittedAt: attempt.submittedAt, already_submitted: true, data: { score: attempt.score } });
    attempt.score = state.questions.filter((q) => attempt.answers[q.id] === q.correctAnswer).length;
    attempt.submittedAt = new Date().toISOString(); attempt.status = 'finished'; await saveLocalApiState(state);
    return ok({ success: true, message: 'Examination submitted successfully.', submittedAt: attempt.submittedAt, already_submitted: false, data: { score: attempt.score, items_total: state.questions.length, result_status: attempt.score >= 20 ? 'passed' : 'failed' } });
  }
  if (path === '/exam/heartbeat' && method === 'POST') return state.attempts[String(body.participation_token ?? '')] ? ok({ success: true, data: { ok: true } }) : fail(404, 'Invalid participation token.');
  return fail(404, `Local contract has no route for ${method} ${path}.`);
}

const codeFor = (scheduleId: number) => scheduleId === 101 ? 'TCC10126' : 'TCC10226';
const scheduleForCode = (code: unknown) => code === 'TCC10126' ? 101 : code === 'TCC10226' ? 102 : null;
function lobby(state: Awaited<ReturnType<typeof loadLocalApiState>>, scheduleId: number) {
  const schedule: any = state.schedules.find((row) => Number(row.id) === scheduleId)!;
  const room: any = state.rooms.find((row) => Number(row.schedule_id) === scheduleId)!;
  const attempts = Object.values(state.attempts).filter((row: LocalAttempt) => row.scheduleId === scheduleId);
  const status = state.sessionStatus[String(scheduleId)];
  return { schedule: { id: `date-${schedule.exam_date}-TCC-Entrance-Examination`, name: schedule.title, schoolYear: state.academicYear.name, examinationDate: schedule.exam_date, examinationDateIso: schedule.exam_date, batchCount: 2 }, session: { id: String(scheduleId), scheduleId: String(scheduleId), examSessionId: 9000 + scheduleId, timeLabel: schedule.time_slot, startTime: String(schedule.start_time).slice(0, 5), endTime: String(schedule.end_time).slice(0, 5), venue: schedule.venue, batchNumber: schedule.batch_code, registeredStudents: 15, durationMinutes: 60, totalQuestions: state.questions.length }, status: status === 'idle' ? 'lobby_open' : status, examinationCode: codeFor(scheduleId), qrValue: codeFor(scheduleId), roomName: room.room_name, roomId: room.id, registeredCount: 15, connectedCount: attempts.length, notYetConnectedCount: 15 - attempts.length, waitingCount: attempts.filter((a) => a.status === 'waiting').length, takingCount: attempts.filter((a) => a.status === 'taking_exam').length, finishedCount: attempts.filter((a) => a.status === 'finished').length, warningCount: 0, terminatedCount: 0, violationsDetected: 0, students: [], can_control: true };
}
