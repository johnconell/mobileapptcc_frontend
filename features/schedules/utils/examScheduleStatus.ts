export type ExamSlotVisualStatus = 'not_opened' | 'open' | 'in_progress' | 'ended';

export type OpenedRoomStatus = 'lobby_open' | 'in_progress' | 'ended';

export type ExamWindowHint = 'upcoming' | 'today' | 'window_passed' | null;

export const EXAM_STATUS_LABELS: Record<ExamSlotVisualStatus, string> = {
  not_opened: 'Not opened',
  open: 'Lobby open',
  in_progress: 'In progress',
  ended: 'Ended',
};

export const EXAM_STATUS_HINTS: Record<ExamSlotVisualStatus, string> = {
  not_opened: 'Tap to open this room',
  open: 'Students can join the lobby',
  in_progress: 'Examination is running',
  ended: 'Finished — view results',
};

function parseClock(time: string): { hours: number; minutes: number } | null {
  const raw = String(time || '').trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function parseDateParts(dateIso: string): { year: number; month: number; day: number } | null {
  const raw = String(dateIso || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth(),
    day: parsed.getDate(),
  };
}

export function combineExamDateTime(dateIso: string, time: string): Date | null {
  const date = parseDateParts(dateIso);
  const clock = parseClock(time);
  if (!date || !clock) return null;
  return new Date(date.year, date.month, date.day, clock.hours, clock.minutes, 0, 0);
}

export function timesFromLabel(timeLabel?: string): { start: string; end: string } {
  const parts = String(timeLabel || '').split(/\s*[-–—]\s*/);
  return {
    start: parts[0]?.trim() || '',
    end: parts[1]?.trim() || '',
  };
}

/**
 * Visual status comes only from what this proctor actually did.
 * A scheduled time that has passed is NOT "ended" if the room was never opened.
 */
export function deriveExamSlotStatus(input: {
  dateIso?: string;
  startTime?: string;
  endTime?: string;
  timeLabel?: string;
  openedStatus?: OpenedRoomStatus | string | null;
  now?: Date;
}): ExamSlotVisualStatus {
  if (input.openedStatus === 'ended') return 'ended';
  if (input.openedStatus === 'in_progress') return 'in_progress';
  if (input.openedStatus === 'lobby_open') return 'open';
  return 'not_opened';
}

export function summarizeScheduleStatus(
  statuses: ExamSlotVisualStatus[],
): ExamSlotVisualStatus {
  if (!statuses.length) return 'not_opened';
  if (statuses.some((status) => status === 'in_progress')) return 'in_progress';
  if (statuses.some((status) => status === 'open')) return 'open';
  if (statuses.every((status) => status === 'ended')) return 'ended';
  return 'not_opened';
}

/** Numeric backend schedule id. Never treat date-2026-09-10-... group keys as an id. */
export function extractNumericScheduleId(
  sessionId?: string,
  scheduleGroupId?: string,
): number | null {
  const stripped = String(sessionId || '')
    .trim()
    .replace(/^offline-/, '');
  const sessionMatch = stripped.match(/^(\d+)(?:-r\d+)?$/i);
  if (sessionMatch) {
    const value = Number(sessionMatch[1]);
    return value > 0 ? value : null;
  }

  const group = String(scheduleGroupId || '').trim();
  if (/^\d+$/.test(group)) {
    const value = Number(group);
    return value > 0 ? value : null;
  }
  return null;
}

export function extractRoomId(session: {
  id?: string;
  roomId?: string | null;
}): number | null {
  if (session.roomId != null && String(session.roomId).trim() !== '') {
    const value = Number(session.roomId);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const match = String(session.id || '').match(/-r(\d+)$/i);
  return match ? Number(match[1]) : null;
}

export function matchOpenedRoom<T extends { status?: string }>(
  openedRooms: Record<string, T> | undefined,
  session: { id: string; scheduleId?: string; roomId?: string | null },
): T | null {
  if (!openedRooms) return null;

  const scheduleId = extractNumericScheduleId(session.id, session.scheduleId);
  const roomId = extractRoomId(session);
  if (scheduleId && roomId) {
    const exact = openedRooms[`${scheduleId}:${roomId}`];
    if (exact) return exact;
    return null;
  }

  if (!scheduleId) return null;

  const matches = Object.entries(openedRooms).filter(([key]) => {
    const [sid] = key.split(':');
    return Number(sid) === scheduleId;
  });
  return matches.length === 1 ? matches[0][1] : null;
}

export function examWindowHint(input: {
  dateIso?: string;
  startTime?: string;
  endTime?: string;
  timeLabel?: string;
  now?: Date;
}): ExamWindowHint {
  const date = parseDateParts(input.dateIso || '');
  if (!date) return null;

  const now = input.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const examDay = new Date(date.year, date.month, date.day);
  if (examDay.getTime() > today.getTime()) return 'upcoming';
  if (examDay.getTime() < today.getTime()) return 'window_passed';

  const fromLabel = timesFromLabel(input.timeLabel);
  const endAt = combineExamDateTime(
    input.dateIso || '',
    input.endTime || fromLabel.end,
  );
  if (endAt && now.getTime() >= endAt.getTime()) return 'window_passed';
  return 'today';
}

export function examWindowHintLabel(hint: ExamWindowHint): string | null {
  if (hint === 'upcoming') return 'Upcoming';
  if (hint === 'today') return 'Today';
  if (hint === 'window_passed') return 'Scheduled time passed';
  return null;
}
