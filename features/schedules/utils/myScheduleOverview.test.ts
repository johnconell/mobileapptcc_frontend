import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScheduleEntry } from '@/features/schedules/components/ProctorScheduleRow';
import {
  buildOfficialDays,
  hasRoomChange,
  schedulePeriod,
  sortScheduleEntries,
  summarizeAssignments,
} from './myScheduleOverview';

function entry(date: string, startTime: string, room: string, id: string): ScheduleEntry {
  return {
    schedule: {
      id: `date-${date}`,
      name: 'Entrance Examination',
      schoolYear: '2026-2027',
      examinationDate: date,
      examinationDateIso: date,
      batchCount: 1,
    },
    session: {
      id,
      scheduleId: `date-${date}`,
      timeLabel: `${startTime} - 10:00 AM`,
      startTime,
      endTime: '10:00 AM',
      venue: room,
      roomName: room,
      batchNumber: `Batch ${id}`,
      registeredStudents: 20,
      durationMinutes: 60,
      totalQuestions: 100,
    },
  };
}

test('keeps every official day, including nonconsecutive unassigned days and more than five days', () => {
  const days = [1, 2, 4, 7, 9, 12, 15].map((day, index) => ({
    date: `2026-11-${String(day).padStart(2, '0')}`,
    dayLabel: `Day ${index + 1}`,
  }));
  const entries = [entry(days[0].date, '9:00 AM', 'Room 105', '1')];
  assert.deepEqual(buildOfficialDays(days, entries), days);
  assert.deepEqual(summarizeAssignments(days, entries), {
    totalDays: 7,
    assignedDays: 1,
    assignedBatches: 1,
    uniqueRooms: 1,
  });
});

test('sorts batches chronologically, groups noon correctly, and flags every consecutive room change', () => {
  const entries = [
    entry('2026-11-02', '2:30 PM', 'Room 106', '4'),
    entry('2026-11-02', '9:00 AM', 'Room 105', '1'),
    entry('2026-11-02', '1:00 PM', 'Room 106', '3'),
    entry('2026-11-02', '10:30 AM', 'Room 105', '2'),
    entry('2026-11-02', '4:00 PM', 'Room 107', '5'),
  ];
  const sorted = sortScheduleEntries(entries);
  assert.deepEqual(sorted.map((item) => item.session.id), ['1', '2', '3', '4', '5']);
  assert.equal(schedulePeriod(sorted[1]), 'Morning');
  assert.equal(schedulePeriod(sorted[2]), 'Afternoon');
  assert.deepEqual(sorted.map((item, index) => hasRoomChange(sorted[index - 1], item)), [false, false, true, false, true]);
});

test('adds a dedicated reschedule date only when it exists in the assigned entries', () => {
  const regular = entry('2026-11-02', '9:00 AM', 'Room 105', '1');
  const reschedule = entry('2026-11-20', '1:00 PM', 'Room 108', 'R');
  reschedule.session.sessionType = 'rescheduled';
  const withoutReschedule = buildOfficialDays([{ date: '2026-11-02', dayLabel: 'Day 1' }], [regular]);
  const withReschedule = buildOfficialDays([{ date: '2026-11-02', dayLabel: 'Day 1' }], [regular, reschedule]);
  assert.equal(withoutReschedule.some((day) => day.date === '2026-11-20'), false);
  assert.equal(withReschedule.some((day) => day.date === '2026-11-20'), true);
});
