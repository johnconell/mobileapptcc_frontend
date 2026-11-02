import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExamSubmissionCoordinator,
  classifySubmissionError,
  calculateBackoffDelay,
  generateSubmissionDigest,
  SUBMISSION_RETRY_CONFIG,
} from './examSubmissionCoordinator';
import {
  ExamSubmissionStore,
  type FinalizedSubmission,
} from './examSubmissionStore';
import { QuestionRepository } from '../repositories/QuestionRepository';
import { useExamStore } from '../stores/examStore';

const dummySubmission: FinalizedSubmission = {
  submissionId: 'sub-test-1',
  attemptId: 'att-user-123',
  idempotencyKey: 'sub_sess1_app42_att-user-123',
  sessionId: 'sess-100',
  studentId: 'stud-1',
  applicantCode: 'APP-2026-0042',
  studentName: 'Maria Santos',
  answers: {
    '1': 'A',
    '2': 'C',
    '3': 'B',
  },
  finalReason: 'submitted',
  status: 'pending',
  destination: 'proctor_peer',
  attemptCount: 0,
  maxAttempts: 3,
  createdAt: '2026-11-02T08:00:00.000Z',
  updatedAt: '2026-11-02T08:00:00.000Z',
};

test.beforeEach(async () => {
  ExamSubmissionCoordinator.cancelScheduledRetry();
  await ExamSubmissionStore.clear();
  useExamStore.getState().reset();
});

test('submission error classifier: correctly identifies transient vs non-transient errors', () => {
  // 1. Network drop (transient)
  const netErr = new Error('Network request failed');
  const netClass = classifySubmissionError(netErr);
  assert.equal(netClass.isTransient, true);
  assert.equal(netClass.isAlreadySubmitted, false);

  // 2. Server 503 Service Unavailable (transient)
  const err503 = new Error('No examination is open on the proctor phone.');
  (err503 as any).status = 503;
  const s503Class = classifySubmissionError(err503);
  assert.equal(s503Class.isTransient, true);

  // 3. 401 Unauthorized / Expired session (non-transient - must not retry infinitely)
  const err401 = new Error('Session expired.');
  (err401 as any).status = 401;
  const s401Class = classifySubmissionError(err401);
  assert.equal(s401Class.isTransient, false);
  assert.equal(s401Class.statusCode, 401);

  // 4. 403 Forbidden / Removed from room (non-transient)
  const err403 = new Error('You are not authorized for this room.');
  (err403 as any).status = 403;
  const s403Class = classifySubmissionError(err403);
  assert.equal(s403Class.isTransient, false);
  assert.equal(s403Class.statusCode, 403);

  // 5. 422 Unprocessable payload (non-transient)
  const err422 = new Error('Validation failed for answers');
  (err422 as any).status = 422;
  const s422Class = classifySubmissionError(err422);
  assert.equal(s422Class.isTransient, false);
  assert.equal(s422Class.statusCode, 422);

  // 6. Lost response recovery: server committed result earlier (already submitted)
  const errLostAck = new Error('Examination submission was already confirmed.');
  (errLostAck as any).status = 422;
  const lostClass = classifySubmissionError(errLostAck);
  assert.equal(lostClass.isAlreadySubmitted, true);
});

test('submission coordinator: bounded backoff calculation includes jitter and respects limits', () => {
  const customConfig = {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 8000,
    backoffFactor: 2,
    jitterMaxMs: 500,
  };

  const delay1 = calculateBackoffDelay(1, customConfig);
  // Attempt 1: 1000 * 2^0 = 1000 + [0..500]
  assert.ok(delay1 >= 1000 && delay1 <= 1500, `Delay1 was ${delay1}`);

  const delay2 = calculateBackoffDelay(2, customConfig);
  // Attempt 2: 1000 * 2^1 = 2000 + [0..500]
  assert.ok(delay2 >= 2000 && delay2 <= 2500, `Delay2 was ${delay2}`);

  const delay10 = calculateBackoffDelay(10, customConfig);
  // Capped at 8000 + [0..500]
  assert.ok(delay10 >= 8000 && delay10 <= 8500, `Delay10 was ${delay10}`);
});

