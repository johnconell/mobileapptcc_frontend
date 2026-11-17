import type { ScheduleEntry } from '@/features/schedules/components/ProctorScheduleRow';
import type { OfficialExaminationDay } from '@/features/schedules/repositories/ScheduleRepository';

export type SchedulePeriod = 'Morning' | 'Afternoon';

function startMinutes(entry: ScheduleEntry): number {
  const raw = entry.session.startTime || entry.session.timeLabel.split(/[–—-]/)[0] || '';
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export function entryDate(entry: ScheduleEntry): string {
  return String(entry.schedule.examinationDateIso || entry.schedule.examinationDate).slice(0, 10);
}

export function sortScheduleEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  return [...entries].sort((a, b) => startMinutes(a) - startMinutes(b));
}

export function schedulePeriod(entry: ScheduleEntry): SchedulePeriod {
  return startMinutes(entry) < 12 * 60 ? 'Morning' : 'Afternoon';
}

export function roomName(entry: ScheduleEntry): string {
  return String(entry.session.roomName || entry.session.venue || '').trim();
}

export function hasRoomChange(previous: ScheduleEntry | undefined, current: ScheduleEntry): boolean {
  if (!previous) return false;
  const before = roomName(previous).toLocaleLowerCase();
  const after = roomName(current).toLocaleLowerCase();
  return Boolean(before && after && before !== after);
}

export function buildOfficialDays(
  officialDays: OfficialExaminationDay[],
  entries: ScheduleEntry[],
): OfficialExaminationDay[] {
  const byDate = new Map<string, OfficialExaminationDay>();
  officialDays.forEach((day) => byDate.set(day.date, day));
  entries.forEach((entry) => {
    const date = entryDate(entry);
    if (!date || byDate.has(date)) return;
    byDate.set(date, { date, dayLabel: entry.schedule.dayLabel || '' });
  });
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day, index) => ({ ...day, dayLabel: day.dayLabel || `Day ${index + 1}` }));
}

export function summarizeAssignments(days: OfficialExaminationDay[], entries: ScheduleEntry[]) {
  const assignedDays = new Set(entries.map(entryDate).filter(Boolean));
  const rooms = new Set(entries.map(roomName).filter(Boolean).map((room) => room.toLocaleLowerCase()));
  return {
    totalDays: days.length,
    assignedDays: assignedDays.size,
    assignedBatches: entries.length,
    uniqueRooms: rooms.size,
  };
}
