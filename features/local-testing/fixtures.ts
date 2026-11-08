import type { Question, StudentRecord } from '@/shared/types';
import { LOCAL_FIXTURE_VERSION } from './localMode';

export type LocalAttempt = {
  registrationId: number;
  applicantId: number;
  scheduleId: number;
  participationToken: string;
  answers: Record<string, string | null>;
  remainingSeconds: number;
  status: 'waiting' | 'taking_exam' | 'finished';
  submittedAt: string | null;
  score: number | null;
};

export type LocalProctor = {
  id: number;
  name: string;
  email: string;
  password: string;
  token: string;
};

export type LocalApiState = {
  fixtureVersion: string;
  generatedAt: string;
  academicYear: { id: number; name: string; is_current: true };
  programs: Array<{ id: number; code: string; name: string }>;
  settings: { duration_minutes: number; allow_late_entry: false; shuffle_questions: boolean; shuffle_categories: boolean; shuffle_both: boolean; disconnect_grace_seconds: number; room_student_limit: number };
  proctor: LocalProctor;
  proctors: LocalProctor[];
  schedules: Array<Record<string, unknown>>;
  rooms: Array<Record<string, unknown>>;
  students: StudentRecord[];
  passkeys: Record<string, number>;
  questions: Question[];
  attempts: Record<string, LocalAttempt>;
  sessionStatus: Record<string, 'idle' | 'lobby_open' | 'in_progress' | 'ended'>;
};

import type { OfflinePack } from '@/features/synchronization/services/offlineStore';

export type MakeLocalFixturesOptions = {
  useCurrentTimeWindow?: boolean;
};

function manilaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function makeLocalFixtures(
  now = new Date(),
  options?: MakeLocalFixturesOptions,
): LocalApiState {
  const date = manilaDate(now);
  const programs = [
    ['BSIT', 'Bachelor of Science in Information Technology'],
    ['BSA', 'Bachelor of Science in Accountancy'],
    ['BSED', 'Bachelor of Secondary Education'],
  ];
  const students: StudentRecord[] = Array.from({ length: 30 }, (_, index) => {
    const id = index + 1;
    const [programCode, programName] = programs[index % programs.length];
    const firstName = `Applicant${String(id).padStart(2, '0')}`;
    const lastName = ['Santos', 'Reyes', 'Garcia', 'Mendoza', 'Flores'][index % 5];
    return {
      id: String(id), studentId: `APP-2026-${String(id).padStart(4, '0')}`,
      firstName, middleName: '', lastName, fullName: `${firstName} ${lastName}`,
      email: `applicant${String(id).padStart(2, '0')}@example.test`,
      programId: programCode, programCode, programName, sex: index % 2 ? 'Female' : 'Male',
      avatarInitials: `A${lastName[0]}`, registration_id: 1000 + id,
      selectionStatus: 'available', statusLabel: 'Available', selectable: true,
    };
  });
  const categories = [['ENG', 'English'], ['MATH', 'Mathematics'], ['SCI', 'Science'], ['LOG', 'Logic']];
  const questions: Question[] = Array.from({ length: 40 }, (_, index) => {
    const id = 5001 + index;
    const [categoryCode, category] = categories[index % categories.length];
    return {
      id: String(id), number: index + 1, subjectId: String(700 + (index % 4)), category,
      categoryCode, type: 'multiple_choice', question: `${category} practice item ${index + 1}`,
      choices: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
      correctAnswer: (['A', 'B', 'C', 'D'] as const)[index % 4], explanation: '',
    };
  });
  const proctors: LocalProctor[] = [
    {
      id: 901,
      name: 'Proctor Maria Santos',
      email: 'proctor1.local@tcc.test',
      password: 'LocalTest123!',
      token: 'local-api-token-901',
    },
    {
      id: 902,
      name: 'Proctor Juan Reyes',
      email: 'proctor2.local@tcc.test',
      password: 'LocalTest123!',
      token: 'local-api-token-902',
    },
  ];
  return {
    fixtureVersion: LOCAL_FIXTURE_VERSION,
    generatedAt: now.toISOString(),
    academicYear: { id: 2026, name: '2026-2027', is_current: true },
    programs: programs.map(([code, name], index) => ({ id: index + 1, code, name })),
    settings: {
      duration_minutes: 60,
      allow_late_entry: false,
      shuffle_questions: true,
      shuffle_categories: false,
      shuffle_both: false,
      disconnect_grace_seconds: 120,
      room_student_limit: 60,
    },
    proctor: proctors[0],
    proctors,
    schedules: (() => {
      let s1Start = '08:00:00';
      let s1End = '09:00:00';
      let s1Slot = '08:00–09:00';
      let s2Start = '10:00:00';
      let s2End = '11:00:00';
      let s2Slot = '10:00–11:00';

      if (options?.useCurrentTimeWindow) {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
        }).formatToParts(now);
        const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '8');
        const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

        // Start 5 minutes prior to ensure join-early or current availability window is live right now
        const startMin = Math.max(0, m - (m % 5));
        const startH = h;
        const endH = (startH + 1) % 24;
        const nextH = (endH + 1) % 24;
        const nextEndH = (nextH + 1) % 24;

        const pad = (n: number) => String(n).padStart(2, '0');
        s1Start = `${pad(startH)}:${pad(startMin)}:00`;
        s1End = `${pad(endH)}:${pad(startMin)}:00`;
        s1Slot = `${pad(startH)}:${pad(startMin)}–${pad(endH)}:${pad(startMin)}`;

        s2Start = `${pad(nextH)}:${pad(startMin)}:00`;
        s2End = `${pad(nextEndH)}:${pad(startMin)}:00`;
        s2Slot = `${pad(nextH)}:${pad(startMin)}–${pad(nextEndH)}:${pad(startMin)}`;
      }

      return [
        {
          id: 101,
          title: 'TCC Entrance Examination',
          exam_date: date,
          start_time: s1Start,
          end_time: s1End,
          time_slot: s1Slot,
          venue: 'TCC Main Campus - Computer Lab 1',
          batch_code: 'Batch 1',
          course: 'All Programs',
          status: 'scheduled',
          expected_examinees: 15,
          registrations_count: 15,
          rooms_count: 1,
          completed_rooms_count: 0,
        },
        {
          id: 102,
          title: 'TCC Entrance Examination',
          exam_date: date,
          start_time: s2Start,
          end_time: s2End,
          time_slot: s2Slot,
          venue: 'TCC Main Campus - Computer Lab 2',
          batch_code: 'Batch 2',
          course: 'All Programs',
          status: 'scheduled',
          expected_examinees: 15,
          registrations_count: 15,
          rooms_count: 1,
          completed_rooms_count: 0,
        },
        {
          id: 103,
          title: 'Restricted Local Examination',
          exam_date: date,
          start_time: '13:00:00',
          end_time: '14:00:00',
          time_slot: '13:00–14:00',
          venue: 'TCC Annex',
          batch_code: 'Batch 3',
          course: 'All Programs',
          status: 'scheduled',
          expected_examinees: 0,
          registrations_count: 0,
          rooms_count: 1,
          completed_rooms_count: 0,
        },
      ];
    })(),
    rooms: [
      {
        id: 201,
        schedule_id: 101,
        examination_schedule_id: 101,
        room_name: 'Computer Laboratory 1',
        capacity: 20,
        student_count: 15,
        assigned_proctor_id: 901,
        assigned_proctor_name: 'Proctor Maria Santos',
      },
      {
        id: 202,
        schedule_id: 102,
        examination_schedule_id: 102,
        room_name: 'Computer Laboratory 2',
        capacity: 20,
        student_count: 15,
        assigned_proctor_id: 902,
        assigned_proctor_name: 'Proctor Juan Reyes',
      },
      {
        id: 203,
        schedule_id: 103,
        examination_schedule_id: 103,
        room_name: 'Restricted Laboratory',
        capacity: 20,
        student_count: 0,
        assigned_proctor_id: 999,
        assigned_proctor_name: 'Unassigned Proctor',
      },
    ],
    students,
    passkeys: Object.fromEntries(students.map((student) => [`P${String(student.id).padStart(7, '0')}`, Number(student.id)])),
    questions,
    attempts: {},
    sessionStatus: { '101': 'idle', '102': 'idle', '103': 'idle' },
  };
}

