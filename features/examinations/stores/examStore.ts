import { create } from 'zustand';
import type { ChoiceKey, ExamAnswer, ExamTerminationReason, Question } from '@/shared/types';
import { EXAM_DURATION_MINUTES } from '@/shared/constants';

export type ExamNavMode = 'scroll' | 'one_at_a_time';

interface ExamState {
  sessionId: string | null;
  questions: Question[];
  currentIndex: number;
  answers: Record<string, ExamAnswer>;
  flags: Record<string, boolean>;
  navMode: ExamNavMode;
  remainingSeconds: number;
  autoSavedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  isSubmitting: boolean;
  isPaused: boolean;
  terminationReason: ExamTerminationReason | null;
  setSessionId: (sessionId: string) => void;
  setQuestions: (questions: Question[]) => void;
  setCurrentIndex: (index: number) => void;
  selectAnswer: (questionId: string, answer: ChoiceKey) => void;
  toggleFlag: (questionId: string) => void;
  setNavMode: (mode: ExamNavMode) => void;
  tick: () => void;
  startExam: (durationMinutes?: number) => void;
  setPaused: (value: boolean) => void;
  markSubmitting: (value: boolean) => void;
  markSubmitted: (reason?: ExamTerminationReason) => void;
  markAutoSaved: (at?: string) => void;
  restoreProgress: (payload: {
    answers: Record<string, ExamAnswer>;
    flags?: Record<string, boolean>;
    navMode?: ExamNavMode;
    remainingSeconds: number;
    startedAt: string | null;
  }) => void;
  answeredCount: () => number;
  unansweredCount: () => number;
  unansweredNumbers: () => number[];
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  questions: [] as Question[],
  currentIndex: 0,
  answers: {} as Record<string, ExamAnswer>,
  flags: {} as Record<string, boolean>,
  navMode: 'scroll' as ExamNavMode,
  remainingSeconds: EXAM_DURATION_MINUTES * 60,
  autoSavedAt: null as string | null,
  startedAt: null as string | null,
  submittedAt: null as string | null,
  isSubmitting: false,
  isPaused: false,
  terminationReason: null as ExamTerminationReason | null,
};

export const useExamStore = create<ExamState>((set, get) => ({
  ...initialState,

  setSessionId: (sessionId) => set({ sessionId }),

  setQuestions: (questions) => {
    const answers: Record<string, ExamAnswer> = {};
    const flags: Record<string, boolean> = {};
    questions.forEach((q) => {
      answers[q.id] = { questionId: q.id, selectedAnswer: null, answeredAt: null };
      flags[q.id] = false;
    });
    set({ questions, answers, flags, currentIndex: 0 });
  },

  setCurrentIndex: (currentIndex) => set({ currentIndex }),

  selectAnswer: (questionId, answer) => {
    const now = new Date().toISOString();
    set((state) => ({
      answers: {
        ...state.answers,
        [questionId]: { questionId, selectedAnswer: answer, answeredAt: now },
      },
    }));
  },

  toggleFlag: (questionId) => {
    set((state) => ({
      flags: {
        ...state.flags,
        [questionId]: !state.flags[questionId],
      },
    }));
  },

  setNavMode: (navMode) => set({ navMode }),

  markAutoSaved: (at?: string) =>
    set({ autoSavedAt: at ?? new Date().toISOString() }),

  restoreProgress: ({ answers, flags, navMode, remainingSeconds, startedAt }) =>
    set((state) => ({
      answers,
      flags: flags ?? state.flags,
      navMode: navMode ?? state.navMode,
      remainingSeconds,
      startedAt: startedAt ?? new Date().toISOString(),
      submittedAt: null,
      isSubmitting: false,
      isPaused: false,
      terminationReason: null,
    })),

  tick: () => {
    if (get().isPaused) return;
    set((state) => ({
      remainingSeconds: Math.max(0, state.remainingSeconds - 1),
    }));
  },

  startExam: (durationMinutes = EXAM_DURATION_MINUTES) =>
    set({
      startedAt: new Date().toISOString(),
      remainingSeconds: durationMinutes * 60,
      submittedAt: null,
      isSubmitting: false,
      isPaused: false,
      terminationReason: null,
    }),

  setPaused: (isPaused) => set({ isPaused }),

  markSubmitting: (isSubmitting) => set({ isSubmitting }),

  markSubmitted: (reason = 'submitted') =>
    set({
      submittedAt: new Date().toISOString(),
      isSubmitting: false,
      isPaused: false,
      terminationReason: reason,
    }),

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
