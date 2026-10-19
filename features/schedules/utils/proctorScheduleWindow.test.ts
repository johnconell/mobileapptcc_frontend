import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatManilaDateForSection,
  formatManilaScheduleDate,
  formatScheduleOpeningTime,
  getManilaDateIso,
  getProctorScheduleAvailability,
  splitScheduleDays,
} from './proctorScheduleWindow';

const schedule = {
  date: '2026-10-04',
  startTime: '09:00',
  endTime: '10:00',
};

test('splits schedule dates using Asia/Manila and formats section dates day-first', () => {
  assert.equal(getManilaDateIso(Date.UTC(2026, 9, 3, 16, 30)), '2026-10-04');
  assert.equal(formatManilaDateForSection('2026-10-04'), '04/10/2026');
  assert.equal(formatManilaScheduleDate('2026-10-14', true), 'Wed, 14 Oct 2026');
});

test('allows only today in the early-open through inclusive end window', () => {
  assert.equal(
    getProctorScheduleAvailability(schedule, Date.UTC(2026, 9, 4, 0, 29, 59)),
    'too_early',
  );
  assert.equal(
    getProctorScheduleAvailability(schedule, Date.UTC(2026, 9, 4, 0, 30)),
    'available',
  );
  assert.equal(
    getProctorScheduleAvailability(schedule, Date.UTC(2026, 9, 4, 2, 0)),
    'available',
  );
  assert.equal(
    getProctorScheduleAvailability(schedule, Date.UTC(2026, 9, 4, 2, 0, 1)),
    'ended',
  );
  assert.equal(
    getProctorScheduleAvailability(
      { ...schedule, date: '2026-10-05' },
      Date.UTC(2026, 9, 4, 1),
    ),
    'not_available',
  );
});

test('shows the Manila room-opening time', () => {
  assert.equal(formatScheduleOpeningTime(schedule), '8:30 AM');
});

test('keeps Today, Upcoming, current-month history, and older months in separate ordered groups', () => {
  const groups = new Map([
    ['2026-09-30', ['Sep 30']],
    ['2026-10-13', ['Oct 13']],
    ['2026-10-14', ['Today']],
    ['2026-10-16', ['Oct 16']],
    ['2026-08-31', ['Aug 31']],
    ['2026-10-12', ['Oct 12']],
  ]);

  const split = splitScheduleDays(groups, '2026-10-14');
  assert.deepEqual(split.today, ['Today']);
  assert.deepEqual(split.upcoming.map(([date]) => date), ['2026-10-16']);
  assert.deepEqual(
    split.currentMonthPrevious.map(([date]) => date),
    ['2026-10-13', '2026-10-12'],
  );
  assert.deepEqual(
    split.previousMonths.map(([month]) => month),
    ['2026-09', '2026-08'],
  );
  assert.deepEqual(
    split.previousMonths[0][1].map(([date]) => date),
    ['2026-09-30'],
  );
});
