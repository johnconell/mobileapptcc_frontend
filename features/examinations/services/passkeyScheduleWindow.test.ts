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

test('enforces the schedule window in Asia/Manila, including inclusive start and exclusive end', () => {
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 0, 59, 59)), 'not_started');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 1, 0, 0)), 'valid');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 1, 59, 59)), 'valid');
  assert.equal(getPasskeyScheduleWindowState(schedule, Date.UTC(2026, 9, 4, 2, 0, 0)), 'expired');
});

test('formats a past-key message with its scheduled Manila date and batch times', () => {
  assert.equal(formatPasskeyScheduleWindow(schedule), 'Oct 4, 2026, 9:00-10:00 AM');
  assert.equal(
    passkeyScheduleWindowMessage(schedule, 'expired'),
    'This examination key has expired. This key is for Oct 4, 2026, 9:00-10:00 AM.',
  );
});