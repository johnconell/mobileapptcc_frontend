import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasValidLocalStudentParticipation,
  RECONNECT_EXIT_AFTER_MS,
  shouldOfferReconnectExit,
} from './reconnectExitPolicy';

test('a failed manual reconnect immediately offers an offline exit', () => {
  assert.equal(shouldOfferReconnectExit(0, true), true);
});

test('a continuing outage offers an exit after 60 seconds', () => {
  assert.equal(shouldOfferReconnectExit(RECONNECT_EXIT_AFTER_MS - 1), false);
  assert.equal(shouldOfferReconnectExit(RECONNECT_EXIT_AFTER_MS), true);
});

test('a saved token is valid only with matching session progress and student identity', () => {
  assert.equal(
    hasValidLocalStudentParticipation('token-a', {
      sessionId: 'session-a',
      participationToken: 'token-a',
      applicantCode: 'APPLICANT-A',
    }),
    true,
  );
  assert.equal(
    hasValidLocalStudentParticipation('token-a', {
      sessionId: 'session-a',
      participationToken: 'token-b',
      applicantCode: 'APPLICANT-A',
    }),
    false,
  );
  assert.equal(hasValidLocalStudentParticipation('token-a', null), false);
});
