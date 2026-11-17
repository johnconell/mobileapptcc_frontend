import { create } from 'zustand';
import { PRACTICE_QUESTIONS } from './mockQuestions';
import type { PracticeApplicant, PracticeReceipt, PracticeState, PracticeTutorialStepId } from './practiceTypes';
import type { ChoiceKey, ExamAnswer } from '@/shared/types';

export const MOCK_APPLICANT: PracticeApplicant = {
  id: 'demo-student-001',
  fullName: 'Juan Dela Cruz',
  programName: 'BS in Information Technology',
  email: 'juan.delacruz@gmail.com',
  studentId: 'APP-2026-0042',
  examDate: '2026-11-20',
  timeSlot: '08:00 AM - 09:30 AM',
  roomName: 'Room 101',
  batchNumber: 'Batch 1',
};

export const DEMO_PASSKEY = 'DEMO-1234';
export const PRACTICE_DURATION_SECONDS = 1800; // 30 minutes

const initialAnswers: Record<string, ExamAnswer> = {};
const initialFlags: Record<string, boolean> = {};

export const usePracticeStore = create<PracticeState>((set, get) => ({
  sessionCode: 'K7M2P9QX',
  passkey: '',
  applicant: MOCK_APPLICANT,
  agreed: false,
  agreedAt: null,

  questions: PRACTICE_QUESTIONS,
  answers: initialAnswers,
  flags: initialFlags,
  currentIndex: 0,
  navMode: 'one_at_a_time',
  remainingSeconds: PRACTICE_DURATION_SECONDS,
  totalDurationSeconds: PRACTICE_DURATION_SECONDS,
  timerRunning: false,

  isSubmitting: false,
  submittedAt: null,
  receipt: null,

  tutorialActive: true,
  tutorialStep: 'overview',
  visitedQuestions: new Set<number>([0]),
  hasFlaggedQ1: false,
  hasAnsweredCurrent: false,

  setPasskey: (key: string) => set({ passkey: key }),

  setAgreed: (agreed: boolean) =>
    set({
      agreed,
      agreedAt: agreed ? new Date().toISOString() : null,
    }),

  selectAnswer: (questionId: string, choice: ChoiceKey) => {
    const state = get();
    const updatedAnswers = {
      ...state.answers,
      [questionId]: {
        questionId,
        selectedAnswer: choice,
        answeredAt: new Date().toISOString(),
      },
    };

    const nextVisited = new Set(state.visitedQuestions);
    nextVisited.add(state.currentIndex);

    let nextTutorialStep = state.tutorialStep;
    // Tutorial Action Gate: if on 'select_choice', advance to 'flag_question'
    if (state.tutorialActive && state.tutorialStep === 'select_choice') {
      nextTutorialStep = 'flag_question';
    }

    set({
      answers: updatedAnswers,
      visitedQuestions: nextVisited,
      hasAnsweredCurrent: true,
      tutorialStep: nextTutorialStep,
    });
  },

  toggleFlag: (questionId: string) => {
    const state = get();
    const currentFlag = Boolean(state.flags[questionId]);
    const updatedFlags = {
      ...state.flags,
      [questionId]: !currentFlag,
    };

    let nextTutorialStep = state.tutorialStep;
    let flaggedQ1 = state.hasFlaggedQ1;

    // Tutorial Action Gate: if on question 1 (id === 'p1') and flagged
    if (questionId === 'p1') {
      flaggedQ1 = !currentFlag;
      if (state.tutorialActive && state.tutorialStep === 'flag_question' && !currentFlag) {
        nextTutorialStep = 'navigate_next';
      }
    }

    set({
      flags: updatedFlags,
      hasFlaggedQ1: flaggedQ1,
      tutorialStep: nextTutorialStep,
    });
  },

  setCurrentIndex: (index: number) => {
    const state = get();
    const nextVisited = new Set(state.visitedQuestions);
    nextVisited.add(index);

    let nextTutorialStep = state.tutorialStep;

    // Tutorial Action Gate:
    // If student was on navigate_next and visits at least 3 questions (indexes 0, 1, 2)
    // and Q1 is flagged: guide student to return to Q1!
    if (state.tutorialActive) {
      if (state.tutorialStep === 'navigate_next' && nextVisited.size >= 3 && state.hasFlaggedQ1) {
        nextTutorialStep = 'return_marked';
      } else if (state.tutorialStep === 'return_marked' && index === 0) {
        // Successfully navigated back to Question 1!
        nextTutorialStep = 'open_navigator';
      } else if (state.tutorialStep === 'jump_question_5' && index === 4) {
        // Successfully jumped to Question 5 (index 4)!
        nextTutorialStep = 'review_submit';
      }
    }

    set({
      currentIndex: index,
      visitedQuestions: nextVisited,
      tutorialStep: nextTutorialStep,
    });
  },

  setNavMode: (mode: 'scroll' | 'one_at_a_time') => set({ navMode: mode }),

  setRemainingSeconds: (seconds: number) => set({ remainingSeconds: seconds }),

  decrementTimer: () => {
    const remaining = get().remainingSeconds;
    if (remaining > 0) {
      set({ remainingSeconds: remaining - 1 });
    }
  },

  submitPractice: () => {
    const state = get();
    const count = Object.values(state.answers).filter(
      (a) => a && a.selectedAnswer != null,
    ).length;
    const now = new Date().toISOString();
    const mockReceipt: PracticeReceipt = {
      verificationDigest: `DEMO-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      submittedAt: now,
      answersSaved: count,
      totalQuestions: PRACTICE_QUESTIONS.length,
      destination: 'Practice Simulation (No Network Calls)',
    };

    set({
      isSubmitting: false,
      submittedAt: now,
      receipt: mockReceipt,
      tutorialStep: 'done',
    });
  },

  restartPractice: () =>
    set({
      passkey: '',
      agreed: false,
      agreedAt: null,
      answers: {},
      flags: {},
      currentIndex: 0,
      navMode: 'one_at_a_time',
      remainingSeconds: PRACTICE_DURATION_SECONDS,
      timerRunning: false,
      isSubmitting: false,
      submittedAt: null,
      receipt: null,
      tutorialActive: true,
      tutorialStep: 'overview',
      visitedQuestions: new Set<number>([0]),
      hasFlaggedQ1: false,
      hasAnsweredCurrent: false,
    }),

  resetPractice: () =>
    set({
      sessionCode: 'K7M2P9QX',
      passkey: '',
      agreed: false,
      agreedAt: null,
      answers: {},
      flags: {},
      currentIndex: 0,
      navMode: 'one_at_a_time',
      remainingSeconds: PRACTICE_DURATION_SECONDS,
      timerRunning: false,
      isSubmitting: false,
      submittedAt: null,
      receipt: null,
      tutorialActive: true,
      tutorialStep: 'overview',
      visitedQuestions: new Set<number>([0]),
      hasFlaggedQ1: false,
      hasAnsweredCurrent: false,
    }),

  setTutorialActive: (active: boolean) => set({ tutorialActive: active }),

  setTutorialStep: (step: PracticeTutorialStepId) => set({ tutorialStep: step }),

  nextTutorialStep: () => {
    const current = get().tutorialStep;
    const sequence: PracticeTutorialStepId[] = [
      'overview',
      'mode_toggle',
      'select_choice',
      'flag_question',
      'navigate_next',
      'return_marked',
      'open_navigator',
      'jump_question_5',
      'review_submit',
      'done',
    ];
    const idx = sequence.indexOf(current);
    if (idx >= 0 && idx < sequence.length - 1) {
      set({ tutorialStep: sequence[idx + 1] });
    }
  },

  skipTutorial: () => set({ tutorialActive: false }),
}));
