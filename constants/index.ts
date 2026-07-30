export const APP_NAME = 'Mobile Entrance Examination';
export const SCHOOL_NAME = 'Tagoloan Community College';
export const SCHOOL_SHORT = 'TCC';

export const EXAM_DURATION_MINUTES = 90;
export const TOTAL_QUESTIONS = 80;
export const MAX_EXAM_VIOLATIONS = 3;

export const QUERY_KEYS = {
  schedules: ['schedules'] as const,
  schedule: (id: string) => ['schedules', id] as const,
  sessions: (scheduleId: string) => ['sessions', scheduleId] as const,
  session: (id: string) => ['session', id] as const,
  students: ['students'] as const,
  programs: ['programs'] as const,
  questions: (sessionId?: string) => ['questions', sessionId] as const,
  lobby: (sessionId?: string) => ['lobby', sessionId] as const,
  violations: (sessionId?: string) => ['security', 'violations', sessionId] as const,
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
  warning: 'Warning',
  terminated: 'Terminated',
  scheduled: 'Scheduled',
  lobby_open: 'Lobby Open',
  in_progress: 'In Progress',
  ended: 'Ended',
} as const;

export const VIOLATION_MESSAGES: Record<string, string> = {
  app_background: 'Leaving the examination is prohibited.',
  app_inactive: 'Leaving the examination is prohibited.',
  app_blur: 'Leaving the examination is prohibited.',
  screen_lock: 'Leaving the examination is prohibited.',
  screenshot: 'Screenshot attempt detected.',
  screen_recording: 'Screen recording activity detected.',
  leave_attempt: 'Leaving the examination is prohibited.',
};

/** Mock credentials for local proctor login */
export const MOCK_PROCTOR = {
  username: 'proctor',
  password: 'tcc2026',
} as const;
