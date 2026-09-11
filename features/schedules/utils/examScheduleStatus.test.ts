import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveExamSlotStatus,
  extractNumericScheduleId,
  matchOpenedRoom,
  summarizeScheduleStatus,
} from './examScheduleStatus';

describe('exam schedule status', () => {
  it('does not mark unopened rooms ended just because the clock passed', () => {
    assert.equal(
      deriveExamSlotStatus({
        dateIso: '2026-09-10',
        startTime: '08:00 AM',
        endTime: '10:00 AM',
        now: new Date(2026, 8, 10, 16, 0, 0),
      }),
      'not_opened',
    );
  });

  it('does not mark unopened rooms as lobby-open during the scheduled window', () => {
    assert.equal(
      deriveExamSlotStatus({
        dateIso: '2026-09-10',
        startTime: '08:00 AM',
        endTime: '10:00 AM',
        now: new Date(2026, 8, 10, 8, 30, 0),
      }),
      'not_opened',
    );
  });

  it('uses the proctor room state only', () => {
    assert.equal(deriveExamSlotStatus({ openedStatus: 'lobby_open' }), 'open');
    assert.equal(deriveExamSlotStatus({ openedStatus: 'in_progress' }), 'in_progress');
    assert.equal(deriveExamSlotStatus({ openedStatus: 'ended' }), 'ended');
  });

  it('does not treat a date-grouped schedule key as a numeric id', () => {
    assert.equal(extractNumericScheduleId(undefined, 'date-2026-09-10-Entrance-Examination'), null);
    assert.equal(extractNumericScheduleId('offline-42-r3'), 42);
    assert.equal(extractNumericScheduleId('18'), 18);
  });

  it('matches only the opened room for that session', () => {
    const opened = {
      '18:1': { status: 'ended' as const },
      '19:1': { status: 'lobby_open' as const },
    };
    assert.equal(matchOpenedRoom(opened, { id: '18', scheduleId: 'date-2026-09-10-X' })?.status, 'ended');
    assert.equal(matchOpenedRoom(opened, { id: '19', scheduleId: 'date-2026-09-10-X' })?.status, 'lobby_open');
    assert.equal(matchOpenedRoom(opened, { id: '20', scheduleId: 'date-2026-09-10-X' }), null);
  });

  it('summarizes a schedule as not opened when any slot can still be opened', () => {
    assert.equal(summarizeScheduleStatus(['ended', 'not_opened']), 'not_opened');
    assert.equal(summarizeScheduleStatus(['ended', 'ended']), 'ended');
    assert.equal(summarizeScheduleStatus(['not_opened', 'open']), 'open');
  });
});
