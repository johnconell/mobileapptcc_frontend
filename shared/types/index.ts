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
  | 'disconnected'
  | 'not_arrived'
  | 'finished'
  | 'warning'
  | 'terminated';

export type StudentApprovalStatus = 'pending' | 'approved' | 'declined';

export type ChoiceKey = 'A' | 'B' | 'C' | 'D';

export type Sex = 'Male' | 'Female';

export type SecurityViolationType =
  | 'app_background'
  | 'app_inactive'
  | 'app_blur'
  | 'screen_lock'
  | 'screenshot'
  | 'screen_recording'
  | 'leave_attempt'
  | 'kiosk_lock_failed'
  | 'lock_task_state_lost'
  | 'app_exit_during_lock'
  | 'guided_access_lost';

export type ExamTerminationReason =
  | 'submitted'
  | 'time_expired'
  | 'policy_violation'
  | 'proctor_terminated';

export type ExaminationSessionType = 'regular' | 'rescheduled';
export type RescheduleState = 'proposed' | 'confirmed' | 'review_required' | null;

export interface Program {
  id: string;
  code: string;
  name: string;
}

export interface Question {
  id: string;
  number: number;
  subjectId: string;
  category?: string;
  categoryCode?: string;
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
  timeLabel?: string;
  batchNumber?: string;
  venue?: string;
  roomId?: string;
  offlineReady?: boolean;
  packVersion?: number;
  downloadedAt?: string;
  status?: string;
  serverNow?: string;
  sessionType?: ExaminationSessionType;
  rescheduleState?: RescheduleState;
  scheduleRevision?: number;
}

export interface ExamSession {
  id: string;
  scheduleId: string;
  status?: 'idle' | ExamLifecycleStatus | string;
  examSessionId?: number;
  roomId?: string | null;
  roomName?: string | null;
  timeLabel: string;
  startTime: string;
  endTime: string;
  venue: string;
  batchNumber: string;
  registeredStudents: number;
  durationMinutes: number;
  remainingSeconds?: number | null;
  startedAt?: string | null;
  endsAt?: string | null;
  totalQuestions: number;
  historyStatus?: 'completed' | 'missed';
  questionBankId?: number;
  /** Latest proctor LAN IP (cloud). Examinees refresh this after Wi‑Fi changes. */
  localServerIp?: string | null;
  wifiSsid?: string | null;
  peerPort?: number | null;
  sessionType?: ExaminationSessionType;
  rescheduleState?: RescheduleState;
  scheduleRevision?: number;
}

export interface ExamRoom {
  id: string;
  scheduleId: string;
  roomName: string;
  capacity: number;
  studentCount?: number;
  examSessionId?: number | null;
  examinationCode?: string | null;
  status: 'idle' | ExamLifecycleStatus | string;
  connectedCount: number;
  proctorId?: number | null;
  proctorName?: string | null;
  assignedProctorId?: number | null;
  assignedProctorName?: string | null;
  ownerId?: number | null;
  ownerName?: string | null;
  canOpen?: boolean;
  canControl?: boolean;
  canReopen?: boolean;
  claimRequired?: boolean;
  authorizationReason?: string | null;
}

export type StudentSelectionStatus = 'available' | 'ready' | 'completed';

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
  registration_id?: number;
  selectionStatus?: StudentSelectionStatus;
  statusLabel?: string;
  selectable?: boolean;
  lobby_status?: string | null;
  exam_session_id?: number | null;
  examSet?: string;
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
  violationCount?: number;
  terminationReason: ExamTerminationReason | null;
  reconnectAllowed?: boolean;
  /** Proctor-only: 6-digit PIN shown after disconnect. */
  reconnectCode?: string | null;
  reconnectCodeExpiresAt?: string | null;
  isReady?: boolean;
  downloadPercent?: number;
  hashVerified?: boolean;
  moduleReady?: boolean;
  startPhase?: 'waiting' | 'received' | 'entered';
  applicantCode?: string | null;
  submittedAt?: string | null;
  score?: number | null;
  examSet?: string;
  approvalStatus?: StudentApprovalStatus;
  approvalRequestedAt?: string | null;
  approvedAt?: string | null;
  declinedAt?: string | null;
  /** Offline room roster state. This is separate from LAN connection status. */
  isAssigned?: boolean;
  isConnected?: boolean;
  attendanceStatus?: 'pending' | 'present' | 'not_arrived' | 'absent' | 'blocked';
}

export interface LobbySnapshot {
  schedule: ExamSchedule;
  session: ExamSession;
  status: ExamLifecycleStatus;
  examinationCode?: string;
  wifiSsid?: string | null;
  localServerIp?: string | null;
  peerPort?: number | null;
  qrValue: string;
  roomName?: string | null;
  roomId?: number | null;
  registeredCount: number;
  /** Number of students assigned to this room, including students not yet connected. */
  assignedCount?: number;
  presentCount?: number;
  absentCount?: number;
  notArrivedCount?: number;
  connectedCount: number;
  notYetConnectedCount: number;
  waitingCount: number;
  readyCount?: number;
  notReadyCount?: number;
  takingCount: number;
  disconnectedCount?: number;
  finishedCount: number;
  warningCount: number;
  terminatedCount: number;
  violationsDetected: number;
  recentViolations?: Array<{
    id: number;
    registration_id: number;
    studentName: string;
    studentId: string;
    type: string;
    message?: string | null;
    violationCount: number;
    occurredAt?: string | null;
  }>;
  students: LobbyStudent[];
  proctor_id?: number | null;
  proctor_name?: string | null;
  can_control?: boolean;
  is_owner?: boolean;
  remainingSeconds?: number | null;
  emergencySuspended?: boolean;
  emergencySuspendedAt?: string | null;
  emergencyReason?: string | null;
  endedAt?: string | null;
  allow_late_entry?: boolean;
  my_status?: LobbyStudentStatus;
  registration_id?: number;
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
  token?: string;
  /** True when signed in from local auth cache (no Sanctum / no internet). */
  offlineSession?: boolean;
}

export interface AuthResult {
  success: boolean;
  profile?: ProctorProfile;
  token?: string;
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
