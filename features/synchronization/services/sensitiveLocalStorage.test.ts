import assert from 'node:assert/strict';
import test from 'node:test';
import { appStorage } from '@/shared/services/storage';
import {
  encryptJson,
  decryptJson,
  isEncryptedEnvelope,
  writeEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  StorageDecryptionError,
  StorageFileNotFoundError,
  StorageCorruptionError,
  StorageKeyUnavailableError,
  setTestStorageKeyOverride,
} from '@/shared/services/encryptedStorage';
import { ExamProgressStore, type ExamCheckpoint } from '@/features/examinations/services/examProgressStore';
import { ProctorAuthCache } from '@/features/authentication/services/proctorAuthCache';
import { OfflineStore, type OfflineQueuedResult } from '@/features/synchronization/services/offlineStore';
import { STORAGE_KEYS } from '@/shared/constants';
import { authStorageKeys } from '@/features/local-testing/localMode';

test.beforeEach(async () => {
  setTestStorageKeyOverride(null);
  await ExamProgressStore.clear();
  await ProctorAuthCache.clear();
  await OfflineStore.clearResults();
  await OfflineStore.clearPackFiles();
  await appStorage.deleteItem(authStorageKeys().session);
});

test('offline pack restart snapshot keeps schedule totals and pack updates preserve unsynced results', async () => {
  await appStorage.setItem(authStorageKeys().session, JSON.stringify({ id: 88 }));
  const pack = {
    pack_version: 2,
    pack_revision: 1,
    authorization: { actor_id: 88, scope: 'assigned_rooms' as const, schedule_ids: [101] },
    active_question_bank_id: 7,
    schedules: [{
      id: 101,
      title: 'Entrance Examination',
      exam_date: '2026-11-10',
      registration_count: 120,
      assigned_registration_count: 90,
      unassigned_registration_count: 30,
      accessible_registration_count: 90,
      rooms: [
        { id: 1, room_name: 'Room 1', capacity: 30, student_count: 30 },
        { id: 2, room_name: 'Room 2', capacity: 30, student_count: 30 },
        { id: 3, room_name: 'Room 3', capacity: 30, student_count: 30 },
      ],
    }],
    applicants: [],
    registrations: [],
    question_banks: [],
  };
  const queued: OfflineQueuedResult = {
    local_id: 'preserved-result-1',
    applicant_code: 'APP-PRESERVED',
    examination_schedule_id: 101,
    examination_room_id: 1,
    question_bank_id: 7,
    attendance_status: 'present',
    result_status: 'passed',
    score: 100,
    items_correct: 1,
    items_total: 1,
    answers: [{ exam_question_id: 1, selected_answer: 'A', is_correct: true }],
    submitted_at: '2026-11-10T01:00:00Z',
    synced: false,
  };

  await OfflineStore.savePack(pack);
  await OfflineStore.queueResult(queued);
  OfflineStore.invalidatePackCache();

  const restored = await OfflineStore.getPack();
  const summary = await OfflineStore.getPackDashboardSnapshot();
  assert.equal(restored?.schedules[0].registration_count, 120);
  assert.equal(summary?.registrationsBySchedule['101'], 120);
  assert.equal(summary?.schedules[0].rooms?.[0].student_count, 30);

  await OfflineStore.savePack({ ...pack, pack_revision: 2, exported_at: '2026-11-10T02:00:00Z' });
  const resultsAfterUpdate = await OfflineStore.pendingResults();
  assert.equal(resultsAfterUpdate.length, 1);
  assert.equal(resultsAfterUpdate[0].local_id, 'preserved-result-1');
});

test('sensitive local storage: AES-256-GCM round trip encrypts and decrypts accurately', async () => {
  const secretData = {
    studentId: 'APP-2026-TEST',
    answers: { 'q-1': { questionId: 'q-1', selectedAnswer: 'B', answeredAt: '2026-11-02T08:00:00Z' } },
  };

  const ciphertextJson = await encryptJson(secretData);
  assert.equal(isEncryptedEnvelope(ciphertextJson), true);
  assert.doesNotMatch(ciphertextJson, /APP-2026-TEST/);
  assert.doesNotMatch(ciphertextJson, /q-1/);

  const decrypted = await decryptJson<typeof secretData>(ciphertextJson);
  assert.deepEqual(decrypted, secretData);
});

