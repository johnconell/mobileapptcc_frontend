import { create } from 'zustand';
import type { ChoiceKey, ExamAnswer, Question } from '@/types';
import { EXAM_DURATION_MINUTES } from '@/constants';

interface ExamState {
  sessionId: string | null;
  questions: Question[];
  currentIndex: number;
  answers: Record<string, ExamAnswer>;
  remainingSeconds: number;
  autoSavedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  isSubmitting: boolean;
  setSessionId: (sessionId: string) => void;
  setQuestions: (questions: Question[]) => void;
  setCurrentIndex: (index: number) => void;
  selectAnswer: (questionId: string, answer: ChoiceKey) => void;
  tick: () => void;
  startExam: (durationMinutes?: number) => void;
  markSubmitting: (value: boolean) => void;
  markSubmitted: () => void;
  answeredCount: () => number;
  unansweredCount: () => number;
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  questions: [] as Question[],
  currentIndex: 0,
  answers: {} as Record<string, ExamAnswer>,
  remainingSeconds: EXAM_DURATION_MINUTES * 60,
  autoSavedAt: null as string | null,
  startedAt: null as string | null,
  submittedAt: null as string | null,
  isSubmitting: false,
};

export const useExamStore = create<ExamState>((set, get) => ({
  ...initialState,

  setSessionId: (sessionId) => set({ sessionId }),

  setQuestions: (questions) => {
    const answers: Record<string, ExamAnswer> = {};
    questions.forEach((q) => {
      answers[q.id] = { questionId: q.id, selectedAnswer: null, answeredAt: null };
    });
    set({ questions, answers, currentIndex: 0 });
  },

  setCurrentIndex: (currentIndex) => set({ currentIndex }),

  selectAnswer: (questionId, answer) => {
    const now = new Date().toISOString();
    set((state) => ({
      answers: {
        ...state.answers,
        [questionId]: { questionId, selectedAnswer: answer, answeredAt: now },
      },
      autoSavedAt: now,
    }));
  },

  tick: () =>
    set((state) => ({
      remainingSeconds: Math.max(0, state.remainingSeconds - 1),
    })),

  startExam: (durationMinutes = EXAM_DURATION_MINUTES) =>
    set({
      startedAt: new Date().toISOString(),
      remainingSeconds: durationMinutes * 60,
      submittedAt: null,
      isSubmitting: false,
    }),

  markSubmitting: (isSubmitting) => set({ isSubmitting }),
  markSubmitted: () => set({ submittedAt: new Date().toISOString(), isSubmitting: false }),

  answeredCount: () =>
    Object.values(get().answers).filter((a) => a.selectedAnswer !== null).length,

  unansweredCount: () => {
    const { questions, answers } = get();
    return questions.length - Object.values(answers).filter((a) => a.selectedAnswer !== null).length;
  },

  reset: () => set({ ...initialState, answers: {} }),
}));
