import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateOfflineHostRoom,
  validateOfflineRoomAssignment,
  type OfflineRoomSchedule,
} from './offlineRoomAssignment';

const managedSchedule: OfflineRoomSchedule = {
  id: 10,
  rooms_managed: true,
  rooms: [
    { id: 101, examination_schedule_id: 10, room_name: 'Room A' },
    { id: 102, examination_schedule_id: 10, room_name: 'Room B' },
  ],
};

const decide = (
  assignedRoomId: number | null | undefined,
  authorityRoomId: number | null = 101,
  schedule: OfflineRoomSchedule = managedSchedule,
) => validateOfflineRoomAssignment({
  schedule,
  registration: {
    examination_schedule_id: 10,
    assigned_room_id: assignedRoomId,
  },
  authority: { scheduleId: 10, roomId: authorityRoomId },
});

test('offline room contract accepts the assigned room in the active host session', () => {
  assert.deepEqual(decide(101), { ok: true });
});

test('offline room contract rejects a registration assigned to another room', () => {
  const result = decide(102);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'wrong_room');
    assert.equal(result.recoveryRequired, false);
    assert.equal(result.message, 'You are assigned to Room B. Please connect to your assigned examination room.');
  }
});

test('offline room contract fails closed for a missing assignment', () => {
  const result = decide(null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'assignment_data_unavailable');
    assert.equal(result.recoveryRequired, true);
    assert.match(result.message, /update the examination pack/i);
  }
});

