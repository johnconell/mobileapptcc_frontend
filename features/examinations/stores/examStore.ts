import { create } from 'zustand';
import type { ChoiceKey, ExamAnswer, ExamTerminationReason, Question } from '@/shared/types';
import { EXAM_DURATION_MINUTES } from '@/shared/constants';
import {
  type TimerStateStatus,
  type TimeSyncMetadata,
  createInitialTimeSync,
  computeEffectiveDeadline,
  recalculateTimer,
  reconcileWithAuthorityPulse,
  getMonotonicTimeMs,
} from '@/features/examinations/services/examTimerCoordinator';

export type ExamNavMode = 'scroll' | 'one_at_a_time';
export type { TimerStateStatus, TimeSyncMetadata };

export type StartExamOptions = {
  durationMinutes?: number;
  startedAt?: string;
  deadline?: string;
  scheduleClosingTime?: string | null;
  attemptId?: string;
  serverTime?: string;
};

export type RestoreProgressPayload = {
  answers: Record<string, ExamAnswer>;
  flags?: Record<string, boolean>;
  navMode?: ExamNavMode;
  currentIndex?: number;
  remainingSeconds?: number;
  totalDurationSeconds?: number;
  startedAt?: string | null;
  deadline?: string | null;
  scheduleClosingTime?: string | null;
  attemptId?: string;
  timeSync?: TimeSyncMetadata;
};

interface ExamState {
  sessionId: string | null;
  attemptId: string | null;
  questions: Question[];
  currentIndex: number;
  answers: Record<string, ExamAnswer>;
  flags: Record<string, boolean>;
  navMode: ExamNavMode;
  remainingSeconds: number;
  totalDurationSeconds: number;
  deadline: string | null;
  scheduleClosingTime: string | null;
  startedAt: string | null;
  timerStatus: TimerStateStatus;
  reconciliationReason: string | null;
  timeSync: TimeSyncMetadata | null;
  autoSavedAt: string | null;
  submittedAt: string | null;
  isSubmitting: boolean;
  isPaused: boolean;
  terminationReason: ExamTerminationReason | null;

  setSessionId: (sessionId: string) => void;
  setAttemptId: (attemptId: string) => void;
  setQuestions: (questions: Question[]) => void;
  setCurrentIndex: (index: number) => void;
  selectAnswer: (questionId: string, answer: ChoiceKey) => void;
  toggleFlag: (questionId: string) => void;
  setNavMode: (mode: ExamNavMode) => void;
  setRemainingSeconds: (seconds: number) => void;
  tick: () => void;
  reconcileWithServerTime: (params: {
    serverTime?: string;
    startedAt?: string;
    endsAt?: string;
    remainingSeconds?: number;
    durationMinutes?: number;
  }) => void;
  startExam: (options?: number | StartExamOptions) => void;
  setPaused: (value: boolean) => void;
  markSubmitting: (value: boolean) => void;
  markSubmitted: (reason?: ExamTerminationReason) => void;
  markAutoSaved: (at?: string) => void;
  restoreProgress: (payload: RestoreProgressPayload) => void;
  isAnsweringAllowed: () => boolean;
  answeredCount: () => number;
  unansweredCount: () => number;
  unansweredNumbers: () => number[];
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  attemptId: null as string | null,
  questions: [] as Question[],
  currentIndex: 0,
  answers: {} as Record<string, ExamAnswer>,
  flags: {} as Record<string, boolean>,
  navMode: 'scroll' as ExamNavMode,
  remainingSeconds: EXAM_DURATION_MINUTES * 60,
  totalDurationSeconds: EXAM_DURATION_MINUTES * 60,
  deadline: null as string | null,
  scheduleClosingTime: null as string | null,
  startedAt: null as string | null,
  timerStatus: 'not_started' as TimerStateStatus,
  reconciliationReason: null as string | null,
  timeSync: null as TimeSyncMetadata | null,
  autoSavedAt: null as string | null,
  submittedAt: null as string | null,
  isSubmitting: false,
  isPaused: false,
  terminationReason: null as ExamTerminationReason | null,
};