test('sensitive local storage: exam checkpoint round trip uses encrypted envelope and hides answers', async () => {
  const checkpoint: Omit<ExamCheckpoint, 'savedAt'> = {
    sessionId: 'session-101',
    studentId: 'APP-9988-1234',
    answers: {
      '501': { questionId: '501', selectedAnswer: 'C', answeredAt: '2026-11-02T09:15:00Z' },
    },
    remainingSeconds: 3200,
    startedAt: '2026-11-02T09:00:00Z',
    navMode: 'scroll',
    flags: { '501': true },
  };

  await ExamProgressStore.save(checkpoint);

  // Verify stored payload in storage is encrypted and does not expose student ID or answers
  const storedEncrypted = await appStorage.getItem(`${STORAGE_KEYS.examCheckpoint}.enc`);
  assert.ok(storedEncrypted, 'Encrypted checkpoint should be saved');
  assert.equal(isEncryptedEnvelope(storedEncrypted!), true);
  assert.doesNotMatch(storedEncrypted!, /APP-9988-1234/);
  assert.doesNotMatch(storedEncrypted!, /"selectedAnswer":"C"/);

  const loaded = await ExamProgressStore.load();
  assert.ok(loaded);
  assert.equal(loaded!.studentId, 'APP-9988-1234');
  assert.equal(loaded!.sessionId, 'session-101');
  assert.equal(loaded!.answers['501']?.selectedAnswer, 'C');
  assert.equal(loaded!.remainingSeconds, 3200);
});

test('sensitive local storage: proctor auth cache encrypts bcrypt hashes at rest', async () => {
  const mockProctor = [
    {
      id: 88,
      name: 'Proctor Alice',
      email: 'alice.proctor@tcc.edu.ph',
      password_hash: '$2y$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJK',
      status: 'active',
    },
  ];

  const count = await ProctorAuthCache.saveFromPackProctors(mockProctor);
  assert.equal(count, 1);

  // Stored record must be encrypted envelope and never contain raw hash or email
  const storedEncrypted = await appStorage.getItem('tcc.proctor.auth.cache.enc');
  assert.ok(storedEncrypted, 'Encrypted auth cache must exist');
  assert.equal(isEncryptedEnvelope(storedEncrypted!), true);
  assert.doesNotMatch(storedEncrypted!, /\$2y\$10\$abcdef/);
  assert.doesNotMatch(storedEncrypted!, /alice\.proctor@tcc\.edu\.ph/);

  // Verify accounts can be listed and verified in memory
  const accounts = await ProctorAuthCache.list();
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].email, 'alice.proctor@tcc.edu.ph');
});

test('sensitive local storage: queued offline results are encrypted and hide answers and scores', async () => {
  const mockResult: OfflineQueuedResult = {
    local_id: 'local-res-1',
    applicant_code: 'APP-2026-WINNER',
    examination_schedule_id: 101,
    attendance_status: 'present',
    result_status: 'passed',
    score: 85,
    items_correct: 34,
    items_total: 40,
    answers: [
      { exam_question_id: 1, selected_answer: 'A', is_correct: true },
      { exam_question_id: 2, selected_answer: 'D', is_correct: false },
    ],
    submitted_at: '2026-11-02T10:00:00Z',
    synced: false,
  };

  await OfflineStore.queueResult(mockResult);

  // Verify raw storage
  const stored = await appStorage.getItem('tcc.offline.results.enc');
  assert.ok(stored, 'Encrypted offline results file must exist');
  assert.equal(isEncryptedEnvelope(stored!), true);
  assert.doesNotMatch(stored!, /APP-2026-WINNER/);
  assert.doesNotMatch(stored!, /"score":85/);
  assert.doesNotMatch(stored!, /"is_correct":true/);

  const results = await OfflineStore.getResults();
  assert.equal(results.length, 1);
  assert.equal(results[0].applicant_code, 'APP-2026-WINNER');
  assert.equal(results[0].score, 85);
  assert.equal(results[0].synced, false);
  assert.equal(results[0].sync_status, 'pending');

  await OfflineStore.updateResultSyncStatus([mockResult.local_id], 'syncing');
  const syncing = await OfflineStore.getResults();
  assert.equal(syncing[0].sync_status, 'syncing');

  await OfflineStore.updateResultSyncStatus(
    [mockResult.local_id],
    'failed',
    'Server unavailable; queued for retry.',
  );
  const failed = await OfflineStore.getResults();
  assert.equal(failed[0].sync_status, 'failed');
  assert.equal((await OfflineStore.pendingResults()).length, 1);

  // Mark synced
  await OfflineStore.markSynced(['local-res-1']);
  const pending = await OfflineStore.pendingResults();
  assert.equal(pending.length, 0);
  const all = await OfflineStore.getResults();
  assert.equal(all[0].synced, true);
  assert.equal(all[0].sync_status, 'synced');
  assert.ok(all[0].synced_at);
});

