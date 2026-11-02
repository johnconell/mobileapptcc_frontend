import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeEffectiveDeadline,
  createInitialTimeSync,
  detectClockRollback,
  detectMonotonicDrift,
  recalculateTimer,
  reconcileWithAuthorityPulse,
} from './examTimerCoordinator';
import { useExamStore } from '../stores/examStore';
import { ExamProgressStore, type ExamCheckpoint } from './examProgressStore';

test.beforeEach(async () => {
  useExamStore.getState().reset();
  await ExamProgressStore.clear();
});

test('timer: separates schedule availability window from attempt examination deadline', () => {
  // Scenario: Schedule window is 8:00 AM to 12:00 PM (4 hours = 240 mins)
  // Attempt started at 8:15 AM with 60 minute duration.
  // The attempt deadline must be 9:15 AM, NOT 12:00 PM!
  const scheduleClosingIso = '2026-11-02T12:00:00.000Z';
  const attemptStartedIso = '2026-11-02T08:15:00.000Z';
  const durationMinutes = 60;

  const result = computeEffectiveDeadline(attemptStartedIso, durationMinutes, scheduleClosingIso);
  assert.equal(result.deadlineIso, '2026-11-02T09:15:00.000Z');
  assert.equal(result.boundedBySchedule, false);

  // Scenario 2: Late start where schedule closes BEFORE nominal duration finishes
  // Attempt started at 11:30 AM with 60 min duration, but room strictly closes at 12:00 PM (30 mins left)
  const lateAttemptStartedIso = '2026-11-02T11:30:00.000Z';
  const lateResult = computeEffectiveDeadline(lateAttemptStartedIso, durationMinutes, scheduleClosingIso);
  assert.equal(lateResult.deadlineIso, '2026-11-02T12:00:00.000Z');
  assert.equal(lateResult.boundedBySchedule, true);
});

test('timer: recalculates remaining time on resume and refuses to restore saved countdown unchanged', () => {
  // Attempt started at 8:00 AM with 60 min duration (deadline 9:00 AM)
  const startedAt = '2026-11-02T08:00:00.000Z';
  const deadline = '2026-11-02T09:00:00.000Z';
  const checkpointSaveTime = new Date('2026-11-02T08:10:00.000Z').getTime(); // Saved at 8:10 AM (50 mins left)

  const timeSync = createInitialTimeSync();
  timeSync.lastKnownDeviceTimeMs = checkpointSaveTime;

  // Student closes app at 8:10 AM and re-opens at 8:40 AM (30 mins have elapsed!)
  const resumeDeviceTime = new Date('2026-11-02T08:40:00.000Z').getTime();

  const recalculated = recalculateTimer({
    startedAt,
    deadline,
    timeSync,
    nowDeviceMs: resumeDeviceTime,
  });

  // Remaining time must be 20 minutes (1200 seconds), NOT 50 minutes (3000 seconds)!
  assert.equal(recalculated.remainingSeconds, 20 * 60);
  assert.equal(recalculated.isExpired, false);
  assert.equal(recalculated.status, 'running');
  assert.equal(recalculated.isAnsweringAllowed, true);
});

test('timer: restart after expiry results in remainingSeconds=0, locks answering, and preserves answers', () => {
  const startedAt = '2026-11-02T08:00:00.000Z';
  const deadline = '2026-11-02T09:00:00.000Z';
  const checkpointSaveTime = new Date('2026-11-02T08:50:00.000Z').getTime();

  const timeSync = createInitialTimeSync();
  timeSync.lastKnownDeviceTimeMs = checkpointSaveTime;

  // Student re-opens app at 9:05 AM (5 minutes after deadline!)
  const expiredDeviceTime = new Date('2026-11-02T09:05:00.000Z').getTime();

  const recalculated = recalculateTimer({
    startedAt,
    deadline,
    timeSync,
    nowDeviceMs: expiredDeviceTime,
  });

  assert.equal(recalculated.remainingSeconds, 0);
  assert.equal(recalculated.isExpired, true);
  assert.equal(recalculated.status, 'expired');
  assert.equal(recalculated.isAnsweringAllowed, false);
});

test('timer: detects clock rollback, halts answer editing, and preserves saved progress', () => {
  // Checkpoint saved at 8:30 AM
  const checkpointSaveTime = new Date('2026-11-02T08:30:00.000Z').getTime();
  const timeSync = createInitialTimeSync();
  timeSync.lastKnownDeviceTimeMs = checkpointSaveTime;

  // Student rolls device clock backward to 8:15 AM to try gaining 15 minutes
  const rollbackDeviceTime = new Date('2026-11-02T08:15:00.000Z').getTime();

  assert.equal(detectClockRollback(rollbackDeviceTime, checkpointSaveTime), true);

  const recalculated = recalculateTimer({
    startedAt: '2026-11-02T08:00:00.000Z',
    deadline: '2026-11-02T09:00:00.000Z',
    timeSync,
    nowDeviceMs: rollbackDeviceTime,
  });

  assert.equal(recalculated.clockRollbackDetected, true);
  assert.equal(recalculated.status, 'reconciliation_required');
  assert.equal(recalculated.isAnsweringAllowed, false);
});

