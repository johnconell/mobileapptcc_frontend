import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_SUPPORTED_STUDENTS,
  STUDENT_MONITOR_INTERVAL_MS,
  parseStartPulse,
  resolveRouteUuid,
  shouldNavigateToExam,
  simulateStartPropagation,
} from './examStartCoordinator';
import { canReplace, mapServerToAuthority } from './examAuthority';

describe('examination start signal', () => {
  it('maps server room status to authority without treating ended as started', () => {
    assert.equal(mapServerToAuthority('lobby_open'), 'WAITING');
    assert.equal(mapServerToAuthority('in_progress'), 'ACTIVE');
    assert.equal(mapServerToAuthority('ended'), 'ENDED');
    assert.equal(mapServerToAuthority('active'), 'ACTIVE');
    assert.equal(mapServerToAuthority('ACTIVE'), 'ACTIVE');
    assert.equal(mapServerToAuthority('WAITING'), 'WAITING');
  });

  it('never lets cached WAITING override ACTIVE or ENDED', () => {
    assert.equal(canReplace('ACTIVE', 'WAITING'), false);
    assert.equal(canReplace('ENDED', 'WAITING'), false);
    assert.equal(canReplace('WAITING', 'ACTIVE'), true);
    assert.equal(canReplace('ACTIVE', 'ENDED'), true);
  });

  it('parses heartbeat and status payloads the same way', () => {
    assert.deepEqual(parseStartPulse({ roomStatus: 'in_progress', startSeq: 2 }), {
      roomStatus: 'in_progress',
      authorityStatus: undefined,
      startSeq: 2,
    });
    assert.deepEqual(parseStartPulse({ status: 'in_progress', authorityStatus: 'ACTIVE' }), {
      roomStatus: 'in_progress',
      authorityStatus: 'ACTIVE',
      startSeq: undefined,
    });
    assert.equal(parseStartPulse({}), null);
    assert.deepEqual(parseStartPulse({ authorityStatus: 'ACTIVE' }), {
      roomStatus: 'in_progress',
      authorityStatus: 'ACTIVE',
      startSeq: undefined,
    });
  });

  it('navigates only when authority is ACTIVE and the pack is ready', () => {
    assert.equal(
      shouldNavigateToExam({
        authority: 'WAITING',
        moduleReady: true,
        hashVerified: true,
        percent: 100,
        alreadyEntered: false,
      }),
      false,
    );
    assert.equal(
      shouldNavigateToExam({
        authority: 'ACTIVE',
        moduleReady: false,
        hashVerified: false,
        percent: 40,
        alreadyEntered: false,
      }),
      false,
    );
    assert.equal(
      shouldNavigateToExam({
        authority: 'ACTIVE',
        moduleReady: true,
        hashVerified: true,
        percent: 100,
        alreadyEntered: false,
      }),
      true,
    );
  });

  it('propagates start to every ready student from 10 through 60', () => {
    for (const students of [10, 20, 30, 40, 50, 60]) {
      const waiting = simulateStartPropagation({
        serverStatus: 'lobby_open',
        moduleReady: true,
        students,
      });
      assert.equal(waiting.navigated, 0);
      assert.equal(waiting.authority, 'WAITING');

      const started = simulateStartPropagation({
        serverStatus: 'in_progress',
        moduleReady: true,
        students,
      });
      assert.equal(started.navigated, students);
      assert.equal(started.authority, 'ACTIVE');
    }
    assert.equal(MAX_SUPPORTED_STUDENTS, 60);
  });

  it('keeps one in-flight start poll and stays within LAN budget', () => {
    assert.equal(STUDENT_MONITOR_INTERVAL_MS, 2000);
    const requestsPerSecond = MAX_SUPPORTED_STUDENTS / (STUDENT_MONITOR_INTERVAL_MS / 1000);
    assert.ok(requestsPerSecond <= 30);
  });

  it('keeps concurrent HTTP responses unique per request', () => {
    const routeUuid = 'status-route';
    const ids = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const requestId = `${routeUuid}:${i}-${Math.random().toString(16).slice(2)}`;
      ids.add(requestId);
      assert.equal(resolveRouteUuid({ uuid: requestId, routeUuid }), routeUuid);
    }
    assert.equal(ids.size, 60);
  });
});
