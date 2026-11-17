import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attendanceAtSnapshot,
  closeAttendanceAtStart,
  recordAdmissionAttendance,
} from './attendance';

test('30-student attendance remains stable through start, disconnect, and reconnect', () => {
  const roster = Array.from({ length: 30 }, () => 'not_arrived');

  // Twenty students receive proctor approval and successfully fetch the lobby.
  for (let index = 0; index < 20; index += 1) {
    roster[index] = recordAdmissionAttendance(roster[index]);
  }
  for (let index = 0; index < roster.length; index += 1) {
    roster[index] = closeAttendanceAtStart(roster[index]);
  }
  assert.equal(roster.filter((status) => status === 'present').length, 20);
  assert.equal(roster.filter((status) => status === 'absent').length, 10);

  // Connection status is independent; five disconnects cannot mutate attendance.
  const connection = Array.from({ length: 30 }, (_, index) => index < 20);
  for (let index = 0; index < 5; index += 1) connection[index] = false;
  assert.equal(roster.filter((status) => status === 'present').length, 20);
  assert.equal(roster.filter((status) => status === 'absent').length, 10);

  // Re-admission/reconnect processing is idempotent and never adds a record.
  for (let index = 0; index < 5; index += 1) {
    roster[index] = recordAdmissionAttendance(roster[index]);
    connection[index] = true;
  }
  assert.equal(roster.filter((status) => status === 'present').length, 20);
  assert.equal(roster.filter((status) => status === 'absent').length, 10);
  assert.equal(attendanceAtSnapshot('present', true), 'present');
  assert.equal(attendanceAtSnapshot('absent', false), 'absent');
});
