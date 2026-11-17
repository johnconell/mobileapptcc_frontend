import assert from 'node:assert/strict';
import test from 'node:test';
import { restoredScheduleRouteId } from './restoreProctorDestination';

test('restored lobby route uses schedule ID instead of composite room session ID', () => {
  assert.equal(
    restoredScheduleRouteId({
      schedule: { id: 105 },
      session: { scheduleId: 105, id: 'offline-105-r2' },
    }),
    '105',
  );
});

test('restored lobby route extracts schedule ID from legacy composite local ID', () => {
  assert.equal(restoredScheduleRouteId({ session: { id: 'offline-105-r2' } }), '105');
});
