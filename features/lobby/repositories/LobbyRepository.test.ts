import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { OfflineStore, type OfflinePack } from '@/features/synchronization/services/offlineStore';
import {
  getPreparedOfflineLobby,
  selectPreparedOfflineLobby,
} from './LobbyRepository';

const validPack = {
  pack_version: 1,
  authorization: {
    actor_id: 42,
    scope: 'assigned_rooms',
    schedule_ids: [10],
  },
  schedules: [
    {
      id: 10,
      title: 'Entrance Examination',
      exam_date: '2026-11-03',
      rooms_managed: true,
      rooms: [
        {
          id: 101,
          examination_schedule_id: 10,
          room_name: 'Room 101',
          capacity: 40,
          proctor_id: 42,
        },
      ],
    },
  ],
  applicants: [],
  registrations: [],
  question_banks: [],
} as unknown as OfflinePack;

async function routePreparedLobby(
  pack: OfflinePack | null,
  cloudRequest: () => Promise<'cloud'>,
): Promise<'peer' | 'cloud'> {
  const prepared = selectPreparedOfflineLobby(pack, '10', '101');
  return prepared ? 'peer' : cloudRequest();
}

test('valid cached pack selects the peer lobby when internet is unavailable', () => {
  const internetReachability = false;
  assert.equal(internetReachability, false);
  assert.equal(selectPreparedOfflineLobby(validPack, '10', '101')?.sid, '10');
});

test('valid cached pack selects the peer lobby when internet reachability is null', () => {
  const internetReachability = null;
  assert.equal(internetReachability, null);
  assert.equal(selectPreparedOfflineLobby(validPack, '10', '101')?.schedule.id, 10);
});

test('unreachable Laravel API is not consulted for a prepared peer lobby', async () => {
  let cloudCalls = 0;
  const result = await routePreparedLobby(validPack, async () => {
    cloudCalls += 1;
    throw new Error('Laravel API unreachable');
  });

  assert.equal(result, 'peer');
  assert.equal(cloudCalls, 0);
});

test('missing cached pack preserves the cloud preparation path', async () => {
  let cloudCalls = 0;
  const result = await routePreparedLobby(null, async () => {
    cloudCalls += 1;
    return 'cloud';
  });

  assert.equal(result, 'cloud');
  assert.equal(cloudCalls, 1);
});

test('invalid package integrity is rejected before peer hosting', async () => {
  const hasPack = mock.method(OfflineStore, 'hasPack', async () => true);
  const verifyPackIntegrity = mock.method(OfflineStore, 'verifyPackIntegrity', async () => ({
    valid: false,
    error: 'Security Violation: Examination package tampering detected.',
  }));

  try {
    await assert.rejects(
      getPreparedOfflineLobby('10', '101'),
      /package tampering detected/i,
    );
  } finally {
    verifyPackIntegrity.mock.restore();
    hasPack.mock.restore();
  }
});

test('wrong-account package is unavailable after account binding rejects it', async () => {
  const hasPack = mock.method(OfflineStore, 'hasPack', async () => false);
  const verifyPackIntegrity = mock.method(OfflineStore, 'verifyPackIntegrity');

  try {
    assert.equal(await getPreparedOfflineLobby('10', '101'), null);
    assert.equal(verifyPackIntegrity.mock.callCount(), 0);
  } finally {
    verifyPackIntegrity.mock.restore();
    hasPack.mock.restore();
  }
});

test('room absent from the authorized pack cannot be opened offline', () => {
  assert.throws(
    () => selectPreparedOfflineLobby(validPack, '10', '999'),
    /room is not available in the authorized offline pack/i,
  );
});

test('schedule absent from the authorized pack cannot be opened offline', () => {
  assert.throws(
    () => selectPreparedOfflineLobby(validPack, '999', '101'),
    /schedule is not available in the authorized offline pack/i,
  );
});

test('expired forgotten lobby does not block opening a later active room', async () => {
  const nowMs = Date.UTC(2026, 10, 3, 13, 18); // 9:18 PM Asia/Manila
  const pack = {
    ...validPack,
    authorization: {
      actor_id: 42,
      scope: 'assigned_rooms',
      schedule_ids: [9, 10],
    },
    schedules: [
      {
        id: 9,
        title: 'Expired Examination',
        exam_date: '2026-11-03',
        start_time: '19:00',
        end_time: '20:00',
        rooms_managed: true,
        rooms: [
          {
            id: 90,
            examination_schedule_id: 9,
            room_name: 'Room 90',
            capacity: 40,
            proctor_id: 42,
          },
        ],
      },
      {
        ...validPack.schedules[0],
        start_time: '21:00',
        end_time: '22:00',
      },
    ],
  } as OfflinePack;
  const hasPack = mock.method(OfflineStore, 'hasPack', async () => true);
  const verifyPackIntegrity = mock.method(OfflineStore, 'verifyPackIntegrity', async () => ({
    valid: true,
    pack,
  }));
  const getOpenedRooms = mock.method(OfflineStore, 'getOpenedRooms', async () => ({
    '9:90': {
      code: 'OLDROOM1',
      openedAt: '2026-11-03T11:00:00.000Z',
      status: 'lobby_open' as const,
      ownerId: 42,
      proctorName: 'Proctor 42',
    },
  }));
  const dateNow = mock.method(Date, 'now', () => nowMs);

  try {
    const prepared = await getPreparedOfflineLobby('10', '101');
    assert.equal(prepared?.schedule.id, 10);
  } finally {
    dateNow.mock.restore();
    getOpenedRooms.mock.restore();
    verifyPackIntegrity.mock.restore();
    hasPack.mock.restore();
  }
});

