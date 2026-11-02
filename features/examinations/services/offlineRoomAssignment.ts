export type OfflineRoomAuthority = {
  scheduleId: number;
  roomId: number | null;
};

export type OfflineRoomSchedule = {
  id: number;
  rooms_managed?: boolean;
  rooms?: Array<{
    id: number;
    examination_schedule_id?: number;
    room_name?: string;
  }>;
};

export type OfflineRoomRegistration = {
  examination_schedule_id: number;
  assigned_room_id?: number | null;
};

export type OfflineRoomDecision =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'wrong_schedule'
        | 'wrong_room'
        | 'assignment_data_unavailable';
      message: string;
      recoveryRequired: boolean;
    };

const RECOVERY_MESSAGE =
  'Room assignment data is missing or outdated on the proctor phone. Ask the proctor to connect to the internet, update the examination pack, and reopen this room.';

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Mirrors Laravel ExamSessionService::assertAssignedRoom for an offline pack.
 * The authority must come from the active peer host session, never student input.
 */
export function validateOfflineRoomAssignment(input: {
  schedule: OfflineRoomSchedule | undefined;
  registration: OfflineRoomRegistration;
  authority: OfflineRoomAuthority;
}): OfflineRoomDecision {
  const { schedule, registration, authority } = input;
  const scheduleId = positiveInteger(authority.scheduleId);
  if (!scheduleId || !schedule || Number(schedule.id) !== scheduleId) {
    return {
      ok: false,
      code: 'wrong_schedule',
      message: 'This examination key is not valid for the examination open in this room.',
      recoveryRequired: false,
    };
  }
  if (Number(registration.examination_schedule_id) !== scheduleId) {
    return {
      ok: false,
      code: 'wrong_schedule',
      message: 'This examination key is not valid for the examination open in this room.',
      recoveryRequired: false,
    };
  }

  // The backend always exports this boolean. Undefined means a legacy or
  // incomplete pack; allowing it would silently bypass a possibly managed room.
  if (typeof schedule.rooms_managed !== 'boolean') {
    return {
      ok: false,
      code: 'assignment_data_unavailable',
      message: RECOVERY_MESSAGE,
      recoveryRequired: true,
    };
  }
  if (schedule.rooms_managed === false) return { ok: true };

  const targetRoomId = positiveInteger(authority.roomId);
  const assignedRoomId = positiveInteger(registration.assigned_room_id);
  if (!targetRoomId || !assignedRoomId || !Array.isArray(schedule.rooms)) {
    return {
      ok: false,
      code: 'assignment_data_unavailable',
      message: RECOVERY_MESSAGE,
      recoveryRequired: true,
    };
  }

  const roomBelongsToSchedule = (room: NonNullable<OfflineRoomSchedule['rooms']>[number]) =>
    Number(room.id) > 0 &&
    Number(room.examination_schedule_id) === scheduleId;
  const targetRoom = schedule.rooms.find(
    (room) => Number(room.id) === targetRoomId && roomBelongsToSchedule(room),
  );
  const assignedRoom = schedule.rooms.find(
    (room) => Number(room.id) === assignedRoomId && roomBelongsToSchedule(room),
  );
  if (!targetRoom || !assignedRoom) {
    return {
      ok: false,
      code: 'assignment_data_unavailable',
      message: RECOVERY_MESSAGE,
      recoveryRequired: true,
    };
  }
  if (assignedRoomId !== targetRoomId) {
    return {
      ok: false,
      code: 'wrong_room',
      message:
        'Your room assignment does not match the examination room currently open. Ask the proctor for assistance.',
      recoveryRequired: false,
    };
  }
  return { ok: true };
}

export function validateOfflineHostRoom(input: {
  schedule: OfflineRoomSchedule | undefined;
  authority: OfflineRoomAuthority;
}): OfflineRoomDecision {
  const { schedule, authority } = input;
  const scheduleId = positiveInteger(authority.scheduleId);
  if (!scheduleId || !schedule || Number(schedule.id) !== scheduleId) {
    return {
      ok: false,
      code: 'wrong_schedule',
      message: 'The selected examination schedule is not available in this offline pack.',
      recoveryRequired: false,
    };
  }
  if (typeof schedule.rooms_managed !== 'boolean') {
    return { ok: false, code: 'assignment_data_unavailable', message: RECOVERY_MESSAGE, recoveryRequired: true };
  }
  if (!schedule.rooms_managed) return { ok: true };
  const roomId = positiveInteger(authority.roomId);
  const room = roomId == null
    ? undefined
    : schedule.rooms?.find(
        (candidate) =>
          Number(candidate.id) === roomId &&
          Number(candidate.examination_schedule_id) === scheduleId,
      );
  return room
    ? { ok: true }
    : { ok: false, code: 'assignment_data_unavailable', message: RECOVERY_MESSAGE, recoveryRequired: true };
}

