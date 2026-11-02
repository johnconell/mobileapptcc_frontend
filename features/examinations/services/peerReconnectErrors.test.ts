import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPeerReconnectError } from './peerReconnectErrors';

test('reconnect errors preserve the reason the proctor returned', () => {
  assert.equal(classifyPeerReconnectError('Invalid reconnect PIN.'), 'Reconnect PIN required');
  assert.equal(classifyPeerReconnectError('Reconnect PIN has expired.'), 'Reconnect PIN expired');
  assert.equal(classifyPeerReconnectError('You have been removed from this examination.'), 'Removed by proctor');
  assert.equal(classifyPeerReconnectError('Session not found.'), 'Session ended');
  assert.equal(classifyPeerReconnectError('Cannot reach the proctor phone.'), 'Cannot reach the proctor');
  assert.equal(
    classifyPeerReconnectError('Local network access was blocked'),
    'Local network access denied. Please allow Local Network in iOS Settings > TCC Entrance Exam.',
  );
  assert.equal(
    classifyPeerReconnectError('Connection timed out'),
    'Connection to proctor timed out. Please check your Wi-Fi signal.',
  );
});