export function makeOfflinePackFromLocalState(state: LocalApiState, proctorId = 901): OfflinePack {
  const currentProctor = state.proctors?.find((p) => p.id === proctorId) || state.proctor;
  const authorizedRooms = state.rooms.filter((r) => Number(r.assigned_proctor_id) === currentProctor.id);
  const authorizedScheduleIds = new Set(authorizedRooms.map((r) => Number(r.schedule_id)));
  const authorizedSchedules = state.schedules.filter((s) => authorizedScheduleIds.has(Number(s.id)));

  const registrations = state.students
    .map((student, index) => {
      const scheduleId = index < 15 ? 101 : 102;
      const roomId = scheduleId === 101 ? 201 : 202;
      const passkey = Object.entries(state.passkeys).find(([, id]) => id === Number(student.id))?.[0] ?? null;
      return {
        id: Number(student.registration_id),
        examination_schedule_id: scheduleId,
        applicant_id: Number(student.id),
        assigned_room_id: roomId,
        exam_passkey: passkey,
      };
    })
    .filter((reg) => authorizedScheduleIds.has(reg.examination_schedule_id) && authorizedRooms.some((r) => Number(r.id) === reg.assigned_room_id));

  const regApplicantIds = new Set(registrations.map((r) => r.applicant_id));

  return {
    pack_version: 1,
    exported_at: state.generatedAt,
    downloaded_at: new Date().toISOString(),
    authorization: {
      actor_id: currentProctor.id,
      scope: 'assigned_rooms',
      schedule_ids: [...authorizedScheduleIds],
    },
    schedules: authorizedSchedules.map((schedule) => ({
      ...schedule,
      id: Number(schedule.id),
      title: String(schedule.title),
      exam_date: String(schedule.exam_date),
      start_time: String(schedule.start_time),
      end_time: String(schedule.end_time),
      time_slot: String(schedule.time_slot),
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
          proctor_id: currentProctor.id,
        })),
    })),
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
    proctors: [{
      id: currentProctor.id,
      name: currentProctor.name,
      email: currentProctor.email,
      status: 'active',
    }],
    question_banks: [{
      id: 1,
      title: 'Local Active Examination Bank',
      is_active: true,
      subjects: [{
        id: 1,
        name: 'Local Examination',
        is_active: true,
        questions: state.questions.map((q) => ({
          id: Number(q.id),
          stem: q.question,
          options: q.choices,
          correct_answer: q.correctAnswer,
          is_selected_for_exam: true,
          status: 'active',
        })),
      }],
    }],
    examination_settings: state.settings,
  };
}