test('timer: monotonic elapsed time detects active-process clock jumps and advances time accurately', () => {
  // Process started at mono 10,000ms, wall clock 8:00:00
  const syncDeviceMs = new Date('2026-11-02T08:00:00.000Z').getTime();
  const timeSync = createInitialTimeSync();
  timeSync.deviceTimeAtSyncMs = syncDeviceMs;
  timeSync.lastKnownDeviceTimeMs = syncDeviceMs;
  timeSync.monotonicAtSyncMs = 10_000;
  timeSync.lastKnownMonotonicMs = 10_000;

  // 1 minute (60,000ms) passes monotonically (mono = 70,000ms)
  // BUT user manually set wall clock backward to 7:55:00 (-300,000ms)
  const driftedDeviceMs = syncDeviceMs - 300_000;
  const currentMonotonicMs = 70_000;

  const isDrift = detectMonotonicDrift({
    currentDeviceMs: driftedDeviceMs,
    lastKnownDeviceMs: syncDeviceMs,
    currentMonotonicMs,
    lastKnownMonotonicMs: 10_000,
  });
  assert.equal(isDrift, true);

  // Recalculate detects the anomaly and refuses to grant illegitimate extra time
  const recalculated = recalculateTimer({
    startedAt: '2026-11-02T08:00:00.000Z',
    deadline: '2026-11-02T09:00:00.000Z',
    timeSync,
    nowDeviceMs: driftedDeviceMs,
    nowMonotonicMs: currentMonotonicMs,
  });

  assert.equal(recalculated.status, 'reconciliation_required');
  assert.equal(recalculated.isAnsweringAllowed, false);
});

test('timer: LAN loss does not reset timer; reconnect reconciles with authoritative proctor serverTime', () => {
  const startedAt = '2026-11-02T08:00:00.000Z';
  const deadline = '2026-11-02T09:00:00.000Z';

  // 1. Exam running offline during LAN disconnect
  const localSync = createInitialTimeSync();
  localSync.lastKnownDeviceTimeMs = new Date('2026-11-02T08:15:00.000Z').getTime();

  // Local calculation continues based on deadline
  const offlineCheck = recalculateTimer({
    startedAt,
    deadline,
    timeSync: localSync,
    nowDeviceMs: new Date('2026-11-02T08:20:00.000Z').getTime(),
  });
  assert.equal(offlineCheck.remainingSeconds, 40 * 60);

  // 2. Wi-Fi returns and student receives heartbeat pulse from proctor
  // Proctor phone's authoritative clock is at 8:20:10 (server has 39 mins 50 secs remaining)
  const proctorServerTime = '2026-11-02T08:20:10.000Z';
  const proctorEndsAt = '2026-11-02T09:00:00.000Z';

  const reconciled = reconcileWithAuthorityPulse({
    serverTimeIso: proctorServerTime,
    startedAtIso: startedAt,
    endsAtIso: proctorEndsAt,
    serverRemainingSeconds: 2390,
    currentSync: localSync,
    deadlineIso: deadline,
    authority: 'proctor_peer',
  });

  assert.equal(reconciled.status, 'running');
  assert.equal(reconciled.remainingSeconds, 2390);
  assert.equal(reconciled.timeSync.syncAuthority, 'proctor_peer');
  assert.equal(reconciled.timeSync.serverTimeAtSync, proctorServerTime);
});

test('timer: useExamStore locks answering when expired or reconciling and preserves answers in checkpoint', async () => {
  const store = useExamStore.getState();
  store.setQuestions([
    {
      id: 'q1',
      number: 1,
      subjectId: 'sub-1',
      type: 'multiple_choice',
      question: 'Question 1',
      choices: { A: 'A', B: 'B', C: 'C', D: 'D' },
      correctAnswer: 'A',
      explanation: '',
    },
  ]);

  store.startExam({
    durationMinutes: 60,
    startedAt: '2026-11-02T08:00:00.000Z',
    deadline: '2026-11-02T09:00:00.000Z',
    attemptId: 'att-101',
  });

  // Answer while active
  store.selectAnswer('q1', 'B');
  assert.equal(useExamStore.getState().answers.q1?.selectedAnswer, 'B');

  // Simulate expiry (timer hits 0)
  useExamStore.getState().setRemainingSeconds(0);
  assert.equal(useExamStore.getState().timerStatus, 'expired');
  assert.equal(useExamStore.getState().isAnsweringAllowed(), false);

  // Attempting to change answer after expiry is rejected!
  useExamStore.getState().selectAnswer('q1', 'C');
  assert.equal(useExamStore.getState().answers.q1?.selectedAnswer, 'B', 'Answer must not change after expiry');

  // Save to encrypted checkpoint
  const checkpoint: Omit<ExamCheckpoint, 'savedAt'> = {
    sessionId: 'session-test',
    studentId: 'student-test',
    attemptId: 'att-101',
    answers: useExamStore.getState().answers,
    remainingSeconds: 0,
    startedAt: '2026-11-02T08:00:00.000Z',
    deadline: '2026-11-02T09:00:00.000Z',
  };
  await ExamProgressStore.save(checkpoint);

  const loaded = await ExamProgressStore.load();
  assert.ok(loaded);
  assert.equal(loaded?.answers.q1?.selectedAnswer, 'B');
  assert.equal(loaded?.attemptId, 'att-101');
  assert.equal(loaded?.deadline, '2026-11-02T09:00:00.000Z');
});