export const useExamStore = create<ExamState>((set, get) => ({
  ...initialState,

  setSessionId: (sessionId) => set({ sessionId }),

  setAttemptId: (attemptId) => set({ attemptId }),

  setQuestions: (questions) => {
    const answers: Record<string, ExamAnswer> = {};
    const flags: Record<string, boolean> = {};
    questions.forEach((q) => {
      answers[q.id] = { questionId: q.id, selectedAnswer: null, answeredAt: null };
      flags[q.id] = false;
    });
    set({ questions, answers, flags, currentIndex: 0 });
  },

  setCurrentIndex: (currentIndex) =>
    set((state) => (state.currentIndex === currentIndex ? state : { currentIndex })),

  selectAnswer: (questionId, answer) => {
    const state = get();
    // Stop editing if attempt expired, reconciliation is required, or submission has commenced
    if (state.timerStatus === 'expired' || state.remainingSeconds <= 0 || state.isSubmitting || state.submittedAt) {
      console.warn('[ExamStore] Cannot select answer: examination has expired or already submitted.');
      return;
    }
    if (state.timerStatus === 'reconciliation_required') {
      console.warn('[ExamStore] Cannot select answer: time reconciliation required.');
      return;
    }

    const now = new Date().toISOString();
    set((s) => ({
      answers: {
        ...s.answers,
        [questionId]: { questionId, selectedAnswer: answer, answeredAt: now },
      },
    }));
  },

  toggleFlag: (questionId) => {
    const state = get();
    if (state.timerStatus === 'expired' || state.remainingSeconds <= 0 || state.isSubmitting || state.submittedAt) {
      return;
    }
    if (state.timerStatus === 'reconciliation_required') {
      return;
    }

    set((s) => ({
      flags: {
        ...s.flags,
        [questionId]: !s.flags[questionId],
      },
    }));
  },

  setNavMode: (navMode) => set({ navMode }),

  setRemainingSeconds: (remainingSeconds: number) =>
    set({
      remainingSeconds,
      timerStatus: remainingSeconds <= 0 ? 'expired' : 'running',
    }),

  markAutoSaved: (at?: string) =>
    set({ autoSavedAt: at ?? new Date().toISOString() }),

  restoreProgress: (payload) => {
    const { answers, flags, navMode, totalDurationSeconds, scheduleClosingTime, attemptId } = payload;
    const startedAt = payload.startedAt ?? new Date().toISOString();
    const durationMinutes = Math.round((totalDurationSeconds ?? EXAM_DURATION_MINUTES * 60) / 60);

    // Compute or restore deadline
    let deadline = payload.deadline;
    if (!deadline) {
      if (typeof payload.remainingSeconds === 'number' && payload.remainingSeconds > 0) {
        deadline = new Date(Date.now() + payload.remainingSeconds * 1000).toISOString();
      } else {
        deadline = computeEffectiveDeadline(startedAt, durationMinutes, scheduleClosingTime).deadlineIso;
      }
    }

    const timeSync = payload.timeSync ?? createInitialTimeSync();

    // Recalculate remaining seconds against authoritative deadline (never accept saved countdown unchanged)
    const recalculated = recalculateTimer({
      startedAt,
      deadline,
      scheduleClosingTime,
      timeSync,
    });

    set((state) => ({
      answers,
      flags: flags ?? state.flags,
      navMode: navMode ?? state.navMode,
      currentIndex:
        typeof payload.currentIndex === 'number'
          ? Math.min(Math.max(0, payload.currentIndex), Math.max(0, state.questions.length - 1))
          : state.currentIndex,
      remainingSeconds: recalculated.remainingSeconds,
      totalDurationSeconds: totalDurationSeconds ?? durationMinutes * 60,
      startedAt,
      deadline,
      scheduleClosingTime: scheduleClosingTime ?? state.scheduleClosingTime,
      attemptId: attemptId ?? state.attemptId,
      timerStatus: recalculated.status,
      reconciliationReason: recalculated.statusReason ?? null,
      timeSync: recalculated.updatedTimeSync,
      submittedAt: null,
      isSubmitting: false,
      isPaused: false,
      terminationReason: null,
    }));
  },

  tick: () => {
    const state = get();
    if (
      state.isPaused ||
      state.timerStatus === 'expired' ||
      state.timerStatus === 'reconciliation_required' ||
      state.isSubmitting ||
      state.submittedAt
    ) {
      return;
    }

    if (!state.deadline || !state.startedAt || !state.timeSync) {
      const next = Math.max(0, state.remainingSeconds - 1);
      set({
        remainingSeconds: next,
        timerStatus: next <= 0 ? 'expired' : 'running',
      });
      return;
    }

    const result = recalculateTimer({
      startedAt: state.startedAt,
      deadline: state.deadline,
      scheduleClosingTime: state.scheduleClosingTime,
      timeSync: state.timeSync,
    });

    set({
      remainingSeconds: result.remainingSeconds,
      timerStatus: result.status,
      reconciliationReason: result.statusReason ?? null,
      timeSync: result.updatedTimeSync,
    });
  },

  reconcileWithServerTime: ({ serverTime, startedAt, endsAt, remainingSeconds, durationMinutes }) => {
    const state = get();
    const currentSync = state.timeSync ?? createInitialTimeSync();
    const deadlineIso = endsAt ?? state.deadline ?? new Date(Date.now() + (remainingSeconds ?? 3600) * 1000).toISOString();

    const result = reconcileWithAuthorityPulse({
      serverTimeIso: serverTime,
      startedAtIso: startedAt,
      endsAtIso: endsAt,
      durationMinutes: durationMinutes ?? (state.totalDurationSeconds ? Math.round(state.totalDurationSeconds / 60) : undefined),
      serverRemainingSeconds: remainingSeconds,
      currentSync,
      deadlineIso,
      scheduleClosingIso: state.scheduleClosingTime,
      authority: 'proctor_peer',
    });

    set({
      remainingSeconds: result.remainingSeconds,
      deadline: result.deadlineIso,
      timeSync: result.timeSync,
      timerStatus: result.status,
      reconciliationReason: null, // Clear any previous suspicion once proctor gives authority
    });
  },

  startExam: (options) => {
    let durationMinutes = EXAM_DURATION_MINUTES;
    let startedAt = new Date().toISOString();
    let scheduleClosingTime: string | null = null;
    let attemptId: string | null = null;
    let serverTime: string | undefined;

    if (typeof options === 'number') {
      durationMinutes = options;
    } else if (options && typeof options === 'object') {
      if (options.durationMinutes) durationMinutes = options.durationMinutes;
      if (options.startedAt) startedAt = options.startedAt;
      if (options.scheduleClosingTime !== undefined) scheduleClosingTime = options.scheduleClosingTime;
      if (options.attemptId) attemptId = options.attemptId;
      if (options.serverTime) serverTime = options.serverTime;
    }

    const { deadlineIso } = computeEffectiveDeadline(startedAt, durationMinutes, scheduleClosingTime);
    const initialSync = createInitialTimeSync({ serverTimeIso: serverTime });

    set({
      startedAt,
      deadline: deadlineIso,
      scheduleClosingTime,
      attemptId,
      remainingSeconds: durationMinutes * 60,
      totalDurationSeconds: durationMinutes * 60,
      timerStatus: 'running',
      reconciliationReason: null,
      timeSync: initialSync,
      submittedAt: null,
      isSubmitting: false,
      isPaused: false,
      terminationReason: null,
    });
  },

  setPaused: (isPaused) => set({ isPaused }),

  markSubmitting: (isSubmitting) => set({ isSubmitting }),

  markSubmitted: (reason = 'submitted') =>
    set({
      submittedAt: new Date().toISOString(),
      isSubmitting: false,
      isPaused: false,
      timerStatus: 'expired',
      terminationReason: reason,
    }),

  isAnsweringAllowed: () => {
    const s = get();
    return s.timerStatus === 'running' && s.remainingSeconds > 0 && !s.isPaused && !s.isSubmitting && !s.submittedAt;
  },

  answeredCount: () =>
    Object.values(get().answers).filter((a) => a.selectedAnswer !== null).length,

  unansweredCount: () => {
    const { questions, answers } = get();
    return (
      questions.length -
      Object.values(answers).filter((a) => a.selectedAnswer !== null).length
    );
  },

  unansweredNumbers: () => {
    const { questions, answers } = get();
    return questions
      .filter((q) => !answers[q.id]?.selectedAnswer)
      .map((q) => q.number);
  },

  reset: () => set({ ...initialState, answers: {}, flags: {} }),
}));
