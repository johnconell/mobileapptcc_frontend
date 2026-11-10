import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAnswerCheckpoint,
  shouldApplyAnswerCheckpoint,
} from './answerCheckpoint';

test('versioned LAN checkpoints keep the newest answer after out-of-order delivery', () => {
  for (const studentCount of [1, 5, 30]) {
    for (let student = 1; student <= studentCount; student += 1) {
      let currentRevision = 0;
      let currentAnswers: Record<string, string | null> = {};
      const checkpoints = [1, 2, 3].map((revision) =>
        normalizeAnswerCheckpoint({
          revision,
          answers: { q1: revision === 3 ? 'C' : revision === 2 ? 'B' : 'A' },
        }),
      );

      for (const checkpoint of [checkpoints[2], checkpoints[0], checkpoints[1]]) {
        if (shouldApplyAnswerCheckpoint(currentRevision, checkpoint.revision)) {
          currentRevision = checkpoint.revision ?? currentRevision;
          currentAnswers = checkpoint.answers;
        }
      }

      assert.equal(currentRevision, 3, `student ${student} of ${studentCount}`);
      assert.equal(currentAnswers.q1, 'C');
      assert.equal(shouldApplyAnswerCheckpoint(currentRevision, 3), false);
    }
  }
});

test('legacy checkpoints remain readable while new checkpoints are monotonic', () => {
  assert.equal(shouldApplyAnswerCheckpoint(0, undefined), true);
  assert.deepEqual(
    normalizeAnswerCheckpoint({ revision: 10, answers: { q1: 'b', q2: null } }),
    { revision: 10, answers: { q1: 'B', q2: null }, savedAt: undefined },
  );
});
