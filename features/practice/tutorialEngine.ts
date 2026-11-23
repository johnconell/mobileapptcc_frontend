export interface PracticeTutorialStep {
  target: string;
  title: string;
  body: string;
  action: boolean;
  source?: 'screen' | 'modal';
  final?: boolean;
}

export const PRACTICE_TUTORIAL_STEPS: readonly PracticeTutorialStep[] = [
  { target: 'tutorial-skip-scan', title: 'Join the room', body: "In the real exam you scan the proctor's QR code here. For practice, tap Skip scan.", action: true },
  { target: 'tutorial-key-chip', title: 'Enter your key', body: 'Each student has one private key from the permit email. Tap the practice key to fill it in.', action: true },
  { target: 'tutorial-agree', title: 'Read, then agree', body: 'Check your details, then tick the box. Details are locked, so you can only confirm them.', action: true },
  { target: 'tutorial-lobby-card', title: 'Wait for the proctor', body: 'Everyone waits here. When the proctor presses Start, your exam opens by itself.', action: false },
  { target: 'tutorial-timer', title: 'Your timer', body: 'Green means plenty of time. It turns orange, then red as time runs low.', action: false },
  { target: 'tutorial-view-toggle', title: 'Change how you read', body: 'One button switches between Scroll view and One-by-one view. Tap it to try.', action: true },
  { target: 'tutorial-first-choice', title: 'Pick an answer', body: 'Tap A, B or C. Your choice turns blue.', action: true },
  { target: 'tutorial-mark-not-sure', title: 'Not sure? Mark it', body: 'This only adds a marker so you can come back. It does not count as answered.', action: true },
  { target: 'tutorial-questions-button', title: 'See all questions', body: 'Open the list to see answered, marked and skipped questions.', action: true },
  { target: 'tutorial-question-5', title: 'Jump anywhere', body: 'Tap any number to go straight to that question.', action: true, source: 'modal' },
  { target: 'tutorial-submit', title: 'Finish the exam', body: 'When you are done, tap Submit exam. You will type EXAM SUBMIT to confirm.', action: true, final: true },
];

export function nextPracticeTutorialIndex(index: number): number {
  return Math.min(PRACTICE_TUTORIAL_STEPS.length - 1, Math.max(0, index) + 1);
}

export function isPracticeTutorialTargetAllowed(index: number, target: string): boolean {
  const step = PRACTICE_TUTORIAL_STEPS[index];
  return Boolean(step?.action && step.target === target);
}
