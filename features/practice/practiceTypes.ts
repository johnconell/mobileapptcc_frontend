import type { ChoiceKey, ExamAnswer, Question } from '@/shared/types';

export interface PracticeApplicant {
  id: string;
  fullName: string;
  programName: string;
  email: string;
  studentId: string;
  examDate: string;
  timeSlot: string;
  roomName: string;
  batchNumber: string;
}

export interface PracticeReceipt {
  verificationDigest: string;
  submittedAt: string;
  answersSaved: number;
  totalQuestions: number;
  destination: string;
}

export type PracticeTutorialStepId =
  | 'overview'
  | 'mode_toggle'
  | 'select_choice'
  | 'flag_question'
  | 'navigate_next'
  | 'return_marked'
  | 'open_navigator'
  | 'jump_question_5'
  | 'review_submit'
  | 'done';

export interface PracticeState {
  // Session details
  sessionCode: string;
  passkey: string;
  applicant: PracticeApplicant;
  agreed: boolean;
  agreedAt: string | null;

  // Examination state
  questions: Question[];
  answers: Record<string, ExamAnswer>;
  flags: Record<string, boolean>;
  currentIndex: number;
  navMode: 'scroll' | 'one_at_a_time';
  remainingSeconds: number;
  totalDurationSeconds: number;
  timerRunning: boolean;

  // Submission state
  isSubmitting: boolean;
  submittedAt: string | null;
  receipt: PracticeReceipt | null;

  // Interactive Onboarding Tutorial State
  tutorialActive: boolean;
  tutorialStep: PracticeTutorialStepId;
  tutorialIndex: number;
  tutorialComplete: boolean;
  tutorialPaused: boolean;
  visitedQuestions: Set<number>;
  hasFlaggedQ1: boolean;
  hasAnsweredCurrent: boolean;

  // Actions
  setPasskey: (key: string) => void;
  setAgreed: (agreed: boolean) => void;
  selectAnswer: (questionId: string, choice: ChoiceKey) => void;
  toggleFlag: (questionId: string) => void;
  setCurrentIndex: (index: number) => void;
  setNavMode: (mode: 'scroll' | 'one_at_a_time') => void;
  setRemainingSeconds: (seconds: number) => void;
  decrementTimer: () => void;
  submitPractice: () => void;
  restartPractice: () => void;
  resetPractice: () => void;

  // Tutorial actions
  setTutorialActive: (active: boolean) => void;
  setTutorialStep: (step: PracticeTutorialStepId) => void;
  nextTutorialStep: () => void;
  skipTutorial: () => void;
  advanceTutorial: () => void;
  setTutorialIndex: (index: number) => void;
  setTutorialPaused: (paused: boolean) => void;
  completeTutorial: () => void;
  replayTutorial: () => void;
}
