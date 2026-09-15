import {
  OfflineStore,
  type OfflineQueuedResult,
  type OfflinePack,
  toLocalDateString,
} from '@/features/synchronization/services/offlineStore';

export interface SeedResultsReport {
  success: boolean;
  totalResults: number;
  unsyncedCount: number;
  lobbiesCount: number;
  message: string;
}

const SEED_APPLICANTS = [
  { id: 101, code: 'APP-2026-001', name: 'Juan Carlos Dela Cruz', course: 'BS Information Technology', email: 'jcdelacruz@example.com' },
  { id: 102, code: 'APP-2026-002', name: 'Maria Cristina Santos', course: 'BS Computer Science', email: 'mcsantos@example.com' },
  { id: 103, code: 'APP-2026-003', name: 'Mark Angelo Reyes', course: 'BS Information Technology', email: 'mareyes@example.com' },
  { id: 104, code: 'APP-2026-004', name: 'Patricia Nicole Gomez', course: 'Bachelor of Secondary Education', email: 'pngomez@example.com' },
  { id: 105, code: 'APP-2026-005', name: 'Kevin Matthew Bautista', course: 'BS Hospitality Management', email: 'kmbautista@example.com' },
  { id: 106, code: 'APP-2026-006', name: 'Angela Mae Dizon', course: 'BS Computer Science', email: 'amdizon@example.com' },
  { id: 107, code: 'APP-2026-007', name: 'Joshua Neil Ramos', course: 'BS Information Technology', email: 'jnramos@example.com' },
  { id: 108, code: 'APP-2026-008', name: 'Bea Cassandra Flores', course: 'Bachelor of Elementary Education', email: 'bcflores@example.com' },
  { id: 109, code: 'APP-2026-009', name: 'Gabriel Luis Villanueva', course: 'BS Hospitality Management', email: 'glvillanueva@example.com' },
  { id: 110, code: 'APP-2026-010', name: 'Samantha Joy Mendoza', course: 'BS Computer Science', email: 'sjmendoza@example.com' },
  { id: 111, code: 'APP-2026-011', name: 'Christian Paul Tan', course: 'BS Information Technology', email: 'cptan@example.com' },
  { id: 112, code: 'APP-2026-012', name: 'Alyssa Marie Garcia', course: 'Bachelor of Secondary Education', email: 'amgarcia@example.com' },
  { id: 113, code: 'APP-2026-013', name: 'Daniel Ethan Castillo', course: 'BS Hospitality Management', email: 'decastillo@example.com' },
  { id: 114, code: 'APP-2026-014', name: 'Hannah Sofia Aquino', course: 'BS Computer Science', email: 'hsaquino@example.com' },
  { id: 115, code: 'APP-2026-015', name: 'John Rafael Mercado', course: 'BS Information Technology', email: 'jrmercado@example.com' },
  { id: 116, code: 'APP-2026-016', name: 'Camille Bianca Cruz', course: 'Bachelor of Elementary Education', email: 'cbcruz@example.com' },
  { id: 117, code: 'APP-2026-017', name: 'Vincent Edward Lim', course: 'BS Computer Science', email: 'velim@example.com' },
  { id: 118, code: 'APP-2026-018', name: 'Rochelle Anne Navarro', course: 'BS Hospitality Management', email: 'ranavarro@example.com' },
];

/**
 * Seed realistic mock examination results and lobby transactions.
 * Includes:
 * - 2 ended lobbies with completed examinee submissions (passed and failed)
 * - 1 in-progress lobby with live examinee status
 * - Mixed synced (green) and unsynced (red dot) examinee records
 * - Complete applicant profile metadata (names, courses, applicant codes)
 */