test('submission coordinator: persistent storage preserves attemptId, idempotencyKey, and answers across restarts', async () => {
  await ExamSubmissionStore.save(dummySubmission);

  // Simulate process restart: read from disk
  const reloaded = await ExamSubmissionStore.load();
  assert.ok(reloaded != null);
  assert.equal(reloaded.attemptId, 'att-user-123');
  assert.equal(reloaded.idempotencyKey, 'sub_sess1_app42_att-user-123');
  assert.deepEqual(reloaded.answers, { '1': 'A', '2': 'C', '3': 'B' });
  assert.equal(reloaded.status, 'pending');
});

test('submission coordinator: non-transient error (403/422/401) stops retry loop immediately and sets action_required', async () => {
  await ExamSubmissionStore.save({ ...dummySubmission, maxAttempts: 5 });

  // Mock QuestionRepository to throw 403 Forbidden
  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Student assignment removed by proctor.');
      (err as any).status = 403;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    assert.equal(result.status, 'action_required');
    assert.equal(result.attemptCount, 0, 'Non-transient error must not increment attemptCount');
    assert.equal(result.lastError?.statusCode, 403);
    assert.equal(result.lastError?.isTransient, false);

    // Verify disk record also updated
    const saved = await ExamSubmissionStore.load();
    assert.equal(saved?.status, 'action_required');
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('submission coordinator: transient network failures increment attempt count until maxAttempts then halt at action_required', async () => {
  await ExamSubmissionStore.save({ ...dummySubmission, attemptCount: 2, maxAttempts: 3 });

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Network request failed');
      (err as any).status = 0;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    // Was at 2, now 3 (hits maxAttempts=3) -> switches to action_required
    assert.equal(result.attemptCount, 3);
    assert.equal(result.status, 'action_required');
    assert.ok(result.lastError?.message.includes('failed'));
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('submission coordinator: successful delivery transitions to confirmed and preserves destination receipt', async () => {
  await ExamSubmissionStore.save(dummySubmission);

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      return {
        success: true,
        submittedAt: '2026-11-02T08:05:00.000Z',
        destination: 'proctor_peer',
        alreadySubmitted: false,
      };
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.receipt?.destination, 'proctor_peer');
    assert.equal(result.receipt?.confirmedAt, '2026-11-02T08:05:00.000Z');
    assert.ok(result.receipt?.confirmationCode?.includes('-'));

    // Check store updated
    const saved = await ExamSubmissionStore.load();
    assert.equal(saved?.status, 'confirmed');
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('submission coordinator: lost response after server commitment recovers as confirmed without creating duplicate', async () => {
  await ExamSubmissionStore.save(dummySubmission);

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    // Simulate server returning 422 with message that student already submitted
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Examination submission was already confirmed.');
      (err as any).status = 422;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    // Must be recognized as CONFIRMED success, not failure!
    assert.equal(result.status, 'confirmed');
    assert.equal(result.receipt?.alreadySubmitted, true);
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('submission coordinator: verification digest is deterministic and reproducible', () => {
  const digest1 = generateSubmissionDigest(dummySubmission);
  const digest2 = generateSubmissionDigest(dummySubmission);
  assert.equal(digest1, digest2);
  assert.match(digest1, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

// Explicit tests matching all 7 audited requirements:
test('scenario: network failure - increments attempt count, records transient error, and schedules backoff', async () => {
  await ExamSubmissionStore.save({ ...dummySubmission, attemptCount: 0, maxAttempts: 5 });

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Network request failed');
      (err as any).status = 0;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    assert.equal(result.status, 'retrying');
    assert.equal(result.attemptCount, 1);
    assert.equal(result.lastError?.isTransient, true);
    assert.ok(result.nextRetryAt != null && result.nextRetryAt > Date.now());
  } finally {
    ExamSubmissionCoordinator.cancelScheduledRetry();
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('scenario: server failure - 503 Service Unavailable is classified as transient and schedules retry', async () => {
  await ExamSubmissionStore.save({ ...dummySubmission, attemptCount: 1, maxAttempts: 5 });

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Database connection pool exhausted');
      (err as any).status = 503;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    assert.equal(result.status, 'retrying');
    assert.equal(result.attemptCount, 2);
    assert.equal(result.lastError?.statusCode, 503);
    assert.equal(result.lastError?.isTransient, true);
  } finally {
    ExamSubmissionCoordinator.cancelScheduledRetry();
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('scenario: rejected payload - 422 Unprocessable validation error halts immediately at action_required', async () => {
  await ExamSubmissionStore.save({ ...dummySubmission, attemptCount: 0, maxAttempts: 5 });

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Answers payload contains unknown question ID 999');
      (err as any).status = 422;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    assert.equal(result.status, 'action_required');
    assert.equal(result.attemptCount, 0, 'Must not burn retry attempts on terminal validation error');
    assert.equal(result.lastError?.statusCode, 422);
    assert.equal(result.lastError?.isTransient, false);
    assert.equal(result.nextRetryAt, null);
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('scenario: expired authentication - 401 Unauthorized halts immediately at action_required', async () => {
  await ExamSubmissionStore.save({ ...dummySubmission, attemptCount: 0, maxAttempts: 5 });

  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      const err = new Error('Token has been revoked or expired');
      (err as any).status = 401;
      throw err;
    };

    const result = await ExamSubmissionCoordinator.deliver();
    assert.ok(result != null);
    assert.equal(result.status, 'action_required');
    assert.equal(result.attemptCount, 0);
    assert.equal(result.lastError?.statusCode, 401);
    assert.equal(result.lastError?.isTransient, false);
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('scenario: repeated taps - concurrent delivery calls acquire lock and execute exactly once', async () => {
  await ExamSubmissionStore.save(dummySubmission);

  let submitCallCount = 0;
  const originalSubmit = QuestionRepository.submitAnswers;
  try {
    QuestionRepository.submitAnswers = async () => {
      submitCallCount++;
      // Artificial delay to simulate network flight time
      await new Promise((res) => setTimeout(res, 50));
      return {
        success: true,
        submittedAt: '2026-11-02T08:10:00.000Z',
        destination: 'cloud',
        alreadySubmitted: false,
      };
    };

    // Simulate student rapidly tapping the submit button 5 times concurrently
    const promises = [
      ExamSubmissionCoordinator.deliver(),
      ExamSubmissionCoordinator.deliver(),
      ExamSubmissionCoordinator.deliver(),
      ExamSubmissionCoordinator.deliver(),
      ExamSubmissionCoordinator.deliver(),
    ];

    const results = await Promise.all(promises);
    assert.equal(submitCallCount, 1, 'QuestionRepository.submitAnswers must only be called once');
    for (const r of results) {
      assert.ok(r != null);
    }
  } finally {
    QuestionRepository.submitAnswers = originalSubmit;
  }
});

test('scenario: restart while pending - resumes directly to submitting screen without data loss', async () => {
  const { tryResumeStudentExam } = await import('./resumeExamSession');
  await ExamSubmissionStore.save({ ...dummySubmission, status: 'pending' });

  // Simulate cold app restart: invoke resume handler
  const resumeResult = await tryResumeStudentExam();
  assert.equal(resumeResult.ok, true);
  if (resumeResult.ok) {
    assert.equal(resumeResult.route, '/(student)/submitting');
  }

  // Ensure stored answers and attemptId remain completely intact
  const reloaded = await ExamSubmissionStore.load();
  assert.ok(reloaded != null);
  assert.equal(reloaded.attemptId, 'att-user-123');
  assert.deepEqual(reloaded.answers, dummySubmission.answers);
});


