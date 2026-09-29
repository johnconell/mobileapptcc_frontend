import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSubmitController,
  isConfirmPhrase,
} from './submitGate';

test('isConfirmPhrase accepts only the normalized confirmation phrase', () => {
  assert.equal(isConfirmPhrase(''), false);
  assert.equal(isConfirmPhrase('exam'), false);
  assert.equal(isConfirmPhrase('exam submi'), false);
  assert.equal(isConfirmPhrase('examsubmit'), false);
  assert.equal(isConfirmPhrase('exam-submit'), false);
  assert.equal(isConfirmPhrase('exam submit'), true);
  assert.equal(isConfirmPhrase('  EXAM   Submit  '), true);
});

test('manual submission without the phrase is rejected and does not send', () => {
  let sent = 0;
  const controller = createSubmitController({
    finalizeSubmission: async () => {
      sent += 1;
    },
  });

  assert.deepEqual(controller.requestSubmit('manual'), {
    ok: false,
    error: 'PHRASE_REQUIRED',
  });
  assert.equal(sent, 0);
  assert.equal(controller.getState(), 'idle');
});

test('manual submission is accepted once and then locked while submitting', () => {
  let sent = 0;
  let resolveSubmission: (() => void) | undefined;
  const controller = createSubmitController({
    finalizeSubmission: () =>
      new Promise<void>((resolve) => {
        resolveSubmission = () => {
          sent += 1;
          resolve();
        };
      }),
  });

  assert.deepEqual(controller.requestSubmit('manual', 'exam submit'), { ok: true });
  assert.deepEqual(controller.requestSubmit('manual', 'exam submit'), {
    ok: false,
    error: 'ALREADY_SUBMITTING',
  });
  assert.equal(controller.getState(), 'submitting');
  assert.equal(sent, 0);
  resolveSubmission?.();
});

test('timeout submission does not require a phrase', () => {
  let sent = 0;
  const controller = createSubmitController({
    finalizeSubmission: async () => {
      sent += 1;
    },
  });

  assert.deepEqual(controller.requestSubmit('timeout'), { ok: true });
  assert.equal(controller.getState(), 'submitting');
  assert.equal(sent, 1);
});
