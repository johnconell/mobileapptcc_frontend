import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPasskeyMatch } from '@/features/examinations/services/passkeyClassification';
import { mapServerToAuthority } from '@/features/examinations/services/examAuthority';
import { validateExamStartup, type ExamPackProgress } from '@/features/examinations/services/examReadiness';

/**
 * Integration checks for the examinee join → lobby → exam state machine.
 */
describe('exam flow integration', () => {
  it('rejects passkey when schedule does not match scanned session', () => {
    assert.equal(
      classifyPasskeyMatch({ currentScheduleId: 5, matchingScheduleIds: [9] }),
      'wrong_schedule',
    );
  });

  it('does not treat ended room as active for auto-start', () => {
    assert.equal(mapServerToAuthority('ended'), 'ENDED');
    assert.equal(mapServerToAuthority('in_progress'), 'ACTIVE');
  });

  it('QR resolve → passkey → lobby download reaches examReady', () => {
    // 1. Scanned QR payload parsed
    const qrPayload = JSON.stringify({ examinationCode: 'TCC10126', sessionId: 101, roomId: 201 });
    const parsedQr = JSON.parse(qrPayload);
    assert.equal(parsedQr.examinationCode, 'TCC10126');
    assert.equal(parsedQr.sessionId, 101);

    // 2. Passkey matches current schedule
    const matchClassification = classifyPasskeyMatch({
      currentScheduleId: 101,
      matchingScheduleIds: [101],
    });
    assert.equal(matchClassification, 'valid');

    // 3. Lobby download progress reaches ready state
    const readyProgress: ExamPackProgress = {
      phase: 'ready',
      phaseLabel: 'Ready to Start',
      percent: 100,
      questionsDownloaded: 40,
      questionsExpected: 40,
      assetsDownloaded: 0,
      assetsExpected: 0,
      configurationComplete: true,
      hashVerified: true,
      moduleReady: true,
      durationMinutes: 60,
      hasSettings: true,
    };

    const mockQuestion = {
      id: 5001,
      text: 'Sample question stem',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,
    } as any;

    const readinessResult = validateExamStartup({
      sessionId: 'sess-101',
      examId: 'exam-101',
      questions: [mockQuestion],
      durationMinutes: 60,
      hasSettings: true,
      sessionStatus: 'in_progress',
      authorityStatus: 'ACTIVE',
      progress: readyProgress,
    });

    assert.deepEqual(readinessResult, { ok: true });

    // 4. Incomplete download fails closed
    const incompleteProgress: ExamPackProgress = {
      ...readyProgress,
      percent: 65,
      moduleReady: false,
    };
    const incompleteResult = validateExamStartup({
      sessionId: 'sess-101',
      examId: 'exam-101',
      questions: [mockQuestion],
      durationMinutes: 60,
      hasSettings: true,
      sessionStatus: 'in_progress',
      authorityStatus: 'ACTIVE',
      progress: incompleteProgress,
    });
    assert.equal(incompleteResult.ok, false);
    if (!incompleteResult.ok) {
      assert.equal(incompleteResult.code, 'DOWNLOAD_INCOMPLETE');
    }
  });

  it('resume exam only when session still in_progress on LAN', () => {
    const readyProgress: ExamPackProgress = {
      phase: 'ready',
      phaseLabel: 'Ready to Start',
      percent: 100,
      questionsDownloaded: 40,
      questionsExpected: 40,
      assetsDownloaded: 0,
      assetsExpected: 0,
      configurationComplete: true,
      hashVerified: true,
      moduleReady: true,
      durationMinutes: 60,
      hasSettings: true,
    };
    const mockQuestion = { id: 5001, text: 'Q1', options: [], correctAnswer: 0 } as any;

    // Case 1: Session in progress on LAN -> allowed to resume
    assert.equal(mapServerToAuthority('in_progress'), 'ACTIVE');
    const resumeActive = validateExamStartup({
      sessionId: 'sess-101',
      examId: 'exam-101',
      questions: [mockQuestion],
      durationMinutes: 60,
      hasSettings: true,
      sessionStatus: 'in_progress',
      authorityStatus: mapServerToAuthority('in_progress'),
      progress: readyProgress,
    });
    assert.deepEqual(resumeActive, { ok: true });

    // Case 2: Session ended on LAN -> rejected, session ended
    assert.equal(mapServerToAuthority('ended'), 'ENDED');
    const resumeEnded = validateExamStartup({
      sessionId: 'sess-101',
      examId: 'exam-101',
      questions: [mockQuestion],
      durationMinutes: 60,
      hasSettings: true,
      sessionStatus: 'ended',
      authorityStatus: mapServerToAuthority('ended'),
      progress: readyProgress,
    });
    assert.equal(resumeEnded.ok, false);
    if (!resumeEnded.ok) {
      assert.equal(resumeEnded.code, 'SESSION_NOT_ACTIVE');
    }

    // Case 3: Session still in lobby (not yet started) -> rejected with WAITING_FOR_START
    assert.equal(mapServerToAuthority('lobby_open'), 'WAITING');
    const resumeLobby = validateExamStartup({
      sessionId: 'sess-101',
      examId: 'exam-101',
      questions: [mockQuestion],
      durationMinutes: 60,
      hasSettings: true,
      sessionStatus: 'lobby_open',
      authorityStatus: mapServerToAuthority('lobby_open'),
      progress: readyProgress,
    });
    assert.equal(resumeLobby.ok, false);
    if (!resumeLobby.ok) {
      assert.equal(resumeLobby.code, 'WAITING_FOR_START');
    }
  });
});
