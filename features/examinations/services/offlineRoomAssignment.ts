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
    proctor_id?: number | null;
  }>;
};

export type OfflinePackAuthorization = {
  actor_id: number | null;
  scope: 'assigned_rooms' | 'administrator';
  schedule_ids: number[];
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
        | 'assignment_data_unavailable'
        | 'unauthorized_proctor'
        | 'online_claim_required'
        | 'active_room_conflict';
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
      message:
        'You are not scheduled for this examination session. Please check your assigned examination date and time.',
      recoveryRequired: false,
    };
  }
  if (Number(registration.examination_schedule_id) !== scheduleId) {
    return {
      ok: false,
      code: 'wrong_schedule',
      message:
        'You are not scheduled for this examination session. Please check your assigned examination date and time.',
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
    const roomName = assignedRoom.room_name?.trim() || `Room ${assignedRoomId}`;
    return {
      ok: false,
      code: 'wrong_room',
      message: `You are assigned to ${roomName}. Please connect to your assigned examination room.`,
      recoveryRequired: false,
    };
  }
  return { ok: true };
}

export function validateOfflineProctorRoom(input: {
  authorization: OfflinePackAuthorization | undefined;
  schedule: OfflineRoomSchedule | undefined;
  authority: OfflineRoomAuthority;
  locallyClaimed?: boolean;
  hasOtherActiveRoom?: boolean;
  claimConfirmed?: boolean;
}): OfflineRoomDecision {
  const { authorization, schedule, authority } = input;
  const hostRoom = validateOfflineHostRoom({ schedule, authority });
  if (!hostRoom.ok) return hostRoom;

  const actorId = positiveInteger(authorization?.actor_id);
  const scheduleId = positiveInteger(authority.scheduleId);
  if (
    !actorId ||
    !scheduleId ||
    !authorization ||
    !authorization.schedule_ids.some((id) => Number(id) === scheduleId)
  ) {
    return {
      ok: false,
      code: 'assignment_data_unavailable',
      message:
        'Room authorization is missing or does not belong to the signed-in proctor. Update the examination pack while signed in to the correct account.',
      recoveryRequired: true,
    };
  }

  const roomId = positiveInteger(authority.roomId);
  const room = schedule?.rooms?.find((candidate) => Number(candidate.id) === roomId);
  if (!room || !Object.prototype.hasOwnProperty.call(room, 'proctor_id')) {
    return {
      ok: false,
      code: 'assignment_data_unavailable',
      message: RECOVERY_MESSAGE,
      recoveryRequired: true,
    };
  }

  if (authorization.scope === 'administrator') return { ok: true };

  const assignedProctorId = positiveInteger(room.proctor_id);
  if (assignedProctorId && assignedProctorId !== actorId) {
    return {
      ok: false,
      code: 'unauthorized_proctor',
      message:
        'This room is assigned to another proctor. Please select your assigned room or an available unassigned room.',
      recoveryRequired: false,
    };
  }
  if (assignedProctorId === actorId) {
    if (input.hasOtherActiveRoom) {
      return {
        ok: false,
        code: 'active_room_conflict',
        message: 'You already manage another active examination room. Close it before opening this room.',
        recoveryRequired: false,
      };
    }
    return { ok: true };
  }

  if (input.locallyClaimed) return { ok: true };

  const hasAssignedDuty = schedule?.rooms?.some(
    (candidate) => positiveInteger(candidate.proctor_id) === actorId,
  );
  if (hasAssignedDuty || input.hasOtherActiveRoom) {
    return {
      ok: false,
      code: 'active_room_conflict',
      message: hasAssignedDuty
        ? 'You already have an assigned room for this examination schedule. Please open your assigned room.'
        : 'You already manage another active examination room. Close it before claiming this room.',
      recoveryRequired: false,
    };
  }

  if (input.claimConfirmed) return { ok: true };

  return {
    ok: false,
    code: 'online_claim_required',
    message:
      'This room is unassigned. Please confirm the room claim before opening the examination room.',
    recoveryRequired: false,
  };
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

