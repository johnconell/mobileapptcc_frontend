import assert from 'node:assert/strict';
import test from 'node:test';
import { matchQueuedResult, queueResultBeforeConfirm } from './resultQueueIdentity';

const queued = {
  local_id: 'attempt-1',
  applicant_code: 'APP-1',
  examination_schedule_id: 7,
  answers: [
    { exam_question_id: 1, selected_answer: 'A', is_correct: false },
    { exam_question_id: 2, selected_answer: null, is_correct: false },
  ],
};

test('same id and answers match as a replay across answer representations', () => {
  assert.equal(
    matchQueuedResult([queued], {
      localId: 'attempt-1',
      applicantCode: 'app-1',
      scheduleId: 7,
      answers: { '2': null, '1': 'a' },
    }).kind,
    'duplicate',
  );
});

test('same saved answers replay as a duplicate across attempt ids', () => {
  assert.equal(
    matchQueuedResult([queued], {
      localId: 'attempt-2',
      applicantCode: 'APP-1',
      scheduleId: 7,
      answers: { '1': 'A', '2': null },
    }).kind,
    'duplicate',
  );
});

test('changed answers for the same schedule conflict', () => {
  assert.equal(
    matchQueuedResult([queued], {
      localId: 'attempt-1',
      applicantCode: 'APP-1',
      scheduleId: 7,
      answers: { '1': 'B', '2': null },
    }).kind,
    'conflict',
  );
});

test('completion is marked only after the result is durably queued', async () => {
  const row = { ...queued, local_id: 'stable-end-exam-attempt' };
  let confirmed = false;
  let calls = 0;
  const queue = async () => {
    calls++;
    if (calls === 1) throw new Error('disk unavailable');
  };
  const confirm = () => {
    confirmed = true;
  };

  await assert.rejects(queueResultBeforeConfirm(row, queue, confirm), /disk unavailable/);
  assert.equal(confirmed, false);

  await queueResultBeforeConfirm(row, queue, confirm);
  assert.equal(confirmed, true);
  assert.equal(calls, 2);
});