export async function seedSampleResults(): Promise<SeedResultsReport> {
  const todayStr = toLocalDateString();
  const existingPack = await OfflineStore.getPack();

  // 1. Prepare Schedules
  const schedules: OfflinePack['schedules'] = [
    {
      id: 1,
      title: 'Entrance Examination - Batch A',
      exam_date: todayStr,
      start_time: '08:00:00',
      end_time: '09:30:00',
      time_slot: '08:00 AM - 09:30 AM',
      venue: 'Testing Center · Room 101',
      rooms: [{ id: 1, room_name: 'Room 101', capacity: 40 }],
    },
    {
      id: 2,
      title: 'Entrance Examination - Batch B',
      exam_date: todayStr,
      start_time: '10:00:00',
      end_time: '11:30:00',
      time_slot: '10:00 AM - 11:30 AM',
      venue: 'Testing Center · Room 102',
      rooms: [{ id: 2, room_name: 'Room 102', capacity: 40 }],
    },
    {
      id: 3,
      title: 'Entrance Examination - Batch C',
      exam_date: todayStr,
      start_time: '13:00:00',
      end_time: '14:30:00',
      time_slot: '01:00 PM - 02:30 PM',
      venue: 'Testing Center · Room 103',
      rooms: [{ id: 3, room_name: 'Room 103', capacity: 40 }],
    },
  ];

  // 2. Prepare Applicants
  const applicants: OfflinePack['applicants'] = SEED_APPLICANTS.map((a) => ({
    id: a.id,
    applicant_code: a.code,
    name: a.name,
    course_applied: a.course,
    email: a.email,
  }));

  // 3. Prepare Registrations
  const registrations: OfflinePack['registrations'] = [
    // Sched 1: 8 students
    ...SEED_APPLICANTS.slice(0, 8).map((a, idx) => ({
      id: 200 + idx,
      examination_schedule_id: 1,
      applicant_id: a.id,
      exam_passkey: `KEY-${a.code.slice(-3)}`,
    })),
    // Sched 2: 6 students
    ...SEED_APPLICANTS.slice(8, 14).map((a, idx) => ({
      id: 210 + idx,
      examination_schedule_id: 2,
      applicant_id: a.id,
      exam_passkey: `KEY-${a.code.slice(-3)}`,
    })),
    // Sched 3: 4 students
    ...SEED_APPLICANTS.slice(14, 18).map((a, idx) => ({
      id: 220 + idx,
      examination_schedule_id: 3,
      applicant_id: a.id,
      exam_passkey: `KEY-${a.code.slice(-3)}`,
    })),
  ];

  // 4. Update / Save Offline Pack with mock metadata if needed
  const packToSave: OfflinePack = {
    pack_version: existingPack?.pack_version || 1,
    exported_at: existingPack?.exported_at || new Date().toISOString(),
    schedules: existingPack?.schedules?.length ? existingPack.schedules : schedules,
    applicants: existingPack?.applicants?.length ? existingPack.applicants : applicants,
    registrations: existingPack?.registrations?.length ? existingPack.registrations : registrations,
    examination_settings: existingPack?.examination_settings || {
      duration_minutes: 90,
      shuffle_questions: true,
    },
    question_banks: existingPack?.question_banks?.length
      ? existingPack.question_banks
      : [
          {
            id: 1,
            title: 'General Admission Question Bank',
            is_active: true,
            subjects: [
              {
                id: 1,
                name: 'General Knowledge & Logic',
                questions: [
                  {
                    id: 1,
                    stem: 'What is the primary function of an algorithm?',
                    options: ['Step-by-step procedure to solve a problem', 'Hardware component', 'Network cable', 'Power supply'],
                    correct_answer: 'Step-by-step procedure to solve a problem',
                    is_selected_for_exam: true,
                    status: 'active',
                  },
                ],
              },
            ],
          },
        ],
  };

  // If existing pack didn't have schedule 1 or 2, merge them in
  if (existingPack?.schedules?.length) {
    const existingSchedIds = new Set(existingPack.schedules.map((s) => s.id));
    for (const s of schedules) {
      if (!existingSchedIds.has(s.id)) {
        packToSave.schedules.push(s);
      }
    }
    const existingAppCodes = new Set(
      (existingPack.applicants || []).map((a) => a.applicant_code.toUpperCase()),
    );
    for (const a of applicants) {
      if (!existingAppCodes.has(a.applicant_code.toUpperCase())) {
        packToSave.applicants.push(a);
      }
    }
    const existingRegIds = new Set((existingPack.registrations || []).map((r) => r.id));
    for (const r of registrations) {
      if (!existingRegIds.has(r.id)) {
        packToSave.registrations.push(r);
      }
    }
  }

  await OfflineStore.savePack(packToSave);

  // 5. Setup Opened Rooms in OfflineStore
  // Lobby 1: Room 101, Schedule 1 - ENDED
  await OfflineStore.setOpenedRoom(1, 1, 'RM101', 'ended');
  // Lobby 2: Room 102, Schedule 2 - ENDED
  await OfflineStore.setOpenedRoom(2, 2, 'RM102', 'ended');
  // Lobby 3: Room 103, Schedule 3 - IN PROGRESS
  await OfflineStore.setOpenedRoom(3, 3, 'RM103', 'in_progress');

  // 6. Generate Realistic Queued Results
  // Schedule 1: 8 completed examinees (6 passed, 2 failed; 3 unsynced to test RED NOTIFICATION DOTS)
  const sched1Results: OfflineQueuedResult[] = [
    {
      local_id: 'seed-res-001',
      applicant_code: 'APP-2026-001',
      examination_schedule_id: 1,
      applicant_name: 'Juan Carlos Dela Cruz',
      attendance_status: 'present',
      result_status: 'passed',
      score: 88.3,
      items_correct: 53,
      items_total: 60,
      grade_point: 1.5,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 3).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-002',
      applicant_code: 'APP-2026-002',
      examination_schedule_id: 1,
      applicant_name: 'Maria Cristina Santos',
      attendance_status: 'present',
      result_status: 'passed',
      score: 93.3,
      items_correct: 56,
      items_total: 60,
      grade_point: 1.25,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.8).toISOString(),
      synced: false, // UNSYNCED -> Red Dot!
    },
    {
      local_id: 'seed-res-003',
      applicant_code: 'APP-2026-003',
      examination_schedule_id: 1,
      applicant_name: 'Mark Angelo Reyes',
      attendance_status: 'present',
      result_status: 'passed',
      score: 81.7,
      items_correct: 49,
      items_total: 60,
      grade_point: 1.75,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.7).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-004',
      applicant_code: 'APP-2026-004',
      examination_schedule_id: 1,
      applicant_name: 'Patricia Nicole Gomez',
      attendance_status: 'present',
      result_status: 'failed',
      score: 65.0,
      items_correct: 39,
      items_total: 60,
      grade_point: 3.0,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.5).toISOString(),
      synced: false, // UNSYNCED -> Red Dot!
    },
    {
      local_id: 'seed-res-005',
      applicant_code: 'APP-2026-005',
      examination_schedule_id: 1,
      applicant_name: 'Kevin Matthew Bautista',
      attendance_status: 'present',
      result_status: 'passed',
      score: 76.7,
      items_correct: 46,
      items_total: 60,
      grade_point: 2.25,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.3).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-006',
      applicant_code: 'APP-2026-006',
      examination_schedule_id: 1,
      applicant_name: 'Angela Mae Dizon',
      attendance_status: 'present',
      result_status: 'failed',
      score: 58.3,
      items_correct: 35,
      items_total: 60,
      grade_point: 5.0,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.2).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-007',
      applicant_code: 'APP-2026-007',
      examination_schedule_id: 1,
      applicant_name: 'Joshua Neil Ramos',
      attendance_status: 'present',
      result_status: 'passed',
      score: 85.0,
      items_correct: 51,
      items_total: 60,
      grade_point: 1.75,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.1).toISOString(),
      synced: false, // UNSYNCED -> Red Dot!
    },
    {
      local_id: 'seed-res-008',
      applicant_code: 'APP-2026-008',
      examination_schedule_id: 1,
      applicant_name: 'Bea Cassandra Flores',
      attendance_status: 'present',
      result_status: 'passed',
      score: 90.0,
      items_correct: 54,
      items_total: 60,
      grade_point: 1.5,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 2.0).toISOString(),
      synced: true,
    },
  ];

  // Schedule 2: 6 completed examinees (5 passed, 1 failed; all synced)
  const sched2Results: OfflineQueuedResult[] = [
    {
      local_id: 'seed-res-009',
      applicant_code: 'APP-2026-009',
      examination_schedule_id: 2,
      applicant_name: 'Gabriel Luis Villanueva',
      attendance_status: 'present',
      result_status: 'passed',
      score: 91.7,
      items_correct: 55,
      items_total: 60,
      grade_point: 1.25,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 1.5).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-010',
      applicant_code: 'APP-2026-010',
      examination_schedule_id: 2,
      applicant_name: 'Samantha Joy Mendoza',
      attendance_status: 'present',
      result_status: 'passed',
      score: 86.7,
      items_correct: 52,
      items_total: 60,
      grade_point: 1.5,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 1.4).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-011',
      applicant_code: 'APP-2026-011',
      examination_schedule_id: 2,
      applicant_name: 'Christian Paul Tan',
      attendance_status: 'present',
      result_status: 'passed',
      score: 78.3,
      items_correct: 47,
      items_total: 60,
      grade_point: 2.0,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 1.3).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-012',
      applicant_code: 'APP-2026-012',
      examination_schedule_id: 2,
      applicant_name: 'Alyssa Marie Garcia',
      attendance_status: 'present',
      result_status: 'failed',
      score: 61.7,
      items_correct: 37,
      items_total: 60,
      grade_point: 3.0,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 1.2).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-013',
      applicant_code: 'APP-2026-013',
      examination_schedule_id: 2,
      applicant_name: 'Daniel Ethan Castillo',
      attendance_status: 'present',
      result_status: 'passed',
      score: 83.3,
      items_correct: 50,
      items_total: 60,
      grade_point: 1.75,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 1.1).toISOString(),
      synced: true,
    },
    {
      local_id: 'seed-res-014',
      applicant_code: 'APP-2026-014',
      examination_schedule_id: 2,
      applicant_name: 'Hannah Sofia Aquino',
      attendance_status: 'present',
      result_status: 'passed',
      score: 88.3,
      items_correct: 53,
      items_total: 60,
      grade_point: 1.5,
      answers: [],
      submitted_at: new Date(Date.now() - 3600000 * 1.0).toISOString(),
      synced: true,
    },
  ];

  // Schedule 3: 1 early submitter in live in-progress lobby
  const sched3Results: OfflineQueuedResult[] = [
    {
      local_id: 'seed-res-015',
      applicant_code: 'APP-2026-015',
      examination_schedule_id: 3,
      applicant_name: 'John Rafael Mercado',
      attendance_status: 'present',
      result_status: 'passed',
      score: 86.7,
      items_correct: 52,
      items_total: 60,
      grade_point: 1.5,
      answers: [],
      submitted_at: new Date(Date.now() - 600000).toISOString(),
      synced: false, // UNSYNCED -> Red Dot!
    },
  ];

  const allSeedResults = [...sched1Results, ...sched2Results, ...sched3Results];

  // Merge with any non-seed results already stored
  const existingResults = await OfflineStore.getResults();
  const nonSeedExisting = existingResults.filter((r) => !r.local_id?.startsWith('seed-res-'));
  const finalResults = [...nonSeedExisting, ...allSeedResults];

  await OfflineStore.saveResults(finalResults);

  const unsyncedCount = finalResults.filter((r) => !r.synced).length;

  return {
    success: true,
    totalResults: finalResults.length,
    unsyncedCount,
    lobbiesCount: 3,
    message: `Seeded ${allSeedResults.length} examinees across 3 lobbies (${unsyncedCount} unsynced).`,
  };
}

/**
 * Remove all seeded sample results and opened room entries.
 */
export async function clearSampleResults(): Promise<{ success: boolean; message: string }> {
  // 1. Remove seeded results
  const existingResults = await OfflineStore.getResults();
  const retained = existingResults.filter((r) => !r.local_id?.startsWith('seed-res-'));
  await OfflineStore.saveResults(retained);

  // 2. Clear seed opened rooms
  await OfflineStore.clearOpenedRoom(1, 1);
  await OfflineStore.clearOpenedRoom(2, 2);
  await OfflineStore.clearOpenedRoom(3, 3);

  return {
    success: true,
    message: 'Sample examination results and test lobbies cleared successfully.',
  };
}

/**
 * Check whether sample results are currently loaded.
 */
export async function isSampleResultsSeeded(): Promise<boolean> {
  const results = await OfflineStore.getResults();
  return results.some((r) => r.local_id?.startsWith('seed-res-'));
}
