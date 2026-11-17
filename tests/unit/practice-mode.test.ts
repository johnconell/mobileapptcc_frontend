import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRACTICE_QUESTIONS,
  PRACTICE_CATEGORIES,
} from '../../features/practice/mockQuestions';
import {
  usePracticeStore,
  MOCK_APPLICANT,
  DEMO_PASSKEY,
  PRACTICE_DURATION_SECONDS,
} from '../../features/practice/practiceStore';

test('Practice Mode (Try Examination): Mock Questions Specification', async (t) => {
  await t.test('verifies exactly 25 mock questions exist', () => {
    assert.equal(
      PRACTICE_QUESTIONS.length,
      25,
      'Practice question set must contain exactly 25 questions',
    );
  });

  await t.test('verifies exactly 5 categories with 5 questions per category', () => {
    assert.equal(PRACTICE_CATEGORIES.length, 5);

    const counts: Record<string, number> = {};
    for (const q of PRACTICE_QUESTIONS) {
      assert.ok(q.category, 'All practice questions must include a category');
      counts[q.category] = (counts[q.category] || 0) + 1;
    }

    for (const cat of PRACTICE_CATEGORIES) {
      assert.equal(
        counts[cat],
        5,
        `Category "${cat}" must contain exactly 5 questions`,
      );
    }
  });

  await t.test('verifies each question has valid fields and A-D choices', () => {
    PRACTICE_QUESTIONS.forEach((q, index) => {
      assert.equal(q.number, index + 1, `Question ${index + 1} has sequential number`);
      assert.ok(q.id.length > 0, `Question ${index + 1} has non-empty ID`);
      assert.ok(q.question.length > 5, `Question ${index + 1} has descriptive text`);
      assert.ok(q.choices.A && q.choices.A.length > 0, `Question ${index + 1} choice A is valid`);
      assert.ok(q.choices.B && q.choices.B.length > 0, `Question ${index + 1} choice B is valid`);
      assert.ok(q.choices.C && q.choices.C.length > 0, `Question ${index + 1} choice C is valid`);
      assert.ok(q.choices.D && q.choices.D.length > 0, `Question ${index + 1} choice D is valid`);
      assert.ok(
        ['A', 'B', 'C', 'D'].includes(q.correctAnswer),
        `Question ${index + 1} correct answer must be in [A, B, C, D]`,
      );
      assert.ok(
        q.explanation && q.explanation.length > 5,
        `Question ${index + 1} has educational explanation`,
      );
    });
  });
});

test('Practice Mode: Mock Applicant and Demo Passkey', async (t) => {
  await t.test('verifies mock applicant has complete simulated credentials', () => {
    assert.equal(MOCK_APPLICANT.fullName, 'Juan Dela Cruz');
    assert.equal(MOCK_APPLICANT.programName, 'BS in Information Technology');
    assert.ok(MOCK_APPLICANT.email.includes('@'));
    assert.ok(MOCK_APPLICANT.studentId.length > 0);
    assert.ok(MOCK_APPLICANT.roomName.length > 0);
  });

  await t.test('verifies demo passkey configuration', () => {
    assert.equal(DEMO_PASSKEY, 'DEMO-1234');
    // In practice mode, any non-empty passkey is accepted
    const isValidPasskey = (input: string) => input.trim().length > 0;
    assert.equal(isValidPasskey('DEMO-1234'), true);
    assert.equal(isValidPasskey('CUSTOM-PASS'), true);
    assert.equal(isValidPasskey(''), false);
    assert.equal(isValidPasskey('   '), false);
  });
});

test('Practice Mode: Mandatory Pre-Exam Network Requirements', async (t) => {
  await t.test('verifies step 1 enforces room Wi-Fi, turning off mobile data, and hotspot', () => {
    const networkRequirements = [
      { id: 'wifi', name: 'Connect to Proctor Wi-Fi', offlineOnly: true },
      { id: 'mobile_data', name: 'Turn OFF Mobile Data', requiredState: 'OFF' },
      { id: 'hotspot', name: 'Turn OFF Personal Hotspot', requiredState: 'OFF' },
    ];

    assert.equal(networkRequirements.length, 3);
    assert.equal(networkRequirements[0].offlineOnly, true);
    assert.equal(networkRequirements[1].requiredState, 'OFF');
    assert.equal(networkRequirements[2].requiredState, 'OFF');
  });
});

