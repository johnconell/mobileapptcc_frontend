import { JOIN_EARLY_MINUTES } from '@/shared/constants';

export type ProctorScheduleAvailability =
  | 'checking'
  | 'not_available'
  | 'too_early'
  | 'available'
  | 'ended'
  | 'invalid';

export type ScheduleDayGroup<T> = [date: string, entries: T[]];

type ScheduleTimeInput = {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timeLabel?: string | null;
};

type OpenedRoomSchedule = {
  id: number;
  exam_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  time_slot?: string | null;
};

function parseTime(value?: string | null): { hours: number; minutes: number } | null {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function getScheduleStartEpoch(input: ScheduleTimeInput): number | null {
  const times = getScheduleTimes(input);
  if (!times || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  const start = Date.parse(
    `${input.date}T${String(times.start.hours).padStart(2, '0')}:${String(times.start.minutes).padStart(2, '0')}:00+08:00`,
  );
  return Number.isFinite(start) ? start : null;
}

export function getScheduleTimelinePhase(
  input: ScheduleTimeInput,
  nowMs: number,
): 'active' | 'upcoming' | 'completed' | 'invalid' {
  const times = getScheduleTimes(input);
  const start = getScheduleStartEpoch(input);
  if (!times || start === null) return 'invalid';
  const end = Date.parse(
    `${input.date}T${String(times.end.hours).padStart(2, '0')}:${String(times.end.minutes).padStart(2, '0')}:00+08:00`,
  );
  if (!Number.isFinite(end) || end <= start) return 'invalid';
  if (nowMs < start) return 'upcoming';
  if (nowMs > end) return 'completed';
  return 'active';
}

export function compareScheduleTimeline(
  a: ScheduleTimeInput,
  b: ScheduleTimeInput,
  nowMs: number,
): number {
  const phaseOrder = { active: 0, upcoming: 1, completed: 2, invalid: 3 };
  const phaseA = getScheduleTimelinePhase(a, nowMs);
  const phaseB = getScheduleTimelinePhase(b, nowMs);
  const phaseDifference = phaseOrder[phaseA] - phaseOrder[phaseB];
  if (phaseDifference !== 0) return phaseDifference;

  const startA = getScheduleStartEpoch(a) ?? 0;
  const startB = getScheduleStartEpoch(b) ?? 0;
  return phaseA === 'completed' ? startB - startA : startA - startB;
}

function getScheduleTimes(input: ScheduleTimeInput) {
  let start = parseTime(input.startTime);
  let end = parseTime(input.endTime);
  if (!start || !end) {
    const parts = String(input.timeLabel || '').split(/\s*[-–—]\s*/);
    start ??= parseTime(parts[0]);
    end ??= parseTime(parts[1]);
  }
  return start && end ? { start, end } : null;
}

export function getManilaDateIso(epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(epochMs);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatManilaDateForSection(dateIso: string): string {
  const match = String(dateIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : dateIso;
}

export function formatManilaScheduleDate(dateIso: string, includeWeekday = false): string {
  const match = String(dateIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateIso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    ...(includeWeekday ? { weekday: 'short' as const } : {}),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatManilaMonth(dateIso: string): string {
  const match = String(dateIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateIso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12)));
}

export function splitScheduleDays<T>(
  groups: Map<string, T[]>,
  todayIso: string,
): {
  today: T[];
  upcoming: ScheduleDayGroup<T>[];
  currentMonthPrevious: ScheduleDayGroup<T>[];
  previousMonths: [month: string, days: ScheduleDayGroup<T>[]][];
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) {
    return { today: [], upcoming: [], currentMonthPrevious: [], previousMonths: [] };
  }

  const allDays = [...groups.entries()] as ScheduleDayGroup<T>[];
  const upcoming = allDays
    .filter(([date]) => date > todayIso)
    .sort(([a], [b]) => a.localeCompare(b));
  const previous = allDays
    .filter(([date]) => date < todayIso)
    .sort(([a], [b]) => b.localeCompare(a));
  const currentMonth = todayIso.slice(0, 7);
  const olderMonths = new Map<string, ScheduleDayGroup<T>[]>();
  for (const day of previous) {
    if (day[0].slice(0, 7) === currentMonth) continue;
    const month = day[0].slice(0, 7);
    const days = olderMonths.get(month) ?? [];
    days.push(day);
    olderMonths.set(month, days);
  }

  return {
    today: groups.get(todayIso) ?? [],
    upcoming,
    currentMonthPrevious: previous.filter(([date]) => date.slice(0, 7) === currentMonth),
    previousMonths: [...olderMonths.entries()].sort(([a], [b]) => b.localeCompare(a)),
  };
}

export function formatScheduleOpeningTime(input: ScheduleTimeInput): string | null {
  const times = getScheduleTimes(input);
  if (!times || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;

  const opensAt = Date.parse(
    `${input.date}T${String(times.start.hours).padStart(2, '0')}:${String(times.start.minutes).padStart(2, '0')}:00+08:00`,
  ) - JOIN_EARLY_MINUTES * 60_000;
  if (!Number.isFinite(opensAt)) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(opensAt);
}

export function getProctorScheduleAvailability(
  input: ScheduleTimeInput,
  nowMs: number | null,
  todayIso?: string | null,
): ProctorScheduleAvailability {
  if (nowMs === null) return 'checking';
  const scheduleDate = String(input.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) return 'invalid';
  const today = todayIso || getManilaDateIso(nowMs);
  if (scheduleDate < today) return 'ended';
  if (scheduleDate > today) return 'not_available';

  const times = getScheduleTimes(input);
  if (!times) return 'invalid';
  const start = Date.parse(
    `${scheduleDate}T${String(times.start.hours).padStart(2, '0')}:${String(times.start.minutes).padStart(2, '0')}:00+08:00`,
  );
  const end = Date.parse(
    `${scheduleDate}T${String(times.end.hours).padStart(2, '0')}:${String(times.end.minutes).padStart(2, '0')}:00+08:00`,
  );
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'invalid';
  if (nowMs < start - JOIN_EARLY_MINUTES * 60_000) return 'too_early';
  if (nowMs > end) return 'ended';
  return 'available';
}

/**
 * A persisted room claim is active only while its examination window is still
 * open. This prevents a forgotten lobby from an expired schedule from locking
 * the proctor out of every later room on the device.
 */
export function isPersistedOpenedRoomActive(
  schedules: readonly OpenedRoomSchedule[],
  roomKey: string,
  status: string | null | undefined,
  nowMs: number,
): boolean {
  if (status !== 'lobby_open' && status !== 'in_progress') return false;

  const scheduleId = Number(String(roomKey).split(':', 1)[0]);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) return false;
  const schedule = schedules.find((candidate) => Number(candidate.id) === scheduleId);
  if (!schedule) return false;

  return getProctorScheduleAvailability(
    {
      date: schedule.exam_date || '',
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      timeLabel: schedule.time_slot,
    },
    nowMs,
  ) === 'available';
}
