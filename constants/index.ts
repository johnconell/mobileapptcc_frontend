export const APP_NAME = 'Mobile Entrance Examination';
export const SCHOOL_NAME = 'Tagoloan Community College';
export const SCHOOL_SHORT = 'TCC';

export const EXAM_DURATION_MINUTES = 90;
export const TOTAL_QUESTIONS = 80;

export const QUERY_KEYS = {
  schedules: ['schedules'] as const,
  schedule: (id: string) => ['schedules', id] as const,
  sessions: (scheduleId: string) => ['sessions', scheduleId] as const,
  session: (id: string) => ['session', id] as const,
  students: ['students'] as const,
  programs: ['programs'] as const,
  questions: (sessionId?: string) => ['questions', sessionId] as const,
  lobby: (sessionId?: string) => ['lobby', sessionId] as const,
} as const;

export const STORAGE_KEYS = {
  proctorSession: 'tcc.proctor.session',
  studentProgress: 'tcc.student.exam.progress',
  settings: 'tcc.settings',
} as const;

export const STATUS_LABELS = {
  connected: 'Connected',
  waiting: 'Waiting',
  taking_exam: 'Taking Examination',
  finished: 'Finished',
  scheduled: 'Scheduled',
  lobby_open: 'Lobby Open',
  in_progress: 'In Progress',
  ended: 'Ended',
} as const;

/** Mock credentials for local proctor login */
export const MOCK_PROCTOR = {
  username: 'proctor',
  password: 'tcc2026',
} as const;
