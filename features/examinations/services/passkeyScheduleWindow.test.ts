import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPasskeyScheduleWindow,
  getPasskeyScheduleWindowState,
  passkeyScheduleWindowMessage,
} from './passkeyScheduleWindow';

const schedule = {
  exam_date: '2026-10-04',
  start_time: '09:00:00',
  end_time: '10:00:00',
};

test('enforces the 30-minute early join window in Asia/Manila, including schedule end', () => {
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 0, 29, 59)), 'not_started');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 0, 30, 0)), 'valid');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 0, 31, 0)), 'valid');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 1, 0, 0)), 'valid');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 2, 0, 0)), 'valid');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 2, 0, 1)), 'expired');
});

test('formats distinct messages for too early and ended schedules', () => {
  assert.equal(formatPasskeyScheduleWindow(schedule), 'Oct 4, 2026, 9:00-10:00 AM');
  assert.equal(
    passkeyScheduleWindowMessage(schedule, 'not_started'),
    'Joining opens at 8:30 AM.',
  );
  assert.equal(
    passkeyScheduleWindowMessage(schedule, 'expired'),
    'This examination schedule has ended.',
  );
});