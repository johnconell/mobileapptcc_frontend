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
  rooms: (sessionId: string) => ['rooms', sessionId] as const,
  students: ['students'] as const,
  programs: ['programs'] as const,
  questions: (sessionId?: string) => ['questions', sessionId] as const,
  lobby: (sessionId?: string, roomId?: string) =>
    ['lobby', sessionId, roomId ?? ''] as const,
  violations: (sessionId?: string) => ['security', 'violations', sessionId] as const,
} as const;

export const STORAGE_KEYS = {
  proctorSession: 'tcc.proctor.session',
  proctorToken: 'tcc.proctor.token',
  studentProgress: 'tcc.student.exam.progress',
  participationToken: 'tcc.student.participation',
  examinationCode: 'tcc.student.exam.code',
  settings: 'tcc.settings',
  /** Runtime override for Option B LAN exam server (http://IP:8000/api/v1) */
  lanApiUrl: 'tcc.lan.api.url',
  offlineMode: 'tcc.offline.mode',
  offlinePackReady: 'tcc.offline.pack.ready',
  offlinePackAt: 'tcc.offline.pack.at',
  offlineScheduleId: 'tcc.offline.schedule.id',
  offlineExamCode: 'tcc.offline.exam.code',
  offlineClaims: 'tcc.offline.claims',
  examCheckpoint: 'tcc.student.exam.checkpoint',
  /** SecureStore: proctor email + bcrypt hashes for offline login */
  proctorAuthCache: 'tcc.proctor.auth.cache',
  proctorAuthCacheAt: 'tcc.proctor.auth.cache.at',
} as const;

export const STATUS_LABELS = {
  connected: 'Connected',
  waiting: 'Waiting to start',
  taking_exam: 'Taking',
  disconnected: 'Disconnected',
  finished: 'Done',
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

/** Demo proctor account from Laravel UserSeeder */
export const MOCK_PROCTOR = {
  username: 'proctor@example.com',
  password: 'password',
} as const;
