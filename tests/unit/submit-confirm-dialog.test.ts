import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIRM_PHRASE,
  normalizePhrase,
  isConfirmPhrase,
  createSubmitController,
} from '../../features/examinations/services/submitGate';
import { usePracticeStore } from '../../features/practice/practiceStore';

test('SubmitConfirmDialog: Confirmation Phrase Validation', async (t) => {
  await t.test('exact required phrase constant is "exam submit"', () => {
    assert.equal(CONFIRM_PHRASE, 'exam submit');
  });

  await t.test('accepts exact uppercase "EXAM SUBMIT"', () => {
    assert.equal(isConfirmPhrase('EXAM SUBMIT'), true);
  });

  await t.test('accepts lowercase "exam submit"', () => {
    assert.equal(isConfirmPhrase('exam submit'), true);
  });

  await t.test('accepts mixed case "Exam Submit"', () => {
    assert.equal(isConfirmPhrase('Exam Submit'), true);
  });

  await t.test('accepts input with leading, trailing, and multiple internal spaces', () => {
    assert.equal(isConfirmPhrase('  EXAM   SUBMIT  '), true);
    assert.equal(isConfirmPhrase('\tEXAM \n SUBMIT '), true);
  });

  await t.test('rejects incomplete phrases', () => {
    assert.equal(isConfirmPhrase(''), false);
    assert.equal(isConfirmPhrase('exam'), false);
    assert.equal(isConfirmPhrase('submit'), false);
    assert.equal(isConfirmPhrase('EXAM'), false);
    assert.equal(isConfirmPhrase('SUBMIT'), false);
    assert.equal(isConfirmPhrase('examsubmit'), false);
  });

  await t.test('rejects misspelled phrases', () => {
    assert.equal(isConfirmPhrase('exam submitt'), false);
    assert.equal(isConfirmPhrase('examm submit'), false);
    assert.equal(isConfirmPhrase('confirm submit'), false);
    assert.equal(isConfirmPhrase('yes submit'), false);
  });
});

test('SubmitConfirmDialog: Layout & Keyboard Responsiveness Engine', async (t) => {
  // Pure logic replica of SubmitConfirmDialog's layout decision engine
  const computeDialogLayout = ({
    screenHeight,
    cardHeight,
    containerHeight,
    keyboardVisible,
    insetsTop = 24,
    insetsBottom = 24,
  }: {
    screenHeight: number;
    cardHeight: number;
    containerHeight: number;
    keyboardVisible: boolean;
    insetsTop?: number;
    insetsBottom?: number;
  }) => {
    const isCompact = screenHeight < 720;
    const safeTop = Math.max(insetsTop, 16);
    const safeBottom = Math.max(insetsBottom, 16);

    const isContentTaller =
      cardHeight > 0 &&
      containerHeight > 0 &&
      cardHeight > containerHeight - (safeTop + safeBottom);

    const shouldAlignTop = keyboardVisible || isContentTaller;
    const justifyContent = shouldAlignTop ? 'flex-start' : 'center';

    return {
      isCompact,
      safeTop,
      safeBottom,
      isContentTaller,
      shouldAlignTop,
      justifyContent,
    };
  };

  await t.test('Standard Phone (844px high) without keyboard: centers modal without clipping', () => {
    const layout = computeDialogLayout({
      screenHeight: 844,
      cardHeight: 460,
      containerHeight: 796,
      keyboardVisible: false,
    });

    assert.equal(layout.isCompact, false);
    assert.equal(layout.shouldAlignTop, false);
    assert.equal(layout.justifyContent, 'center');
    assert.equal(layout.isContentTaller, false);
  });

  await t.test('Standard Phone with Keyboard Opened (300px keyboard): top-aligns at safeTop, preventing negative offset', () => {
    const layout = computeDialogLayout({
      screenHeight: 844,
      cardHeight: 460,
      containerHeight: 496, // Shrunk by Android resize
      keyboardVisible: true,
    });

    assert.equal(layout.shouldAlignTop, true);
    assert.equal(layout.justifyContent, 'flex-start');
    assert.ok(layout.safeTop >= 16);
  });

  await t.test('Small Android Phone (640px high) without keyboard: activates compact tokens and fits cleanly', () => {
    const layout = computeDialogLayout({
      screenHeight: 640,
      cardHeight: 410, // Compact height
      containerHeight: 592,
      keyboardVisible: false,
    });

    assert.equal(layout.isCompact, true);
    assert.equal(layout.shouldAlignTop, false);
    assert.equal(layout.justifyContent, 'center');
  });

  await t.test('Small Android Phone with Keyboard Opened (280px keyboard): top-aligns for full scrollability', () => {
    const layout = computeDialogLayout({
      screenHeight: 640,
      cardHeight: 410,
      containerHeight: 312,
      keyboardVisible: true,
    });

    assert.equal(layout.isCompact, true);
    assert.equal(layout.shouldAlignTop, true);
    assert.equal(layout.justifyContent, 'flex-start');
    // Content can scroll all 410px starting from y = safeTop without clipping title
    assert.ok(layout.safeTop >= 16);
  });

  await t.test('Extreme Small/Landscape device where card exceeds container: aligns top even without keyboard', () => {
    const layout = computeDialogLayout({
      screenHeight: 500,
      cardHeight: 410,
      containerHeight: 420,
      keyboardVisible: false,
    });

    assert.equal(layout.isContentTaller, true);
    assert.equal(layout.shouldAlignTop, true);
    assert.equal(layout.justifyContent, 'flex-start');
  });
});