test('offline room contract rejects a registration from another schedule', () => {
  const result = validateOfflineRoomAssignment({
    schedule: managedSchedule,
    registration: { examination_schedule_id: 11, assigned_room_id: 101 },
    authority: { scheduleId: 10, roomId: 101 },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'wrong_schedule');
});

test('student supplied room IDs cannot override the active peer host room', () => {
  const studentSuppliedRoomId = 102;
  assert.equal(studentSuppliedRoomId, 102); // deliberately not passed to the policy
  assert.deepEqual(decide(101, 101), { ok: true });
  const wrongForHost = decide(102, 101);
  assert.equal(wrongForHost.ok, false);
});

test('unmanaged schedules preserve backend behavior without requiring a room', () => {
  const result = decide(null, null, { id: 10, rooms_managed: false, rooms: [] });
  assert.deepEqual(result, { ok: true });
});

test('managed room metadata must belong to the active schedule', () => {
  const result = decide(101, 101, {
    id: 10,
    rooms_managed: true,
    rooms: [{ id: 101, examination_schedule_id: 999, room_name: 'Foreign room' }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'assignment_data_unavailable');
});

test('managed rooms with missing schedule metadata fail closed', () => {
  const result = decide(101, 101, {
    id: 10,
    rooms_managed: true,
    rooms: [{ id: 101, room_name: 'Unverified room' }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'assignment_data_unavailable');
    assert.equal(result.recoveryRequired, true);
  }
});

test('reconnect revalidation rejects an assignment changed in the cached pack', () => {
  assert.deepEqual(decide(101), { ok: true });
  const afterAssignmentChange = decide(102);
  assert.equal(afterAssignmentChange.ok, false);
  if (!afterAssignmentChange.ok) assert.equal(afterAssignmentChange.code, 'wrong_room');
});

test('legacy packs cannot host managed-room admission until refreshed', () => {
  const result = validateOfflineHostRoom({
    schedule: { id: 10, rooms: managedSchedule.rooms },
    authority: { scheduleId: 10, roomId: 101 },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'assignment_data_unavailable');
    assert.match(result.message, /update the examination pack/i);
  }
});

test('REGRESSION-ROOM-001: Single schedule with two rooms (Room 201 and Room 202) room assignment enforcement', () => {
  const singleScheduleWithTwoRooms: OfflineRoomSchedule = {
    id: 101,
    rooms_managed: true,
    rooms: [
      { id: 201, examination_schedule_id: 101, room_name: 'Room 201 - Lab 1' },
      { id: 202, examination_schedule_id: 101, room_name: 'Room 202 - Lab 2' },
    ],
  };

  // 1. Candidate assigned to Room 201 attempting admission into Room 202 -> code: 'wrong_room' (specifically room mismatch, NOT schedule mismatch)
  const wrongRoomAttempt = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: {
      examination_schedule_id: 101,
      assigned_room_id: 201, // Candidate belongs to Room 201
    },
    authority: {
      scheduleId: 101, // Proctor is hosting Schedule 101
      roomId: 202,     // But Proctor is hosting Room 202!
    },
  });
  assert.equal(wrongRoomAttempt.ok, false);
  if (!wrongRoomAttempt.ok) {
    assert.equal(wrongRoomAttempt.code, 'wrong_room');
    assert.equal(wrongRoomAttempt.recoveryRequired, false);
    assert.equal(
      wrongRoomAttempt.message,
      'You are assigned to Room 201 - Lab 1. Please connect to your assigned examination room.',
    );
  }

  // 2. Candidate assigned to Room 201 entering Room 201 -> ok: true
  const correctRoomAttempt = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: {
      examination_schedule_id: 101,
      assigned_room_id: 201,
    },
    authority: {
      scheduleId: 101,
      roomId: 201,
    },
  });
  assert.deepEqual(correctRoomAttempt, { ok: true });

  // 3. Missing assignment (null / undefined) -> assignment_data_unavailable, recoveryRequired: true
  const missingAssignment = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: {
      examination_schedule_id: 101,
      assigned_room_id: null,
    },
    authority: {
      scheduleId: 101,
      roomId: 201,
    },
  });
  assert.equal(missingAssignment.ok, false);
  if (!missingAssignment.ok) {
    assert.equal(missingAssignment.code, 'assignment_data_unavailable');
    assert.equal(missingAssignment.recoveryRequired, true);
    assert.match(missingAssignment.message, /update the examination pack/i);
  }

  // 4. Manipulated room identifiers:
  // - Negative ID
  const negativeRoom = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: {
      examination_schedule_id: 101,
      assigned_room_id: -201 as any,
    },
    authority: {
      scheduleId: 101,
      roomId: 201,
    },
  });
  assert.equal(negativeRoom.ok, false);
  if (!negativeRoom.ok) {
    assert.equal(negativeRoom.code, 'assignment_data_unavailable');
  }

  // - NaN / invalid string
  const nanRoom = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: {
      examination_schedule_id: 101,
      assigned_room_id: NaN as any,
    },
    authority: {
      scheduleId: 101,
      roomId: 201,
    },
  });
  assert.equal(nanRoom.ok, false);
  if (!nanRoom.ok) {
    assert.equal(nanRoom.code, 'assignment_data_unavailable');
  }

  // - Nonexistent room on the schedule
  const nonexistentRoom = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: {
      examination_schedule_id: 101,
      assigned_room_id: 999,
    },
    authority: {
      scheduleId: 101,
      roomId: 201,
    },
  });
  assert.equal(nonexistentRoom.ok, false);
  if (!nonexistentRoom.ok) {
    assert.equal(nonexistentRoom.code, 'assignment_data_unavailable');
  }

  // 5. Reconnection to wrong room after initial successful session
  // Initially candidate entered correct Room 201
  const initialEntry = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: { examination_schedule_id: 101, assigned_room_id: 201 },
    authority: { scheduleId: 101, roomId: 201 },
  });
  assert.deepEqual(initialEntry, { ok: true });

  // On reconnect, candidate connects to Room 202's peer server
  const reconnectWrongRoom = validateOfflineRoomAssignment({
    schedule: singleScheduleWithTwoRooms,
    registration: { examination_schedule_id: 101, assigned_room_id: 201 },
    authority: { scheduleId: 101, roomId: 202 },
  });
  assert.equal(reconnectWrongRoom.ok, false);
  if (!reconnectWrongRoom.ok) {
    assert.equal(reconnectWrongRoom.code, 'wrong_room');
  }
});

