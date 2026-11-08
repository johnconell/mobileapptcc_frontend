import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseExamSessionRestrictions } from './examSessionRestrictions';

test('exam restrictions are released once for an explicit lobby exit', async () => {
  let calls = 0;
  await releaseExamSessionRestrictions('lobby_exit', async () => {
    calls += 1;
  }, async () => false);
  assert.equal(calls, 1);
});

test('exam restrictions are released only after submission confirmation', async () => {
  const events: string[] = ['submission_saved'];
  await releaseExamSessionRestrictions('submission_confirmed', async () => {
    events.push('restrictions_released');
  }, async () => false);
  events.push('success_screen');
  assert.deepEqual(events, [
    'submission_saved',
    'restrictions_released',
    'success_screen',
  ]);
});

test('a delayed Android unpin is retried and verified', async () => {
  let releases = 0;
  let reads = 0;
  await releaseExamSessionRestrictions(
    'session_ended',
    async () => {
      releases += 1;
    },
    async () => {
      reads += 1;
      return reads === 1;
    },
  );
  assert.equal(releases, 2);
});