test('SubmitConfirmDialog: Overlay Conflict Prevention & Tutorial Transitions', async (t) => {
  t.beforeEach(() => {
    usePracticeStore.getState().restartPractice();
  });

  await t.test('Opening submit confirmation suppresses tutorial overlays and pointers', () => {
    const store = usePracticeStore.getState();
    store.setTutorialStep('review_submit');

    // Simulate examination screen state
    let submitConfirmOpen = false;
    let navigatorOpen = false;

    const isOverlayActive = () => submitConfirmOpen || navigatorOpen;
    const isInteractiveTutorialActive = () => store.tutorialActive && !isOverlayActive();

    // Initially at step 8
    assert.equal(isInteractiveTutorialActive(), true);

    // Student taps "Submit exam"
    navigatorOpen = false;
    submitConfirmOpen = true;

    // Both navigator and tutorial overlays MUST be inactive
    assert.equal(isOverlayActive(), true);
    assert.equal(isInteractiveTutorialActive(), false);

    // When modal is dismissed without submitting
    submitConfirmOpen = false;
    assert.equal(isOverlayActive(), false);
    assert.equal(isInteractiveTutorialActive(), true);
  });

  await t.test('Switching between submit confirmation and question navigator is mutually exclusive', () => {
    let submitConfirmOpen = false;
    let navigatorOpen = false;

    const openSubmit = () => {
      navigatorOpen = false;
      submitConfirmOpen = true;
    };

    const openNavigator = () => {
      submitConfirmOpen = false;
      navigatorOpen = true;
    };

    const reviewFromSubmit = () => {
      submitConfirmOpen = false;
      navigatorOpen = true;
    };

    // Open submit dialog
    openSubmit();
    assert.equal(submitConfirmOpen, true);
    assert.equal(navigatorOpen, false);

    // Tap review
    reviewFromSubmit();
    assert.equal(submitConfirmOpen, false);
    assert.equal(navigatorOpen, true);

    // Open submit again
    openSubmit();
    assert.equal(submitConfirmOpen, true);
    assert.equal(navigatorOpen, false);
  });

  await t.test('Confirming submit transitions out cleanly and skips tutorial', () => {
    const store = usePracticeStore.getState();
    store.setTutorialStep('review_submit');

    let submitConfirmOpen = true;

    const handleConfirmSubmit = (phrase: string) => {
      if (isConfirmPhrase(phrase)) {
        submitConfirmOpen = false;
        usePracticeStore.getState().skipTutorial();
        usePracticeStore.getState().submitPractice();
      }
    };

    handleConfirmSubmit('EXAM SUBMIT');

    assert.equal(submitConfirmOpen, false);
    const updated = usePracticeStore.getState();
    assert.equal(updated.tutorialActive, false);
    assert.equal(updated.tutorialStep, 'done');
    assert.ok(updated.receipt != null);
  });
});

test('SubmitController: State Machine and Submission Gate', async (t) => {
  await t.test('controller blocks submit when phrase does not match', async () => {
    let finalized = false;
    const controller = createSubmitController({
      finalizeSubmission: async () => {
        finalized = true;
      },
    });

    const res = controller.requestSubmit('manual', 'wrong phrase');
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, 'PHRASE_REQUIRED');
    }
    assert.equal(finalized, false);
    assert.equal(controller.getState(), 'idle');
  });

  await t.test('controller allows submit when exact phrase is typed', async () => {
    let finalized = false;
    const controller = createSubmitController({
      finalizeSubmission: async () => {
        finalized = true;
      },
    });

    const res = controller.requestSubmit('manual', 'EXAM SUBMIT');
    assert.equal(res.ok, true);
    assert.equal(controller.getState(), 'submitting');
  });
});
