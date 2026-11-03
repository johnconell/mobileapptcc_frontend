import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';

const incidentStorageKey = 'tcc.security.incidents.enc';
const legacyIncidentStorageKey = 'tcc.exam.guidedAccessIncidents';

test.beforeEach(async () => {
  await appStorage.deleteItem(incidentStorageKey);
  await appStorage.deleteItem(legacyIncidentStorageKey);
  await appStorage.setItem(STORAGE_KEYS.participationToken, 'participation-token');
});

test('queued incidents retry after disconnection with the same idempotency key', async (context) => {
  let connected = false;
  const deliveries: Array<Record<string, unknown>> = [];
  context.mock.method(PeerExamClient, 'isActive', async () => true);
  context.mock.method(
    PeerExamClient,
    'request',
    async <T>(_path: string, options?: { body?: unknown }): Promise<T> => {
      deliveries.push(options?.body as Record<string, unknown>);
      if (!connected) throw new Error('proctor temporarily unreachable');
      return { acknowledged: true, violation_count: 1 } as T;
    },
  );

  await SecurityRepository.recordViolation({
    sessionId: 'local-session-1',
    studentId: 'student-1',
    studentName: 'Incident Student',
    type: 'app_background',
    message: 'Application moved to background.',
  });
  await SecurityRepository.flushPending();

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.local_event_id != null, true);

  connected = true;
  await SecurityRepository.flushPending();

  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0]?.local_event_id, deliveries[1]?.local_event_id);
  assert.equal(deliveries[0]?.participation_token, 'participation-token');
  assert.equal('session_id' in (deliveries[1] ?? {}), false);

  const incidents = await SecurityRepository.getViolations('local-session-1');
  assert.equal(incidents.length, 1);
});