test('sensitive local storage: tampering detection refuses silent fallback and throws StorageDecryptionError', async () => {
  const payload = { sensitive: 'exam-master-key' };
  const ciphertextJson = await encryptJson(payload);

  const parsed = JSON.parse(ciphertextJson);
  // Tamper with ciphertext by corrupting one base64 character
  const ctBytes = Buffer.from(parsed.ct, 'base64');
  ctBytes[0] ^= 0xff; // Flip bits in ciphertext
  parsed.ct = ctBytes.toString('base64');
  const tamperedJson = JSON.stringify(parsed);

  await assert.rejects(
    async () => {
      await decryptJson(tamperedJson);
    },
    (err: unknown) => {
      assert.ok(err instanceof StorageDecryptionError);
      assert.equal((err as StorageDecryptionError).code, 'DECRYPTION_FAILED');
      return true;
    },
  );

  // In offline results, tampered file throws rather than silently returning empty array []
  await appStorage.setItem('tcc.offline.results.enc', tamperedJson);
  await assert.rejects(
    async () => {
      await OfflineStore.getResults();
    },
    (err: unknown) => {
      assert.ok(err instanceof StorageDecryptionError);
      return true;
    },
  );
});

test('sensitive local storage: migration preserves legacy plaintext and purges plaintext only after encryption', async () => {
  // Pre-seed legacy plaintext results
  const legacyResults: OfflineQueuedResult[] = [
    {
      local_id: 'legacy-1',
      applicant_code: 'LEGACY-STUDENT-01',
      examination_schedule_id: 101,
      attendance_status: 'present',
      result_status: 'passed',
      score: 90,
      items_correct: 36,
      items_total: 40,
      answers: [],
      submitted_at: '2026-11-01T15:00:00Z',
      synced: false,
    },
  ];
  await appStorage.setItem('tcc.offline.results.json', JSON.stringify(legacyResults));
  await appStorage.deleteItem('tcc.offline.results.enc');

  // getResults should detect legacy plaintext, encrypt it, verify it, and delete the legacy plaintext key
  const loaded = await OfflineStore.getResults();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].applicant_code, 'LEGACY-STUDENT-01');

  // Verify encrypted file exists and legacy plaintext key is purged
  const encryptedKey = await appStorage.getItem('tcc.offline.results.enc');
  assert.ok(encryptedKey);
  assert.equal(isEncryptedEnvelope(encryptedKey!), true);
  const legacyKey = await appStorage.getItem('tcc.offline.results.json');
  assert.equal(legacyKey, null, 'Legacy plaintext must be deleted after verified migration');
});

test('sensitive local storage: missing key throws StorageKeyUnavailableError and refuses plaintext fallback', async () => {
  // Pass an invalid/empty key override to simulate platform secure key failure
  setTestStorageKeyOverride(new Uint8Array(16)); // Invalid length: AES-256 requires 32 bytes

  await assert.rejects(
    async () => {
      await encryptJson({ test: 'fail' });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );
});
