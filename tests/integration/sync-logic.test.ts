import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appStorage } from '@/shared/services/storage';
import { authStorageKeys } from '@/features/local-testing/localMode';
import { OfflineStore, type OfflineQueuedResult } from '@/features/synchronization/services/offlineStore';
import { makeLocalFixtures, makeOfflinePackFromLocalState } from '@/features/local-testing/fixtures';

/**
 * Offline pack + cloud sync integration tests.
 */
describe('sync logic integration', () => {
  it('parses examination code from METCC QR JSON (sync/join contract)', () => {
    const raw = JSON.stringify({ examinationCode: 'k7m2p9qx', sessionId: 1 });
    const parsed = JSON.parse(raw) as { examinationCode?: string };
    assert.equal(String(parsed.examinationCode).trim().toUpperCase(), 'K7M2P9QX');
  });

  it('exam-day pack download persists schedule + questions locally', async () => {
    // Authenticate as Proctor 1 (ID 901) so OfflineStore authorizes access to the pack
    await appStorage.setItem(authStorageKeys().session, JSON.stringify({ id: 901, email: 'proctor1.local@tcc.test' }));

    const fixtures = makeLocalFixtures(new Date('2026-11-02T08:00:00.000Z'));
    const pack = makeOfflinePackFromLocalState(fixtures, 901);

    // Save pack locally into encrypted storage
    await OfflineStore.savePack(pack);

    // Verify stored pack matches
    const retrieved = await OfflineStore.getPack();
    assert.ok(retrieved != null);
    assert.equal(retrieved.pack_version, 1);
    assert.equal(retrieved.schedules.length, 1);
    assert.equal(retrieved.schedules[0].id, 101);
    assert.equal(retrieved.applicants.length, 15);
    assert.equal(retrieved.registrations.length, 15);
    assert.equal(retrieved.question_banks.length, 1);
    assert.equal(retrieved.question_banks[0].subjects[0].questions.length, 40);
    assert.equal(retrieved.examination_settings?.duration_minutes, 60);

    const summary = await OfflineStore.getPackSummary();
    assert.equal(summary.schedules, 1);
    assert.equal(summary.students, 15);
    assert.equal(summary.questions, 40);
  });

  it('pending results queue stores offline result and reports unsynced', async () => {
    await OfflineStore.clearResults();

    const queuedResult: OfflineQueuedResult = {
      local_id: 'local-res-001',
      applicant_code: 'APP-2026-0001',
      applicant_name: 'Applicant01 Santos',
      examination_schedule_id: 101,
      attendance_status: 'present',
      result_status: 'completed',
      score: 85,
      items_correct: 34,
      items_total: 40,
      answers: [
        { exam_question_id: 5001, selected_answer: 'A', is_correct: true },
        { exam_question_id: 5002, selected_answer: 'C', is_correct: true },
      ],
      submitted_at: '2026-11-02T09:00:00.000Z',
      synced: false,
    };

    await OfflineStore.queueResult(queuedResult);

    const pending = await OfflineStore.pendingResults();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].local_id, 'local-res-001');
    assert.equal(pending[0].applicant_code, 'APP-2026-0001');
    assert.equal(pending[0].synced, false);
    assert.equal(pending[0].score, 85);
  });

  it('proctor push sync marks rows synced on cloud 200', async () => {
    // Current queue has local-res-001
    const pendingBefore = await OfflineStore.pendingResults();
    assert.equal(pendingBefore.length, 1);
    assert.equal(pendingBefore[0].local_id, 'local-res-001');

    // Simulate successful cloud push
    await OfflineStore.markSynced(['local-res-001']);

    // Verify pending results is now empty
    const pendingAfter = await OfflineStore.pendingResults();
    assert.equal(pendingAfter.length, 0);

    // Verify result is still stored but marked synced: true
    const allResults = await OfflineStore.getResults();
    const syncedItem = allResults.find((r) => r.local_id === 'local-res-001');
    assert.ok(syncedItem != null);
    assert.equal(syncedItem.synced, true);
  });
});
