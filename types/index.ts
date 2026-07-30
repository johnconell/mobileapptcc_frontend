export type UserRole = 'student' | 'proctor';

export type ExamLifecycleStatus =
  | 'scheduled'
  | 'lobby_open'
  | 'in_progress'
  | 'ended';

export type LobbyStudentStatus =
  | 'connected'
  | 'waiting'
  | 'taking_exam'
  | 'finished'
  | 'warning'
  | 'terminated';

export type ChoiceKey = 'A' | 'B' | 'C' | 'D';

export type Sex = 'Male' | 'Female';

export type SecurityViolationType =
  | 'app_background'
  | 'app_inactive'
  | 'app_blur'
  | 'screen_lock'
  | 'screenshot'
  | 'screen_recording'
  | 'leave_attempt';

export type ExamTerminationReason =
  | 'submitted'
  | 'time_expired'
  | 'policy_violation'
  | 'proctor_terminated';

export interface Program {
  id: string;
  code: string;
  name: string;
}

export interface Question {
  id: string;
  number: number;
  subjectId: string;
  type: 'multiple_choice';
  question: string;
  choices: Record<ChoiceKey, string>;
  correctAnswer: ChoiceKey;
  explanation: string;
}

export interface ExamSchedule {
  id: string;
  name: string;
  schoolYear: string;
  examinationDate: string;
  examinationDateIso: string;
  batchCount: number;
  description?: string;
}

export interface ExamSession {
  id: string;
  scheduleId: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  venue: string;
  batchNumber: string;
  registeredStudents: number;
  durationMinutes: number;
  totalQuestions: number;
}

export interface StudentRecord {
  id: string;
  studentId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  email: string;
  programId: string;
  programCode: string;
  programName: string;
  sex: Sex;
  avatarInitials: string;
}

export interface LobbyStudent {
  id: string;
  studentId: string;
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
}

export interface LobbySnapshot {
  schedule: ExamSchedule;
  session: ExamSession;
  status: ExamLifecycleStatus;
  examinationCode: string;
  qrValue: string;
  registeredCount: number;
  connectedCount: number;
  notYetConnectedCount: number;
  waitingCount: number;
  takingCount: number;
  finishedCount: number;
  warningCount: number;
  terminatedCount: number;
  violationsDetected: number;
  students: LobbyStudent[];
}

export interface SecurityViolation {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  type: SecurityViolationType;
  message: string;
  createdAt: string;
  resolved: boolean;
}

export interface ExamAnswer {
  questionId: string;
  selectedAnswer: ChoiceKey | null;
  answeredAt: string | null;
}

export interface ProctorAccount {
  id: string;
  username: string;
  password: string;
  displayName: string;
}

export interface ProctorProfile {
  id: string;
  username: string;
  displayName: string;
  roleLabel: string;
}

export interface AuthResult {
  success: boolean;
  profile?: ProctorProfile;
  message?: string;
}

export interface ExamCodeValidation {
  valid: boolean;
  message?: string;
  schedule?: ExamSchedule;
  session?: ExamSession;
  examinationCode?: string;
}

export interface ExamSecurityCapabilities {
  keepAwake: boolean;
  portraitLock: boolean;
  preventScreenCapture: boolean;
  appSwitcherProtection: boolean;
  screenshotListener: boolean;
  navigationLock: boolean;
  backButtonLock: boolean;
  /** True only when native Android Lock Task / Device Owner module is present */
  kioskNativeLockTask: boolean;
  immersiveSystemUi: boolean;
  multiWindowBlock: boolean;
}
