const EXAM_TIME_ZONE = 'Asia/Manila';

export type PasskeyScheduleWindow = {
  exam_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  time_slot?: string | null;
};

export type PasskeyScheduleWindowState = 'valid' | 'not_started' | 'expired' | 'invalid';

type ScheduleBounds = { date: string; startTime: string; endTime: string; start: number; end: number };

function normalizeTime(value: string | null | undefined, fallback: string): string | null {
  const time = String(value || '').trim();
  if (!time) return fallback;
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}:${String(seconds).padStart(2, '0')}`;
}

function resolveBounds(schedule: PasskeyScheduleWindow): ScheduleBounds | null {
  const date = String(schedule.exam_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  let startValue = schedule.start_time;
  let endValue = schedule.end_time;
  if ((!startValue || !endValue) && schedule.time_slot) {
    const parts = String(schedule.time_slot).split(/\s*[-–—]\s*/);
    if (parts.length === 2) {
      startValue ||= parts[0];
      endValue ||= parts[1];
    }
  }

  const startTime = normalizeTime(startValue, '00:00:00');
  const endTime = normalizeTime(endValue, '23:59:59');
  if (!startTime || !endTime) return null;

  const start = Date.parse(`${date}T${startTime}+08:00`);
  const end = Date.parse(`${date}T${endTime}+08:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { date, startTime, endTime, start, end };
}

export function getPasskeyScheduleWindowState(
  schedule: PasskeyScheduleWindow,
  now: number = Date.now(),
): PasskeyScheduleWindowState {
  const bounds = resolveBounds(schedule);
  if (!bounds) return 'invalid';
  if (now < bounds.start) return 'not_started';
  if (now >= bounds.end) return 'expired';
  return 'valid';
}

function formatTime(time: string): { clock: string; period: string } {
  const [rawHours, minutes] = time.split(':').map(Number);
  const period = rawHours < 12 ? 'AM' : 'PM';
  const hours = rawHours % 12 || 12;
  return { clock: `${hours}:${String(minutes).padStart(2, '0')}`, period };
}

export function formatPasskeyScheduleWindow(schedule: PasskeyScheduleWindow): string | null {
  const bounds = resolveBounds(schedule);
  if (!bounds) return null;

  const date = new Date(`${bounds.date}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const start = formatTime(bounds.startTime);
  const end = formatTime(bounds.endTime);
  const startLabel = start.period === end.period ? start.clock : `${start.clock} ${start.period}`;
  return `${date}, ${startLabel}-${end.clock} ${end.period}`;
}

export function passkeyScheduleWindowMessage(
  schedule: PasskeyScheduleWindow,
  state: Exclude<PasskeyScheduleWindowState, 'valid'>,
): string {
  const label = formatPasskeyScheduleWindow(schedule);
  if (!label) return 'This examination key has no valid schedule window.';
  if (state === 'not_started') {
    return `This examination key is not active yet. This key is for ${label}.`;
  }
  return `This examination key has expired. This key is for ${label}.`;
}