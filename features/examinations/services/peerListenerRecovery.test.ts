import assert from 'node:assert/strict';
import test from 'node:test';
import { peerListenerRecoveryAction } from './peerListenerRecovery';

test('keeps recovery active through Wi-Fi A disconnect and rebinds on Wi-Fi B', () => {
  assert.equal(
    peerListenerRecoveryAction({
      hasActiveSession: true,
      previousHost: '192.168.10.20',
      nextHost: null,
      listenerState: 'live',
    }),
    'mark_unavailable',
  );
  assert.equal(
    peerListenerRecoveryAction({
      hasActiveSession: true,
      previousHost: null,
      nextHost: '192.168.20.35',
      listenerState: 'unavailable',
    }),
    'rebind',
  );
});

test('retries an active listener that stopped even when the IP is unchanged', () => {
  assert.equal(
    peerListenerRecoveryAction({
      hasActiveSession: true,
      previousHost: '192.168.20.35',
      nextHost: '192.168.20.35',
      listenerState: 'stopped',
    }),
    'rebind',
  );
});

test('rebinds when the Wi-Fi interface changes but DHCP keeps the same IP', () => {
  assert.equal(
    peerListenerRecoveryAction({
      hasActiveSession: true,
      previousHost: '192.168.20.35',
      nextHost: '192.168.20.35',
      previousNetworkKey: 'WIFI|EXAM-A|aa:bb:cc:dd:ee:01|192.168.20.35',
      nextNetworkKey: 'WIFI|EXAM-B|aa:bb:cc:dd:ee:02|192.168.20.35',
      listenerState: 'live',
    }),
    'rebind',
  );
});

test('never starts listener recovery for an ended or cleared examination', () => {
  assert.equal(
    peerListenerRecoveryAction({
      hasActiveSession: false,
      previousHost: '192.168.10.20',
      nextHost: '192.168.20.35',
      listenerState: 'stopped',
    }),
    'none',
  );
});