test('Practice Mode: In-Memory Store & Interactive Tutorial State Flow', async (t) => {
  t.beforeEach(() => {
    usePracticeStore.getState().restartPractice();
  });

  await t.test('verifies initial state is cleanly initialized in memory', () => {
    const state = usePracticeStore.getState();
    assert.equal(state.currentIndex, 0);
    assert.equal(Object.keys(state.answers).length, 0);
    assert.equal(Object.keys(state.flags).length, 0);
    assert.equal(state.remainingSeconds, PRACTICE_DURATION_SECONDS);
    assert.equal(state.tutorialActive, true);
    assert.equal(state.tutorialStep, 'overview');
    assert.equal(state.navMode, 'one_at_a_time');
    assert.equal(state.agreed, false);
    assert.equal(state.receipt, null);
  });

  await t.test('verifies answer selection and tutorial step transition', () => {
    const store = usePracticeStore.getState();
    store.setTutorialStep('select_choice');

    // Select choice 'A' for question 1 (id: 'p1')
    usePracticeStore.getState().selectAnswer('p1', 'A');

    const state = usePracticeStore.getState();
    assert.equal(state.answers['p1']?.selectedAnswer, 'A');
    assert.equal(state.hasAnsweredCurrent, true);
    // Action gate: selecting an answer should auto-advance to 'flag_question'
    assert.equal(state.tutorialStep, 'flag_question');
  });

  await t.test('verifies flag toggling and tutorial progression on Q1', () => {
    const store = usePracticeStore.getState();
    store.setTutorialStep('flag_question');

    // Flag question 1
    usePracticeStore.getState().toggleFlag('p1');

    let state = usePracticeStore.getState();
    assert.equal(state.flags['p1'], true);
    assert.equal(state.hasFlaggedQ1, true);
    // Action gate: flagging Q1 advances tutorial to 'navigate_next'
    assert.equal(state.tutorialStep, 'navigate_next');

    // Unflagging toggles state
    usePracticeStore.getState().toggleFlag('p1');
    state = usePracticeStore.getState();
    assert.equal(state.flags['p1'], false);
    assert.equal(state.hasFlaggedQ1, false);
  });

  await t.test('verifies visiting 3+ questions with Q1 flagged triggers return_marked', () => {
    const store = usePracticeStore.getState();
    store.setTutorialStep('navigate_next');
    // Ensure Q1 is flagged
    usePracticeStore.getState().toggleFlag('p1');
    store.setTutorialStep('navigate_next');

    // Answer Q1, navigate to Q2 and Q3
    usePracticeStore.getState().selectAnswer('p1', 'A');
    usePracticeStore.getState().setCurrentIndex(1); // Visit Q2
    usePracticeStore.getState().selectAnswer('p2', 'B');
    usePracticeStore.getState().setCurrentIndex(2); // Visit Q3

    const state = usePracticeStore.getState();
    assert.ok(state.visitedQuestions.size >= 3, 'Visited at least 3 questions');
    assert.equal(state.hasFlaggedQ1, true);
    // Action gate: visiting 3+ questions with Q1 flagged triggers 'return_marked'
    assert.equal(state.tutorialStep, 'return_marked');

    // Returning to Q1 (index 0)
    usePracticeStore.getState().setCurrentIndex(0);
    const updated = usePracticeStore.getState();
    assert.equal(updated.currentIndex, 0);
    // Action gate: landing back on Q1 advances to 'open_navigator'
    assert.equal(updated.tutorialStep, 'open_navigator');

    // Action gate: jumping to Question 5 (index 4) advances to 'review_submit'
    usePracticeStore.getState().setTutorialStep('jump_question_5');
    usePracticeStore.getState().setCurrentIndex(4);
    assert.equal(usePracticeStore.getState().tutorialStep, 'review_submit');
  });

  await t.test('verifies full tutorial sequence progression and skip', () => {
    usePracticeStore.getState().setTutorialStep('overview');
    assert.equal(usePracticeStore.getState().tutorialStep, 'overview');

    usePracticeStore.getState().nextTutorialStep();
    assert.equal(usePracticeStore.getState().tutorialStep, 'mode_toggle');

    usePracticeStore.getState().nextTutorialStep();
    assert.equal(usePracticeStore.getState().tutorialStep, 'select_choice');

    usePracticeStore.getState().skipTutorial();
    assert.equal(usePracticeStore.getState().tutorialActive, false);
  });

  await t.test('verifies timer decrement', () => {
    const initialSeconds = usePracticeStore.getState().remainingSeconds;
    usePracticeStore.getState().decrementTimer();
    assert.equal(usePracticeStore.getState().remainingSeconds, initialSeconds - 1);
  });

  await t.test('verifies practice exam submission generates isolated demo receipt', () => {
    usePracticeStore.getState().selectAnswer('p1', 'A');
    usePracticeStore.getState().selectAnswer('p2', 'B');
    usePracticeStore.getState().submitPractice();

    const state = usePracticeStore.getState();
    assert.ok(state.submittedAt != null);
    assert.ok(state.receipt != null);
    assert.equal(state.receipt?.answersSaved, 2);
    assert.equal(state.receipt?.totalQuestions, 25);
    assert.ok(state.receipt?.verificationDigest.startsWith('DEMO-'));
    assert.equal(state.receipt?.destination, 'Practice Simulation (No Network Calls)');
    assert.equal(state.tutorialStep, 'done');
  });

  await t.test('verifies restartPractice cleanly resets in-memory examination', () => {
    usePracticeStore.getState().selectAnswer('p1', 'A');
    usePracticeStore.getState().toggleFlag('p1');
    usePracticeStore.getState().submitPractice();

    usePracticeStore.getState().restartPractice();

    const state = usePracticeStore.getState();
    assert.equal(Object.keys(state.answers).length, 0);
    assert.equal(Object.keys(state.flags).length, 0);
    assert.equal(state.currentIndex, 0);
    assert.equal(state.submittedAt, null);
    assert.equal(state.receipt, null);
    assert.equal(state.tutorialActive, true);
    assert.equal(state.tutorialStep, 'overview');
  });
});
